import rateLimit from 'express-rate-limit';
import { config } from '../config';

// General API rate limit — applied to all routes
export const generalLimiter = rateLimit({
  windowMs: config.rateLimit.general.windowMs,
  max: config.rateLimit.general.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please slow down.' },
});

// Stricter limit for the graduate login endpoint
// Mitigates brute-force of Student ID + receipt number pairs
export const graduateLoginLimiter = rateLimit({
  windowMs: config.rateLimit.graduate.windowMs,
  max: config.rateLimit.graduate.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${req.ip}-${(req.body as { student_id?: string })?.student_id ?? ''}`,
  message: {
    ok: false,
    error: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

// High-throughput limit for the gate validation endpoint
// Allows up to 2 scans/sec per device (keyed by device_id header)
export const gateScanLimiter = rateLimit({
  windowMs: config.rateLimit.gateValidation.windowMs,
  max: config.rateLimit.gateValidation.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.headers['x-device-id'] as string | undefined) ?? req.ip ?? 'unknown',
  message: {
    ok: false,
    error: 'Scan rate limit exceeded.',
  },
});
