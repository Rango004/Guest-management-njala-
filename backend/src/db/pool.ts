import { Pool, PoolClient } from 'pg';
import { config } from '../config';

export const pool = new Pool(config.db);

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// Convenience wrapper for single queries
export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) {
  const result = await pool.query<T>(text, params);
  return result;
}

// Transaction helper — passes a client to the callback and handles
// BEGIN / COMMIT / ROLLBACK automatically
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
