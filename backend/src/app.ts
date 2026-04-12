import express from 'express';
import cors from 'cors';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler, notFound } from './middleware/errorHandler';

// Routers
import authRouter       from './modules/auth/auth.router';
import eventsRouter     from './modules/events/events.router';
import graduatesRouter  from './modules/graduates/graduates.router';
import { portalPassesRouter, adminPassesRouter } from './modules/passes/passes.router';
import gateRouter       from './modules/gate/gate.router';
import adminRouter      from './modules/admin/admin.router';
import syncRouter       from './modules/sync/sync.router';
import bankRouter       from './modules/bank/bank.router';

const app = express();

// ── Core middleware ───────────────────────────────────────────────────────────

app.set('trust proxy', 1);         // Required for correct IP behind reverse proxy

// CORS — allow all localhost ports in dev, restrict to known origins in prod
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production') return true;

  const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean)
  );

  return (
    allowedOrigins.has(origin) ||
    origin === 'http://localhost' ||
    origin === 'https://localhost' ||
    origin === 'capacitor://localhost' ||
    origin === 'http://127.0.0.1' ||
    origin === 'https://127.0.0.1'
  );
}

app.use(cors({
  origin: (origin, callback) => {
    const allowed = isAllowedOrigin(origin);
    callback(allowed ? null : new Error(`CORS blocked origin: ${origin}`), allowed);
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Global rate limit
app.use(generalLimiter);

// Health check (unauthenticated — for load balancers)
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/api/auth',                   authRouter);
app.use('/api/events',                 eventsRouter);
app.use('/api/events/:id/graduates',   graduatesRouter);
app.use('/api/events/:id/passes',      adminPassesRouter);
app.use('/api/portal/passes',          portalPassesRouter);
app.use('/api/gate',                   gateRouter);
app.use('/api/admin',                  adminRouter);
app.use('/api/sync',                   syncRouter);
app.use('/api/bank',                   bankRouter);

// ── Error handling ────────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

export default app;
