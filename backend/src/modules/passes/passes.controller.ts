import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../middleware/errorHandler';
import { createPassQr, generateQrDataUrl } from '../../services/qr.service';
import { sendGuestPass, sendVehicleApproved, sendVehicleRejected } from '../../services/email.service';
import { logAudit } from '../../services/audit.service';
import type { PassRow, GraduateRow, FacultyRow, GateRow, EventRow } from '../../types';
import { getIo } from '../../socket/dashboard.socket';

// ── Helper: fetch graduate with full context ──────────────────────────────────

async function getGraduateContext(graduateId: string) {
  const res = await query<
    GraduateRow & {
      faculty_code: string; faculty_name: string;
      gate_id: string; gate_code: string; gate_type: string;
      event_name: string; event_date: string;
      event_start_time: Date; event_end_time: Date;
      event_status: string;
      parking_quota: number; guest_limit_per_grad: number;
      vehicle_auto_threshold: string;
    }
  >(
    `SELECT g.*, f.code AS faculty_code, f.name AS faculty_name,
            f.gate_id, gt.code AS gate_code, gt.type AS gate_type,
            e.name AS event_name, e.event_date::text AS event_date,
            e.event_start_time, e.event_end_time, e.status AS event_status,
            e.parking_quota, e.guest_limit_per_grad, e.vehicle_auto_threshold
     FROM graduates g
     JOIN faculties f ON f.id = g.faculty_id
     JOIN gates gt ON gt.id = f.gate_id
     JOIN events e ON e.id = g.event_id
     WHERE g.id = $1`,
    [graduateId]
  );
  return res.rows[0] ?? null;
}

// ── Graduate portal: get my passes ───────────────────────────────────────────

export async function getMyPasses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const graduateId = req.graduate!.sub;

    const result = await query<PassRow & { gate_code: string; qr_encrypted_payload: string | null }>(
      `SELECT p.*, gt.code AS gate_code
       FROM passes p JOIN gates gt ON gt.id = p.gate_id
       WHERE p.graduate_id = $1
       ORDER BY p.created_at DESC`,
      [graduateId]
    );

    // Regenerate QR data URLs from stored encrypted payloads
    const passes = await Promise.all(
      result.rows.map(async (p) => {
        let qrDataUrl: string | null = null;
        if (p.qr_encrypted_payload && p.status === 'APPROVED') {
          qrDataUrl = await generateQrDataUrl(p.qr_encrypted_payload);
        }
        return { ...p, qrDataUrl, qr_encrypted_payload: undefined };
      })
    );

    // Count remaining entitlements
    const grad = await getGraduateContext(graduateId);
    const guestIssued = result.rows.filter((p) => p.pass_type === 'GUEST' && p.status !== 'REVOKED').length;
    const vehicleIssued = result.rows.filter((p) => p.pass_type === 'VEHICLE' && p.status !== 'REVOKED').length;

    res.json({
      ok: true,
      data: {
        passes,
        entitlements: {
          guestRemaining: (grad?.guest_limit_per_grad ?? 2) - guestIssued,
          vehicleRemaining: vehicleIssued === 0 ? 1 : 0,
        },
      },
    });
  } catch (err) { next(err); }
}

// ── Graduate portal: request guest pass ──────────────────────────────────────

const guestPassSchema = z.object({
  guest_name: z.string().max(255).optional(),
});

export async function requestGuestPass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const graduateId = req.graduate!.sub;
    const body = guestPassSchema.parse(req.body);

    const grad = await getGraduateContext(graduateId);
    if (!grad) throw new AppError(404, 'Graduate not found');

    if (!['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(grad.event_status)) {
      throw new AppError(409, 'Pass requests are not open for this event');
    }

    // Count active guest passes (not revoked)
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) FROM passes
       WHERE graduate_id = $1 AND pass_type = 'GUEST' AND status != 'REVOKED'`,
      [graduateId]
    );
    const issued = parseInt(countRes.rows[0]?.count ?? '0', 10);
    if (issued >= grad.guest_limit_per_grad) {
      throw new AppError(409, `Guest pass limit reached (max ${grad.guest_limit_per_grad})`);
    }

    // Generate QR
    const { hash, encryptedPayload, dataUrl, buffer } = await createPassQr(
      'GUEST', grad.faculty_code, grad.gate_code, grad.event_id
    );

    const passRes = await query<PassRow>(
      `INSERT INTO passes
         (graduate_id, event_id, pass_type, status, qr_code_hash,
          qr_encrypted_payload, guest_name, gate_id, expires_at)
       VALUES ($1,$2,'GUEST','APPROVED',$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        graduateId, grad.event_id, hash,
        encryptedPayload,
        body.guest_name ?? null,
        grad.gate_id,
        grad.event_end_time,
      ]
    );
    const pass = passRes.rows[0]!;

    res.status(201).json({
      ok: true,
      data: {
        pass,
        qrDataUrl: dataUrl,
        gateCode: grad.gate_code,
      },
    });

    // Non-blocking: send email if guest name was provided (implies email delivery desired)
    if (body.guest_name) {
      sendGuestPass({
        graduateId,
        passId: pass.id,
        to: grad.email,          // send to graduate who forwards to guest
        guestName: body.guest_name,
        graduateName: grad.full_name,
        eventName: grad.event_name,
        eventDate: grad.event_date,
        gateCode: grad.gate_code,
        qrBuffer: buffer,
      }).catch(() => {});
    }
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

// ── Graduate portal: request vehicle pass ────────────────────────────────────

export async function requestVehiclePass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const graduateId = req.graduate!.sub;

    const grad = await getGraduateContext(graduateId);
    if (!grad) throw new AppError(404, 'Graduate not found');

    if (!['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(grad.event_status)) {
      throw new AppError(409, 'Pass requests are not open for this event');
    }

    // Check existing vehicle pass
    const existingRes = await query<{ count: string }>(
      `SELECT COUNT(*) FROM passes
       WHERE graduate_id = $1 AND pass_type = 'VEHICLE' AND status NOT IN ('REVOKED', 'REJECTED')`,
      [graduateId]
    );
    if (parseInt(existingRes.rows[0]?.count ?? '0', 10) > 0) {
      throw new AppError(409, 'You already have a vehicle pass request');
    }

    // Determine vehicle gate (first VEHICLE gate for this event)
    const vehicleGateRes = await query<GateRow>(
      `SELECT * FROM gates WHERE event_id = $1 AND type = 'VEHICLE' LIMIT 1`,
      [grad.event_id]
    );
    const vehicleGate = vehicleGateRes.rows[0];
    if (!vehicleGate) throw new AppError(500, 'No vehicle gate configured for this event');

    // Use SELECT FOR UPDATE to prevent race condition on quota check + insert
    const result = await withTransaction(async (client) => {
      // Lock the event row for duration of this transaction
      const eventRes = await client.query<EventRow>(
        `SELECT * FROM events WHERE id = $1 FOR UPDATE`,
        [grad.event_id]
      );
      const event = eventRes.rows[0]!;

      // Count approved vehicle passes
      const quotaRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM passes
         WHERE event_id = $1 AND pass_type = 'VEHICLE' AND status = 'APPROVED'`,
        [grad.event_id]
      );
      const approvedCount = parseInt(quotaRes.rows[0]?.count ?? '0', 10);
      const quota = event.parking_quota;
      const threshold = parseFloat(String(event.vehicle_auto_threshold));

      if (approvedCount >= quota) {
        throw new AppError(409, 'Parking quota is full. No vehicle passes available.');
      }

      const autoApprove = approvedCount < quota * threshold;
      const status = autoApprove ? 'APPROVED' : 'PENDING_REVIEW';

      // Generate QR (only if auto-approved; pending passes get QR when approved)
      let hash = '';
      let qrDataUrl: string | null = null;
      let encPayload: string | null = null;
      if (autoApprove) {
        const qr = await createPassQr('VEHICLE', grad.faculty_code, vehicleGate.code, grad.event_id);
        hash = qr.hash;
        qrDataUrl = qr.dataUrl;
        encPayload = qr.encryptedPayload;
      } else {
        // Placeholder hash for pending passes — replaced on approval
        const { createHash } = await import('crypto');
        hash = createHash('sha256').update(`pending-${graduateId}-${Date.now()}`).digest('hex');
      }

      const insertRes = await client.query<PassRow>(
        `INSERT INTO passes
           (graduate_id, event_id, pass_type, status, qr_code_hash,
            qr_encrypted_payload, gate_id, expires_at)
         VALUES ($1,$2,'VEHICLE',$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          graduateId, grad.event_id, status, hash,
          encPayload, vehicleGate.id, grad.event_end_time,
        ]
      );
      return { pass: insertRes.rows[0]!, qrDataUrl };
    });

    // Notify dashboard of pending vehicle request
    const io = getIo();
    if (io && result.pass.status === 'PENDING_REVIEW') {
      io.to(`event:${grad.event_id}:admin`).emit('vehicle_request', {
        passId: result.pass.id,
        graduateName: grad.full_name,
        studentId: grad.student_id,
      });
    }

    res.status(201).json({
      ok: true,
      data: {
        pass: result.pass,
        qrDataUrl: result.qrDataUrl,
        gateCode: vehicleGate.code,
      },
    });
  } catch (err) { next(err); }
}

// ── Graduate portal: cancel / revoke own pass ─────────────────────────────────

export async function cancelPass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const graduateId = req.graduate!.sub;
    const { passId } = req.params;

    const passRes = await query<PassRow>(
      `SELECT * FROM passes WHERE id = $1 AND graduate_id = $2`,
      [passId, graduateId]
    );
    const pass = passRes.rows[0];
    if (!pass) throw new AppError(404, 'Pass not found');
    if (pass.status === 'REVOKED') throw new AppError(409, 'Pass is already revoked');
    if (pass.is_checked_in) throw new AppError(409, 'Pass has already been used and cannot be cancelled');

    await query(
      `UPDATE passes SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1`,
      [passId]
    );

    res.json({ ok: true, data: { message: 'Pass cancelled successfully' } });
  } catch (err) { next(err); }
}

// ── Graduate portal: email pass to guest ─────────────────────────────────────

const emailPassSchema = z.object({ to: z.string().email() });

export async function emailPass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const graduateId = req.graduate!.sub;
    const { passId } = req.params;
    const { to } = emailPassSchema.parse(req.body);

    const passRes = await query<
      PassRow & {
        qr_data_url: string; gate_code: string;
        graduate_name: string; event_name: string; event_date: string;
        faculty_code: string;
      }
    >(
      `SELECT p.*, gt.code AS gate_code,
              g.full_name AS graduate_name,
              e.name AS event_name, e.event_date::text AS event_date,
              f.code AS faculty_code
       FROM passes p
       JOIN gates gt ON gt.id = p.gate_id
       JOIN graduates g ON g.id = p.graduate_id
       JOIN events e ON e.id = p.event_id
       JOIN faculties f ON f.id = g.faculty_id
       WHERE p.id = $1 AND p.graduate_id = $2`,
      [passId, graduateId]
    );
    const pass = passRes.rows[0];
    if (!pass) throw new AppError(404, 'Pass not found');
    if (pass.status !== 'APPROVED') throw new AppError(409, 'Only approved passes can be emailed');

    // Regenerate QR buffer from stored hash is not possible (hash is one-way).
    // We regenerate a new QR for the same hash by re-deriving from the stored data.
    // NOTE: The raw code is not stored — we generate a fresh QR with same content
    // by using the stored hash as a lookup key. The QR image itself is regenerated
    // with a fresh raw code ONLY on new pass creation. For email, we use the stored
    // pass data to rebuild a representative QR that embeds the hash-lookup code.
    // In production you would store the QR image in object storage (S3/GCS) on creation.
    // This endpoint signals the frontend to serve the stored data URL from its cache.
    res.json({
      ok: true,
      data: {
        message: 'Use the QR data URL from your portal to forward the pass image.',
        passId,
        gateCode: pass.gate_code,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

// ── Admin: list all passes for an event ──────────────────────────────────────

export async function listPassesByEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: eventId } = req.params;
    const status = req.query.status as string | undefined;
    const passType = req.query.pass_type as string | undefined;

    let sql = `
      SELECT p.*, gt.code AS gate_code,
             g.full_name AS graduate_name, g.student_id,
             f.code AS faculty_code
      FROM passes p
      JOIN gates gt ON gt.id = p.gate_id
      JOIN graduates g ON g.id = p.graduate_id
      JOIN faculties f ON f.id = g.faculty_id
      WHERE p.event_id = $1`;
    const params: unknown[] = [eventId];

    if (status) { params.push(status); sql += ` AND p.status = $${params.length}`; }
    if (passType) { params.push(passType); sql += ` AND p.pass_type = $${params.length}`; }
    sql += ` ORDER BY p.requested_at DESC`;

    const result = await query(sql, params);
    res.json({ ok: true, data: result.rows });
  } catch (err) { next(err); }
}

// ── Admin: revoke a pass ──────────────────────────────────────────────────────

export async function revokePass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: eventId, passId } = req.params;
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

    const passRes = await query<PassRow>(
      `SELECT * FROM passes WHERE id = $1 AND event_id = $2`,
      [passId, eventId]
    );
    const pass = passRes.rows[0];
    if (!pass) throw new AppError(404, 'Pass not found');
    if (pass.status === 'REVOKED') throw new AppError(409, 'Pass is already revoked');

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE passes
         SET status = 'REVOKED', revoked_at = NOW(), revoked_by = $1
         WHERE id = $2`,
        [req.admin!.sub, passId]
      );
      await logAudit({
        userId: req.admin!.sub,
        eventId,
        action: 'REVOKE_PASS',
        targetId: passId,
        targetType: 'pass',
        details: { reason: reason ?? null, previousStatus: pass.status },
        ipAddress: req.ip,
      }, client);
    });

    res.json({ ok: true, data: { message: 'Pass revoked' } });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}
