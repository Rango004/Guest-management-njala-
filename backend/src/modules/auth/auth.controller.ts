import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../../db/pool';
import { config } from '../../config';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../services/audit.service';
import { sendReceiptReset } from '../../services/email.service';
import type { UserRow, GraduateRow, FacultyRow, GateRow, AdminJwtPayload, GraduateJwtPayload } from '../../types';

// ── Admin / Gate Officer Login ────────────────────────────────────────────────

const adminLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function adminLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = adminLoginSchema.parse(req.body);

    const userRes = await query<UserRow>(
      `SELECT * FROM users WHERE username = $1 AND is_active = TRUE`,
      [body.username]
    );

    const user = userRes.rows[0];
    if (!user) {
      res.status(401).json({ ok: false, error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      res.status(401).json({ ok: false, error: 'Invalid credentials' });
      return;
    }

    // Update last login
    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    const payload: AdminJwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      ...(user.assigned_gate_id ? { gateId: user.assigned_gate_id } : {}),
    };

    // If gate officer, also resolve their event and gate code for convenience
    if (user.role === 'GATE_OFFICER' && user.assigned_gate_id) {
      const gateRes = await query<GateRow & { event_id: string }>(
        `SELECT * FROM gates WHERE id = $1`,
        [user.assigned_gate_id]
      );
      if (gateRes.rows[0]) {
        payload.eventId = gateRes.rows[0].event_id;
      }
    }

    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);

    res.json({
      ok: true,
      data: {
        token,
        role: user.role,
        username: user.username,
        gateId: user.assigned_gate_id ?? null,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(400, 'Validation error', err.issues));
      return;
    }
    next(err);
  }
}

// ── Graduate Portal Login ─────────────────────────────────────────────────────

const graduateLoginSchema = z.object({
  // event_id is no longer required — we resolve the active event automatically
  student_id:     z.string().min(1),
  receipt_number: z.string().min(1),
});

const MAX_ATTEMPTS = config.auth.maxLoginAttempts;
const LOCKOUT_MS   = config.auth.lockoutDurationMs;

export async function graduateLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = graduateLoginSchema.parse(req.body);

    // Look up the student across all non-archived events, prioritising the most
    // active one (LIVE > REGISTRATION_CLOSED > REGISTRATION_OPEN > CLOSED > DRAFT)
    const gradRes = await query<GraduateRow>(
      `SELECT g.* FROM graduates g
       JOIN events e ON e.id = g.event_id
       WHERE g.student_id = $1
         AND e.status != 'ARCHIVED'
       ORDER BY CASE e.status
         WHEN 'LIVE'                THEN 1
         WHEN 'REGISTRATION_CLOSED' THEN 2
         WHEN 'REGISTRATION_OPEN'   THEN 3
         WHEN 'CLOSED'              THEN 4
         ELSE 5
       END
       LIMIT 1`,
      [body.student_id]
    );

    const grad = gradRes.rows[0];
    if (!grad) {
      // Constant-time response to avoid timing attacks that reveal valid student IDs
      await bcrypt.compare('dummy', '$2b$10$invalidhashpaddingtoconstanttime');
      res.status(401).json({ ok: false, error: 'Invalid credentials' });
      return;
    }

    // Check lockout
    if (grad.locked_at) {
      const unlocksAt = new Date(grad.locked_at.getTime() + LOCKOUT_MS);
      if (new Date() < unlocksAt) {
        res.status(429).json({
          ok: false,
          error: 'Account temporarily locked due to too many failed attempts.',
          unlocksAt: unlocksAt.toISOString(),
        });
        return;
      }
      // Lockout expired — reset
      await query(
        `UPDATE graduates SET login_attempt_count = 0, locked_at = NULL WHERE id = $1`,
        [grad.id]
      );
    }

    const valid = await bcrypt.compare(body.receipt_number, grad.receipt_number_hash);

    if (!valid) {
      const newCount = grad.login_attempt_count + 1;
      if (newCount >= MAX_ATTEMPTS) {
        await query(
          `UPDATE graduates SET login_attempt_count = $1, locked_at = NOW() WHERE id = $2`,
          [newCount, grad.id]
        );
        res.status(429).json({
          ok: false,
          error: `Too many failed attempts. Account locked for ${LOCKOUT_MS / 60000} minutes.`,
        });
      } else {
        await query(
          `UPDATE graduates SET login_attempt_count = $1 WHERE id = $2`,
          [newCount, grad.id]
        );
        res.status(401).json({
          ok: false,
          error: `Invalid credentials. ${MAX_ATTEMPTS - newCount} attempt(s) remaining.`,
        });
      }
      return;
    }

    // Successful login — reset attempt counter
    await query(
      `UPDATE graduates SET login_attempt_count = 0, locked_at = NULL, last_login_at = NOW()
       WHERE id = $1`,
      [grad.id]
    );

    // Fetch gate info for the response
    const facultyRes = await query<FacultyRow & { gate_code: string }>(
      `SELECT f.*, g.code AS gate_code
       FROM faculties f JOIN gates g ON g.id = f.gate_id
       WHERE f.id = $1`,
      [grad.faculty_id]
    );
    const faculty = facultyRes.rows[0];

    const payload: GraduateJwtPayload = {
      sub: grad.id,
      studentId: grad.student_id,
      eventId: grad.event_id,
      role: 'GRADUATE',
    };

    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.graduateExpiresIn,
    } as jwt.SignOptions);

    res.json({
      ok: true,
      data: {
        token,
        graduateName: grad.full_name,
        studentId: grad.student_id,
        eventId: grad.event_id,
        gateCode: faculty?.gate_code ?? null,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(400, 'Validation error', err.issues));
      return;
    }
    next(err);
  }
}

// ── Graduate Receipt Reset (self-service) ─────────────────────────────────────

const forgotReceiptSchema = z.object({
  // event_id removed — resolved automatically from active event
  student_id: z.string().min(1),
  email:      z.string().email(),
});

export async function forgotReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = forgotReceiptSchema.parse(req.body);

    // Always return the same message to prevent information leakage
    const OK_RESPONSE = { ok: true, data: { message: 'If your details are correct, a reset email has been sent.' } };

    const gradRes = await query<GraduateRow & { event_name: string }>(
      `SELECT g.*, e.name AS event_name
       FROM graduates g
       JOIN events e ON e.id = g.event_id
       WHERE g.student_id = $1
         AND LOWER(g.email) = LOWER($2)
         AND e.status != 'ARCHIVED'
       ORDER BY CASE e.status
         WHEN 'LIVE'                THEN 1
         WHEN 'REGISTRATION_CLOSED' THEN 2
         WHEN 'REGISTRATION_OPEN'   THEN 3
         WHEN 'CLOSED'              THEN 4
         ELSE 5
       END
       LIMIT 1`,
      [body.student_id, body.email]
    );

    const grad = gradRes.rows[0];

    if (!grad) {
      // Waste time to prevent timing attacks
      await bcrypt.compare('dummy', '$2b$10$invalidhashpaddingtoconstanttime');
      res.json(OK_RESPONSE);
      return;
    }

    // Generate a new access PIN in XXXXX-XXXXX-XXXXX format
    const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(15);
    const chars = Array.from({ length: 15 }, (_, i) => PIN_ALPHABET[bytes[i]! % PIN_ALPHABET.length]!);
    const newReceipt = `${chars.slice(0, 5).join('')}-${chars.slice(5, 10).join('')}-${chars.slice(10, 15).join('')}`;
    const newHash = await bcrypt.hash(newReceipt, 10);

    await query(
      `UPDATE graduates
       SET receipt_number_hash = $1, login_attempt_count = 0, locked_at = NULL
       WHERE id = $2`,
      [newHash, grad.id]
    );

    await logAudit({
      userId: null,
      eventId: grad.event_id,
      action: 'RESET_RECEIPT',
      targetId: grad.id,
      targetType: 'graduate',
      details: { student_id: grad.student_id },
      ipAddress: req.ip,
    });

    sendReceiptReset({
      graduateId: grad.id,
      to: grad.email,
      graduateName: grad.full_name,
      studentId: grad.student_id,
      newReceiptNumber: newReceipt,
      eventName: (grad as GraduateRow & { event_name: string }).event_name,
      portalUrl: config.app.portalUrl,
    }).catch(() => {});

    res.json(OK_RESPONSE);
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(400, 'Validation error', err.issues));
      return;
    }
    next(err);
  }
}
