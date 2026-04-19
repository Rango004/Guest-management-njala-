import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../middleware/errorHandler';
import { signingPublicKeyB64, encryptionKeyB64 } from '../../services/qr.service';
import type { SyncDataset, SyncPassRecord, ValidationLogRow } from '../../types';

// ── Pre-event dataset download ────────────────────────────────────────────────
//
// Gate devices call this endpoint the day before the ceremony.
// The response is the full validation dataset for their assigned gate,
// loaded into IndexedDB for offline scanning.
//
// Only passes that are APPROVED, non-revoked, and non-expired are included.
// This is the data that drives offline QR lookup.

export async function downloadDataset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { gateId, eventId } = req.admin!;
    if (!gateId || !eventId) throw new AppError(403, 'No gate assignment');

    // Verify event is at least REGISTRATION_CLOSED (data is stable enough to sync)
    const eventRes = await query<{ status: string; name: string; gate_open_time: string | null; event_end_time: string }>(
      `SELECT status, name, gate_open_time::text AS gate_open_time, event_end_time::text AS event_end_time FROM events WHERE id = $1`,
      [eventId]
    );
    const event = eventRes.rows[0];
    if (!event) throw new AppError(404, 'Event not found');
    if (event.status === 'DRAFT' || event.status === 'REGISTRATION_OPEN') {
      throw new AppError(409, 'Event is not ready for gate syncing yet. Please advance the event status to REGISTRATION_CLOSED or later.');
    }
    if (event.status === 'ARCHIVED') {
      throw new AppError(409, 'This event has been archived and is no longer active.');
    }

    // Load gate info
    const gateRes = await query<{ code: string; type: string; event_id: string }>(
      `SELECT code, type, event_id FROM gates WHERE id = $1`,
      [gateId]
    );
    const gate = gateRes.rows[0];
    if (!gate) throw new AppError(404, 'Gate not found');

    // Load all valid passes for this event
    // For PEDESTRIAN gates: only passes assigned to this gate
    // For VEHICLE gates: only VEHICLE passes
    // We include all so the device can show "wrong gate" messages with the correct gate code
    const passRes = await query<{
      pass_id: string; qr_code_hash: string; pass_type: string;
      status: string; gate_code: string; gate_type: string;
      faculty_code: string; guest_name: string | null;
      graduate_name: string; is_checked_in: boolean;
      checked_in_at: string | null; expires_at: string;
    }>(
      `SELECT p.id AS pass_id, p.qr_code_hash, p.pass_type, p.status,
              gt.code AS gate_code, gt.type AS gate_type,
              f.code AS faculty_code,
              p.guest_name,
              g.full_name AS graduate_name,
              p.is_checked_in,
              p.checked_in_at::text AS checked_in_at,
              p.expires_at::text AS expires_at
       FROM passes p
       JOIN gates gt ON gt.id = p.gate_id
       JOIN graduates g ON g.id = p.graduate_id
       JOIN faculties f ON f.id = g.faculty_id
       WHERE p.event_id = $1
         AND p.status = 'APPROVED'
         AND p.expires_at > NOW()
       ORDER BY p.created_at`,
      [eventId]
    );

    // Faculties assigned to this gate (for the PWA's allowed-list display)
    const facultyRes = await query<{ code: string }>(
      `SELECT code FROM faculties WHERE gate_id = $1`, [gateId]
    );

    const dataset: SyncDataset = {
      eventId,
      eventName: event.name,
      gateCode: gate.code,
      gateType: gate.type as SyncDataset['gateType'],
      allowedFaculties: facultyRes.rows.map((f) => f.code),
      passes: passRes.rows.map<SyncPassRecord>((r) => ({
        passId: r.pass_id,
        qrCodeHash: r.qr_code_hash,
        passType: r.pass_type as SyncPassRecord['passType'],
        status: r.status as SyncPassRecord['status'],
        gateCode: r.gate_code,
        gateType: r.gate_type as SyncPassRecord['gateType'],
        facultyCode: r.faculty_code,
        guestName: r.guest_name,
        graduateName: r.graduate_name,
        isCheckedIn: r.is_checked_in,
        checkedInAt: r.checked_in_at,
        expiresAt: r.expires_at,
      })),
      gateOpenTime:  event.gate_open_time  ?? undefined,
      eventEndTime:  event.event_end_time,
      generatedAt:   new Date().toISOString(),
      totalCount:    passRes.rows.length,
      // Crypto keys for offline QR decryption + signature verification
      signingPublicKey: signingPublicKeyB64,
      encryptionKey:    encryptionKeyB64,
    };

    res.json({ ok: true, data: dataset });
  } catch (err) { next(err); }
}

// ── Live sync: device pushes check-in log ────────────────────────────────────
//
// Called every 30 seconds when the device is online.
// Device uploads all un-synced local check-ins.
// Server returns any check-ins from other devices since the device's last sync.
//
// This enables:
// 1. Real-time dashboard updates
// 2. Cross-device check-in awareness (reduces ALREADY_USED false-positives)
// 3. Post-event reconciliation data collection

const checkinSchema = z.object({
  lastSyncAt: z.string().datetime({ offset: true }).optional(),
  checkins: z.array(z.object({
    passId:     z.string().uuid().nullable(),
    deviceId:   z.string().min(1),
    gateId:     z.string().uuid(),
    scannedAt:  z.string().datetime({ offset: true }),
    result:     z.enum(['VALID','ALREADY_USED','WRONG_GATE','INVALID','EXPIRED','REVOKED','NOT_APPROVED']),
    rawCodePrefix: z.string().max(4).nullable().optional(),
  })),
});

export async function pushCheckins(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { gateId, eventId } = req.admin!;
    if (!gateId || !eventId) throw new AppError(403, 'No gate assignment');

    const body = checkinSchema.parse(req.body);
    const now = new Date();
    // The calling device's own device_id — used to exclude its own logs from the delta response
    const callerDeviceId = body.checkins[0]?.deviceId ?? '';

    // Upsert incoming check-ins (idempotent — device may resend on retry)
    // We use a simple INSERT...ON CONFLICT DO NOTHING keyed on (device_id, scanned_at)
    // which is unique enough for our scale
    for (const ci of body.checkins) {
      await query(
        `INSERT INTO validation_logs
           (pass_id, event_id, device_id, gate_id, scanned_at, result, raw_code_prefix, synced, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
         ON CONFLICT (device_id, scanned_at) DO NOTHING`,
        [
          ci.passId, eventId, ci.deviceId, ci.gateId,
          new Date(ci.scannedAt), ci.result,
          ci.rawCodePrefix ?? null, now,
        ]
      ).catch(() => {/* silently skip conflict */});

      // If a VALID check-in is received, mark the pass as checked-in on server
      if (ci.result === 'VALID' && ci.passId) {
        await query(
          `UPDATE passes
           SET is_checked_in = TRUE, checked_in_at = COALESCE(checked_in_at, $1)
           WHERE id = $2 AND is_checked_in = FALSE`,
          [new Date(ci.scannedAt), ci.passId]
        );
      }
    }

    // Return new check-ins from other devices since last sync
    const since = body.lastSyncAt ? new Date(body.lastSyncAt) : new Date(Date.now() - 30_000);
    const deltaRes = await query<{
      pass_id: string | null; scanned_at: Date; result: string; device_id: string;
    }>(
      `SELECT pass_id, scanned_at, result, device_id
       FROM validation_logs
       WHERE event_id = $1
         AND scanned_at > $2
         AND device_id != $3
         AND result = 'VALID'
       ORDER BY scanned_at DESC`,
      [eventId, since, callerDeviceId]
    );

    res.json({
      ok: true,
      data: {
        received: body.checkins.length,
        delta: deltaRes.rows,
        serverTime: now.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

// ── Post-event reconciliation ─────────────────────────────────────────────────
//
// Admin triggers this after the event is CLOSED.
// Detects duplicate scans (same pass, multiple devices) and flags them.
// First-timestamp-wins: the canonical check-in is the earliest one.

export async function reconcile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { eventId } = req.params;

    const eventRes = await query<{ status: string }>(
      `SELECT status FROM events WHERE id = $1`, [eventId]
    );
    if (eventRes.rows[0]?.status !== 'CLOSED') {
      throw new AppError(409, 'Reconciliation can only run on CLOSED events');
    }

    // Find passes with more than one VALID scan
    const duplicatesRes = await query<{ pass_id: string; scan_count: string }>(
      `SELECT pass_id, COUNT(*)::text AS scan_count
       FROM validation_logs
       WHERE event_id = $1 AND result = 'VALID' AND pass_id IS NOT NULL
       GROUP BY pass_id
       HAVING COUNT(*) > 1`,
      [eventId]
    );

    let duplicatesFound = 0;
    let duplicatesResolved = 0;

    for (const dup of duplicatesRes.rows) {
      duplicatesFound++;

      // Get all VALID scans for this pass, ordered by scanned_at ASC
      const scansRes = await query<ValidationLogRow>(
        `SELECT * FROM validation_logs
         WHERE pass_id = $1 AND result = 'VALID'
         ORDER BY scanned_at ASC`,
        [dup.pass_id]
      );

      const scans = scansRes.rows;
      // First scan = canonical; rest = duplicates
      await withTransaction(async (client) => {
        for (let i = 1; i < scans.length; i++) {
          await client.query(
            `UPDATE validation_logs
             SET conflict_status = 'DUPLICATE', synced_at = NOW()
             WHERE id = $1`,
            [scans[i]!.id]
          );
        }
        // Mark canonical as RESOLVED (no conflict)
        await client.query(
          `UPDATE validation_logs
           SET conflict_status = 'RESOLVED', synced_at = NOW()
           WHERE id = $1`,
          [scans[0]!.id]
        );
      });
      duplicatesResolved++;
    }

    // Generate attendance summary
    const summaryRes = await query<{ gate_code: string; admitted: string; total_issued: string }>(
      `SELECT gt.code AS gate_code,
              COUNT(p.id) FILTER (WHERE p.is_checked_in)::text AS admitted,
              COUNT(p.id)::text AS total_issued
       FROM gates gt
       LEFT JOIN passes p ON p.gate_id = gt.id AND p.status = 'APPROVED'
       WHERE gt.event_id = $1
       GROUP BY gt.id, gt.code
       ORDER BY gt.code`,
      [eventId]
    );

    res.json({
      ok: true,
      data: {
        duplicatesFound,
        duplicatesResolved,
        attendanceSummary: summaryRes.rows,
        message: 'Reconciliation complete. Check admin_audit_logs for full detail.',
      },
    });
  } catch (err) { next(err); }
}
