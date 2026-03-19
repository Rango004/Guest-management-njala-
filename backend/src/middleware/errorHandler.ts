import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Human-readable messages for PostgreSQL constraint violations
const PG_CONSTRAINT_MESSAGES: Record<string, string> = {
  event_times_valid:        'End time must be after start time.',
  gate_open_before_end:     'Gate open time must be before the event end time.',
  event_date_matches_times: 'Event date must match the UTC date of the start time.',
};

export function errorHandler(
  err: Error & { code?: string; constraint?: string; detail?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      ok: false,
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // PostgreSQL errors — translate common codes into user-facing messages
  if (err.code) {
    switch (err.code) {
      case '23514': { // check_violation
        const msg = (err.constraint && PG_CONSTRAINT_MESSAGES[err.constraint])
          ?? `Data validation failed (constraint: ${err.constraint ?? 'unknown'}).`;
        res.status(400).json({ ok: false, error: msg });
        return;
      }
      case '23505': { // unique_violation
        res.status(409).json({ ok: false, error: `A record with those details already exists. ${err.detail ?? ''}`.trim() });
        return;
      }
      case '23503': { // foreign_key_violation
        res.status(409).json({ ok: false, error: 'This record is referenced by other data and cannot be removed.' });
        return;
      }
      case '23502': { // not_null_violation
        res.status(400).json({ ok: false, error: `A required field is missing: ${err.constraint ?? ''}.` });
        return;
      }
    }
  }

  // Unexpected error — log and return generic message
  console.error('[ERROR]', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ ok: false, error: 'Route not found' });
}
