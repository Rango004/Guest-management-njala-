/**
 * Seed script — creates the initial super-admin account.
 * Run once after schema migration:  npm run db:seed
 *
 * Credentials are read from env vars so they're never hardcoded:
 *   SEED_ADMIN_USERNAME  (default: admin)
 *   SEED_ADMIN_PASSWORD  (default: ChangeMe123! — change immediately after first login)
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from './pool';

const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

async function seed() {
  const client = await pool.connect();
  try {
    // Idempotent — skip if a super-admin already exists
    const existing = await client.query(
      `SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1`
    );
    if (existing.rows.length > 0) {
      console.log('Super-admin already exists — skipping seed.');
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const res  = await client.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, 'SUPER_ADMIN')
       RETURNING id, username, role`,
      [username, hash]
    );

    console.log('✔ Super-admin created:');
    console.log(`  username: ${res.rows[0].username}`);
    console.log(`  password: ${password}`);
    console.log('  → Change the password after your first login!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
