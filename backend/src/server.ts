import { createServer } from 'http';
import app from './app';
import { initSocket } from './socket/dashboard.socket';
import { config } from './config';
import { pool } from './db/pool';

const httpServer = createServer(app);

// Attach Socket.io to the same HTTP server
initSocket(httpServer);

async function start(): Promise<void> {
  // Verify database connectivity before accepting traffic
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[DB] Connected to PostgreSQL');
  } catch (err) {
    console.error('[DB] Failed to connect:', err);
    process.exit(1);
  }

  httpServer.listen(config.port, () => {
    console.log(`[Server] Running on port ${config.port} (${config.nodeEnv})`);
    console.log(`[Server] Health: http://localhost:${config.port}/health`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received — shutting down gracefully');
  httpServer.close(async () => {
    await pool.end();
    console.log('[Server] Shut down complete');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});

start();
