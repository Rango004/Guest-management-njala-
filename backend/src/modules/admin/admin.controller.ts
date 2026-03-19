import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../services/audit.service';
import { createPassQr } from '../../services/qr.service';
import { sendVehicleApproved, sendVehicleRejected } from '../../services/email.service';
import { getIo } from '../../socket/dashboard.socket';
import type { PassRow, GateRow, EventRow, UserRow } from '../../types';

// ── Dashboard metrics ─────────────────────────────────────────────────────────

export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { eventId } = req.params;

    const [
      checkinsPerGate,
      totalAdmitted,
      totalPasses,
      vehicleOccupancy,
      recentRejections,
      deviceStatus,
      scanRate,
    ] = await Promise.all([
      // Check-ins per gate
      query<{ gate_code: string; gate_type: string; count: string }>(
        `SELECT gt.code AS gate_code, gt.type AS gate_type, COUNT(vl.id)::text AS count
         FROM gates gt
         LEFT JOIN validation_logs vl ON vl.gate_id = gt.id AND vl.result = 'VALID'
         WHERE gt.event_id = $1
         GROUP BY gt.id, gt.code, gt.type
         ORDER BY gt.code`,
        [eventId]
      ),
      // Total admitted vs total issued
      query<{ admitted: string; total_issued: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE is_checked_in = TRUE)::text AS admitted,
           COUNT(*)::text AS total_issued
         FROM passes WHERE event_id = $1 AND status = 'APPROVED' AND pass_type = 'GUEST'`,
        [eventId]
      ),
      // All pass counts
      query<{ status: string; pass_type: string; count: string }>(
        `SELECT status, pass_type, COUNT(*)::text AS count
         FROM passes WHERE event_id = $1
         GROUP BY status, pass_type`,
        [eventId]
      ),
      // Parking occupancy
      query<{ approved: string; quota: string }>(
        `SELECT
           (SELECT COUNT(*) FROM passes WHERE event_id = $1 AND pass_type = 'VEHICLE' AND status = 'APPROVED')::text AS approved,
           parking_quota::text AS quota
         FROM events WHERE id = $1`,
        [eventId]
      ),
      // Last 20 rejections
      query<{ result: string; gate_code: string; scanned_at: Date; raw_code_prefix: string | null }>(
        `SELECT vl.result, gt.code AS gate_code, vl.scanned_at, vl.raw_code_prefix
         FROM validation_logs vl
         LEFT JOIN gates gt ON gt.id = vl.gate_id
         WHERE vl.event_id = $1 AND vl.result != 'VALID'
         ORDER BY vl.scanned_at DESC
         LIMIT 20`,
        [eventId]
      ),
      // Device sync status
      query<{ device_id: string; last_scan: Date; gate_code: string | null; scan_count: string }>(
        `SELECT vl.device_id,
                MAX(vl.scanned_at) AS last_scan,
                gt.code AS gate_code,
                COUNT(*)::text AS scan_count
         FROM validation_logs vl
         LEFT JOIN gates gt ON gt.id = vl.gate_id
         WHERE vl.event_id = $1
         GROUP BY vl.device_id, gt.code
         ORDER BY last_scan DESC`,
        [eventId]
      ),
      // Scan rate: scans in last 5 minutes per gate
      query<{ gate_code: string; scans_per_min: string }>(
        `SELECT gt.code AS gate_code,
                (COUNT(vl.id) / 5.0)::numeric(6,1)::text AS scans_per_min
         FROM gates gt
         LEFT JOIN validation_logs vl
           ON vl.gate_id = gt.id
           AND vl.scanned_at > NOW() - INTERVAL '5 minutes'
         WHERE gt.event_id = $1
         GROUP BY gt.id, gt.code
         ORDER BY gt.code`,
        [eventId]
      ),
    ]);

    res.json({
      ok: true,
      data: {
        checkinsPerGate: checkinsPerGate.rows,
        admission: totalAdmitted.rows[0],
        passCounts: totalPasses.rows,
        vehicleOccupancy: vehicleOccupancy.rows[0],
        recentRejections: recentRejections.rows,
        deviceStatus: deviceStatus.rows,
        scanRate: scanRate.rows,
      },
    });
  } catch (err) { next(err); }
}

// ── Vehicle pass approval queue ───────────────────────────────────────────────

export async function listPendingVehiclePasses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { eventId } = req.params;
    const result = await query<PassRow & { graduate_name: string; student_id: string; faculty_code: string }>(
      `SELECT p.*,
              g.full_name AS graduate_name, g.student_id,
              f.code AS faculty_code
       FROM passes p
       JOIN graduates g ON g.id = p.graduate_id
       JOIN faculties f ON f.id = g.faculty_id
       WHERE p.event_id = $1
         AND p.pass_type = 'VEHICLE'
         AND p.status = 'PENDING_REVIEW'
       ORDER BY p.requested_at ASC`,
      [eventId]
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function approveVehiclePass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { eventId, passId } = req.params;

    const pass = await withTransaction(async (client) => {
      // Re-check quota with lock
      const eventRes = await client.query<EventRow>(
        `SELECT * FROM events WHERE id = $1 FOR UPDATE`, [eventId]
      );
      const event = eventRes.rows[0]!;

      const quotaRes = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM passes WHERE event_id = $1 AND pass_type = 'VEHICLE' AND status = 'APPROVED'`,
        [eventId]
      );
      const approvedCount = parseInt(quotaRes.rows[0]?.count ?? '0', 10);
      if (approvedCount >= event.parking_quota) {
        throw new AppError(409, 'Parking quota is full. Cannot approve this pass.');
      }

      // Fetch the pass and graduate context
      const passRes = await client.query<PassRow & { faculty_code: string; gate_code: string; gate_id: string; graduate_email: string; graduate_name: string; event_end_time: Date }>(
        `SELECT p.*,
                f.code AS faculty_code, gt.code AS gate_code, gt.id AS gate_id,
                g.email AS graduate_email, g.full_name AS graduate_name,
                e.event_end_time
         FROM passes p
         JOIN graduates g ON g.id = p.graduate_id
         JOIN faculties f ON f.id = g.faculty_id
         JOIN gates gt ON gt.id = p.gate_id
         JOIN events e ON e.id = p.event_id
         WHERE p.id = $1 AND p.event_id = $2 AND p.status = 'PENDING_REVIEW'`,
        [passId, eventId]
      );
      const passRow = passRes.rows[0];
      if (!passRow) throw new AppError(404, 'Pending vehicle pass not found');

      // Generate QR now that it's approved
      const { hash } = await createPassQr('VEHICLE', passRow.faculty_code, passRow.gate_code, eventId);

      const updated = await client.query<PassRow>(
        `UPDATE passes
         SET status = 'APPROVED', qr_code_hash = $1, approved_by = $2
         WHERE id = $3
         RETURNING *`,
        [hash, req.admin!.sub, passId]
      );

      await logAudit({
        userId: req.admin!.sub,
        eventId,
        action: 'APPROVE_PASS',
        targetId: passId,
        targetType: 'pass',
        ipAddress: req.ip,
      }, client);

      return { pass: updated.rows[0]!, passRow };
    });

    // Send approval notification
    const { passRow } = pass;
    sendVehicleApproved({
      graduateId: passRow.graduate_id,
      passId,
      to: passRow.graduate_email,
      graduateName: passRow.graduate_name,
      eventName: passRow.event_id, // will be improved with proper event name
      eventDate: new Date(passRow.event_end_time).toDateString(),
      qrBuffer: Buffer.alloc(0), // frontend regenerates QR from portal
    }).catch(() => {});

    // Notify dashboard
    const io = getIo();
    if (io) io.to(`event:${eventId}:admin`).emit('vehicle_approved', { passId });

    res.json({ ok: true, data: pass.pass });
  } catch (err) { next(err); }
}

export async function rejectVehiclePass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { eventId, passId } = req.params;
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

    const passRes = await query<PassRow & { graduate_email: string; graduate_name: string }>(
      `SELECT p.*, g.email AS graduate_email, g.full_name AS graduate_name
       FROM passes p JOIN graduates g ON g.id = p.graduate_id
       WHERE p.id = $1 AND p.event_id = $2 AND p.status = 'PENDING_REVIEW'`,
      [passId, eventId]
    );
    const pass = passRes.rows[0];
    if (!pass) throw new AppError(404, 'Pending vehicle pass not found');

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE passes SET status = 'REJECTED', revoked_by = $1, revoked_at = NOW() WHERE id = $2`,
        [req.admin!.sub, passId]
      );
      await logAudit({
        userId: req.admin!.sub,
        eventId,
        action: 'REJECT_PASS',
        targetId: passId,
        targetType: 'pass',
        details: { reason: reason ?? null },
        ipAddress: req.ip,
      }, client);
    });

    sendVehicleRejected({
      graduateId: pass.graduate_id,
      passId,
      to: pass.graduate_email,
      graduateName: pass.graduate_name,
      eventName: eventId,
      reason,
    }).catch(() => {});

    res.json({ ok: true, data: { message: 'Vehicle pass rejected' } });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

// ── Audit logs ────────────────────────────────────────────────────────────────

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { eventId } = req.params;
    const page  = Math.max(1, parseInt(String(req.query.page  ?? 1), 10));
    const limit = Math.min(100, parseInt(String(req.query.limit ?? 50), 10));
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT al.*, u.username AS actor_username
       FROM admin_audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.event_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [eventId, limit, offset]
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) { next(err); }
}

// ── User management ───────────────────────────────────────────────────────────

const createUserSchema = z.object({
  username:        z.string().min(3).max(100),
  password:        z.string().min(8),
  role:            z.enum(['SUPER_ADMIN', 'GATE_OFFICER']),
  assigned_gate_id: z.string().uuid().optional(),
});

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createUserSchema.parse(req.body);

    if (body.role === 'GATE_OFFICER' && !body.assigned_gate_id) {
      throw new AppError(400, 'Gate officers must have an assigned gate');
    }

    const hash = await bcrypt.hash(body.password, 10);
    const result = await query<UserRow>(
      `INSERT INTO users (username, password_hash, role, assigned_gate_id)
       VALUES ($1,$2,$3,$4) RETURNING id, username, role, assigned_gate_id, is_active, created_at`,
      [body.username, hash, body.role, body.assigned_gate_id ?? null]
    );

    await logAudit({
      userId: req.admin!.sub,
      action: 'CREATE_USER',
      targetId: result.rows[0]!.id,
      targetType: 'user',
      details: { username: body.username, role: body.role },
      ipAddress: req.ip,
    });

    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

export async function listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await query<Omit<UserRow, 'password_hash'>>(
      `SELECT id, username, role, assigned_gate_id, is_active, created_at, last_login_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) { next(err); }
}

const resetPasswordSchema = z.object({
  new_password: z.string().min(8),
});

export async function resetUserPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.params;
    const { new_password } = resetPasswordSchema.parse(req.body);

    const userRes = await query<{ id: string; username: string }>(
      `SELECT id, username FROM users WHERE id = $1`,
      [userId]
    );
    if (!userRes.rows[0]) throw new AppError(404, 'User not found');

    const hash = await bcrypt.hash(new_password, 10);
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, userId]);

    await logAudit({
      userId: req.admin!.sub,
      action: 'RESET_USER_PASSWORD',
      targetId: userId,
      targetType: 'user',
      details: { username: userRes.rows[0].username },
      ipAddress: req.ip,
    });

    res.json({ ok: true, data: { message: 'Password reset successfully' } });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}
