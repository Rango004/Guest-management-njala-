/**
 * Bank integration endpoints.
 *
 * Banks call POST /api/bank/issue-pin after confirming a student's payment.
 * The system generates a fresh PIN for that student and returns it once —
 * the bank prints it on the payment receipt for the student to use on the portal.
 *
 * Authentication: X-Bank-Api-Key header must match BANK_API_KEY env var.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { query } from '../../db/pool';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../services/audit.service';
import type { GraduateRow } from '../../types';

const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePin(): string {
  const bytes = crypto.randomBytes(15);
  const chars = Array.from({ length: 15 }, (_, i) => PIN_ALPHABET[bytes[i]! % PIN_ALPHABET.length]!);
  return `${chars.slice(0, 5).join('')}-${chars.slice(5, 10).join('')}-${chars.slice(10, 15).join('')}`;
}

// ── Middleware: verify bank API key ───────────────────────────────────────────

export function requireBankApiKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.headers['x-bank-api-key'];
  const expected = process.env.BANK_API_KEY;

  if (!expected) {
    // BANK_API_KEY not configured — bank integration disabled
    res.status(503).json({ ok: false, error: 'Bank integration is not configured on this server.' });
    return;
  }
  if (!provided || provided !== expected) {
    res.status(401).json({ ok: false, error: 'Invalid or missing X-Bank-Api-Key header.' });
    return;
  }
  next();
}

// ── POST /api/bank/issue-pin ──────────────────────────────────────────────────
// Body: { student_id: string, event_id?: string }
// If event_id is omitted, the most recently active (non-ARCHIVED) event is used.

const issuePinSchema = z.object({
  student_id: z.string().min(1),
  event_id:   z.string().uuid().optional(),
});

export async function issuePinForStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = issuePinSchema.parse(req.body);

    // Resolve the event
    let eventId: string;
    if (body.event_id) {
      eventId = body.event_id;
    } else {
      const evRes = await query<{ id: string }>(
        `SELECT id FROM events
         WHERE status NOT IN ('ARCHIVED')
         ORDER BY event_date DESC
         LIMIT 1`
      );
      if (!evRes.rows[0]) throw new AppError(404, 'No active event found.');
      eventId = evRes.rows[0].id;
    }

    // Find the graduate in that event
    const gradRes = await query<GraduateRow>(
      `SELECT id, student_id, full_name FROM graduates
       WHERE event_id = $1 AND student_id = $2`,
      [eventId, body.student_id]
    );
    const grad = gradRes.rows[0];
    if (!grad) {
      throw new AppError(404, `Student ${body.student_id} is not registered for this event.`);
    }

    // Generate fresh PIN (invalidates previous one)
    const pin  = generatePin();
    const hash = await bcrypt.hash(pin, 10);
    await query(
      `UPDATE graduates SET receipt_number_hash = $1, login_attempt_count = 0, locked_at = NULL
       WHERE id = $2`,
      [hash, grad.id]
    );

    await logAudit({
      userId: null,
      eventId,
      action: 'BANK_ISSUE_PIN',
      targetId: grad.id,
      targetType: 'graduate',
      details: { student_id: body.student_id, source: 'bank_api' },
      ipAddress: req.ip,
    });

    res.json({
      ok: true,
      data: {
        student_id: grad.student_id,
        full_name:  grad.full_name,
        pin,           // plaintext — bank prints this on receipt
        event_id:   eventId,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}
