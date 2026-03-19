import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../middleware/errorHandler';
import { getIo } from '../../socket/dashboard.socket';
import type { PassRow, GateRow, ScanResult, ValidScanResponse, InvalidScanResponse } from '../../types';

// ── QR Validation — the critical path ────────────────────────────────────────
//
// Design decisions embedded here (resolves spec ambiguities QR-01, QR-02, GATE-01):
//
// QR-01: The QR image encodes JSON: { code, type, faculty, gate, eventId, hmac }
//        Gate PWA extracts the `code` field (17-char base62 raw code).
//
// QR-02: Gate PWA POSTs the raw code to this endpoint.
//        Server SHA-256 hashes it and looks up passes.qr_code_hash.
//        This keeps the gate lookup O(1) with a unique index.
//
// GATE-01: WRONG_GATE is triggered when:
//   (a) A GUEST pass is presented at a VEHICLE gate
//   (b) A VEHICLE pass is presented at a PEDESTRIAN gate
//   (c) The pass's assigned gate differs from the officer's assigned gate

const validateSchema = z.object({
  code:      z.string().length(17),
  device_id: z.string().min(1).max(100),
});

export async function validateQr(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = validateSchema.parse(req.body);
    const officer = req.admin!;

    if (!officer.gateId || !officer.eventId) {
      throw new AppError(403, 'Officer has no gate assignment');
    }

    const gateId  = officer.gateId;
    const eventId = officer.eventId;
    const deviceId = body.device_id;
    const rawCode  = body.code;
    const scannedAt = new Date();

    // Hash the raw code for DB lookup
    const codeHash = createHash('sha256').update(rawCode, 'utf8').digest('hex');
    const rawPrefix = rawCode.slice(0, 4); // for debugging only

    // Load officer's gate info
    const gateRes = await query<GateRow>(
      `SELECT * FROM gates WHERE id = $1 AND event_id = $2`,
      [gateId, eventId]
    );
    const officerGate = gateRes.rows[0];
    if (!officerGate) throw new AppError(500, 'Gate configuration error');

    // Verify the event is LIVE and gates are open
    const eventRes = await query<{ status: string; gate_open_time: Date; event_end_time: Date }>(
      `SELECT status, gate_open_time, event_end_time FROM events WHERE id = $1`,
      [eventId]
    );
    const eventRow = eventRes.rows[0];
    if (eventRow?.status !== 'LIVE') {
      throw new AppError(409, 'Event is not currently live. Scanning is disabled.');
    }
    const now = new Date();
    if (now < eventRow.gate_open_time) {
      throw new AppError(409, `Gates are not open yet. Opens at ${eventRow.gate_open_time.toISOString()}`);
    }
    if (now > eventRow.event_end_time) {
      throw new AppError(409, 'The event has ended. Scanning is no longer permitted.');
    }

    // Look up the pass by QR hash
    const passRes = await query<
      PassRow & {
        faculty_code: string; faculty_name: string;
        graduate_name: string; pass_gate_code: string; pass_gate_type: string;
      }
    >(
      `SELECT p.*,
              f.code AS faculty_code, f.name AS faculty_name,
              g.full_name AS graduate_name,
              gt.code AS pass_gate_code, gt.type AS pass_gate_type
       FROM passes p
       JOIN graduates g  ON g.id  = p.graduate_id
       JOIN faculties f  ON f.id  = g.faculty_id
       JOIN gates gt     ON gt.id = p.gate_id
       WHERE p.qr_code_hash = $1 AND p.event_id = $2`,
      [codeHash, eventId]
    );

    const pass = passRes.rows[0];

    // ── INVALID: QR not found ────────────────────────────────────────────────
    if (!pass) {
      await logScan({ passId: null, eventId, deviceId, gateId, scannedAt, result: 'INVALID', rawPrefix });
      const resp: InvalidScanResponse = { result: 'INVALID', reason: 'QR code not found in system' };
      res.json({ ok: true, data: resp });
      return;
    }

    // ── REVOKED ──────────────────────────────────────────────────────────────
    if (pass.status === 'REVOKED') {
      await logScan({ passId: pass.id, eventId, deviceId, gateId, scannedAt, result: 'REVOKED', rawPrefix });
      const resp: InvalidScanResponse = { result: 'REVOKED', reason: 'This pass has been revoked' };
      res.json({ ok: true, data: resp });
      return;
    }

    // ── NOT APPROVED ─────────────────────────────────────────────────────────
    if (pass.status !== 'APPROVED') {
      await logScan({ passId: pass.id, eventId, deviceId, gateId, scannedAt, result: 'NOT_APPROVED', rawPrefix });
      const resp: InvalidScanResponse = { result: 'NOT_APPROVED', reason: 'Pass has not been approved' };
      res.json({ ok: true, data: resp });
      return;
    }

    // ── EXPIRED ──────────────────────────────────────────────────────────────
    if (new Date() > pass.expires_at) {
      await logScan({ passId: pass.id, eventId, deviceId, gateId, scannedAt, result: 'EXPIRED', rawPrefix });
      const resp: InvalidScanResponse = { result: 'EXPIRED', reason: 'Pass has expired' };
      res.json({ ok: true, data: resp });
      return;
    }

    // ── WRONG_GATE checks ────────────────────────────────────────────────────
    // (a) Pass type vs gate type mismatch
    if (pass.pass_type === 'VEHICLE' && officerGate.type === 'PEDESTRIAN') {
      await logScan({ passId: pass.id, eventId, deviceId, gateId, scannedAt, result: 'WRONG_GATE', rawPrefix });
      const resp: InvalidScanResponse = {
        result: 'WRONG_GATE',
        reason: 'Vehicle pass — please proceed to the vehicle gate',
      };
      res.json({ ok: true, data: resp });
      return;
    }
    if (pass.pass_type === 'GUEST' && officerGate.type === 'VEHICLE') {
      await logScan({ passId: pass.id, eventId, deviceId, gateId, scannedAt, result: 'WRONG_GATE', rawPrefix });
      const resp: InvalidScanResponse = {
        result: 'WRONG_GATE',
        reason: 'Guest pass — please proceed to your faculty pedestrian gate',
        correctGate: pass.pass_gate_code,
      };
      res.json({ ok: true, data: resp });
      return;
    }

    // (b) Faculty gate mismatch (for pedestrian gates)
    if (officerGate.type === 'PEDESTRIAN' && pass.gate_id !== gateId) {
      await logScan({ passId: pass.id, eventId, deviceId, gateId, scannedAt, result: 'WRONG_GATE', rawPrefix });
      const resp: InvalidScanResponse = {
        result: 'WRONG_GATE',
        reason: `This pass is assigned to Gate ${pass.pass_gate_code}`,
        correctGate: pass.pass_gate_code,
      };
      res.json({ ok: true, data: resp });
      return;
    }

    // ── ALREADY USED ─────────────────────────────────────────────────────────
    if (pass.is_checked_in) {
      await logScan({ passId: pass.id, eventId, deviceId, gateId, scannedAt, result: 'ALREADY_USED', rawPrefix });
      const resp: InvalidScanResponse = {
        result: 'ALREADY_USED',
        reason: 'Pass has already been used',
        checkedInAt: pass.checked_in_at ?? undefined,
      };
      res.json({ ok: true, data: resp });
      return;
    }

    // ── VALID — mark checked in atomically ───────────────────────────────────
    // Use UPDATE ... WHERE is_checked_in = FALSE to handle the race condition
    // where two devices process the same QR simultaneously. Only one will win.
    const updateRes = await withTransaction(async (client) => {
      const r = await client.query<{ id: string }>(
        `UPDATE passes
         SET is_checked_in = TRUE, checked_in_at = $1
         WHERE id = $2 AND is_checked_in = FALSE
         RETURNING id`,
        [scannedAt, pass.id]
      );

      if (r.rows.length === 0) {
        // Another device beat us to it — treat as ALREADY_USED
        return null;
      }

      await logScan({ passId: pass.id, eventId, deviceId, gateId, scannedAt, result: 'VALID', rawPrefix }, client);
      return r.rows[0];
    });

    if (!updateRes) {
      // Lost the race — the pass was admitted by another device in the same window
      const resp: InvalidScanResponse = {
        result: 'ALREADY_USED',
        reason: 'Pass was just admitted at another scanner',
      };
      res.json({ ok: true, data: resp });
      return;
    }

    // Emit real-time check-in event to dashboard
    const io = getIo();
    if (io) {
      io.to(`event:${eventId}`).emit('checkin', {
        passId: pass.id,
        passType: pass.pass_type,
        gateId,
        gateCode: officerGate.code,
        facultyCode: pass.faculty_code,
        graduateName: pass.graduate_name,
        guestName: pass.guest_name ?? null,
        checkedInAt: scannedAt.toISOString(),
      });
    }

    const resp: ValidScanResponse = {
      result: 'VALID',
      guestName: pass.guest_name ?? 'Guest',
      passType: pass.pass_type,
      faculty: pass.faculty_code,
      gate: officerGate.code,
      passId: pass.id,
    };
    res.json({ ok: true, data: resp });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

// ── Gate config (for device UI on login) ─────────────────────────────────────

export async function getGateConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { gateId, eventId } = req.admin!;
    if (!gateId || !eventId) throw new AppError(403, 'No gate assignment');

    const result = await query<GateRow & { event_name: string; faculty_codes: string[] }>(
      `SELECT gt.*,
              e.name AS event_name,
              ARRAY_AGG(f.code) AS faculty_codes
       FROM gates gt
       JOIN events e ON e.id = gt.event_id
       LEFT JOIN faculties f ON f.gate_id = gt.id
       WHERE gt.id = $1
       GROUP BY gt.id, e.name`,
      [gateId]
    );

    if (!result.rows[0]) throw new AppError(404, 'Gate not found');
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

// ── Internal: write validation log ───────────────────────────────────────────

import { PoolClient } from 'pg';

async function logScan(
  opts: {
    passId: string | null;
    eventId: string;
    deviceId: string;
    gateId: string;
    scannedAt: Date;
    result: ScanResult;
    rawPrefix: string;
  },
  client?: PoolClient
): Promise<void> {
  const sql = `
    INSERT INTO validation_logs
      (pass_id, event_id, device_id, gate_id, scanned_at, result, raw_code_prefix)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `;
  const params = [
    opts.passId, opts.eventId, opts.deviceId, opts.gateId,
    opts.scannedAt, opts.result, opts.rawPrefix,
  ];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}
