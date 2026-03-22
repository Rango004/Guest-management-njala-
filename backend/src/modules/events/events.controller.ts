import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../services/audit.service';
import type { EventRow, GateRow, FacultyRow, EventStatus } from '../../types';

// ── Validation schemas ────────────────────────────────────────────────────────

const createEventSchema = z.object({
  name:                   z.string().min(1).max(255),
  event_date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // derived from event_start_time if omitted
  event_start_time:       z.string().datetime({ offset: true }),
  event_end_time:         z.string().datetime({ offset: true }),
  gate_open_time:         z.string().datetime({ offset: true }).optional(),
  venue:                  z.string().max(255).optional(),
  parking_quota:          z.number().int().positive().default(200),
  guest_limit_per_grad:   z.number().int().positive().default(2),
  vehicle_auto_threshold: z.number().min(0).max(1).default(0.9),
});

const updateEventSchema = createEventSchema.partial();

const validTransitions: Record<EventStatus, EventStatus[]> = {
  DRAFT:               ['REGISTRATION_OPEN'],
  REGISTRATION_OPEN:   ['REGISTRATION_CLOSED'],
  REGISTRATION_CLOSED: ['LIVE', 'REGISTRATION_OPEN'],  // allow rollback before event day
  LIVE:                ['CLOSED'],
  CLOSED:              ['ARCHIVED'],
  ARCHIVED:            [],
};

// ── Events CRUD ───────────────────────────────────────────────────────────────

export async function listEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await query<EventRow>(
      `SELECT * FROM events ORDER BY event_date DESC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function getEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await query<EventRow>(`SELECT * FROM events WHERE id = $1`, [id]);
    if (!result.rows[0]) throw new AppError(404, 'Event not found');
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) { next(err); }
}

export async function createEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createEventSchema.parse(req.body);

    // Derive event_date from event_start_time (UTC) to satisfy the
    // event_date_matches_times check constraint regardless of client timezone.
    const derivedEventDate = new Date(body.event_start_time).toISOString().slice(0, 10);

    // Default gate_open_time to 1 hour before event_start_time if not provided
    const gateOpenTime = body.gate_open_time
      ?? new Date(new Date(body.event_start_time).getTime() - 60 * 60 * 1000).toISOString();

    const result = await query<EventRow>(
      `INSERT INTO events
         (name, event_date, event_start_time, event_end_time, gate_open_time, venue,
          parking_quota, guest_limit_per_grad, vehicle_auto_threshold)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        body.name, derivedEventDate, body.event_start_time, body.event_end_time,
        gateOpenTime, body.venue ?? null,
        body.parking_quota, body.guest_limit_per_grad, body.vehicle_auto_threshold,
      ]
    );

    const event = result.rows[0]!;
    await logAudit({
      userId: req.admin!.sub,
      eventId: event.id,
      action: 'CREATE_EVENT',
      targetId: event.id,
      targetType: 'event',
      details: { name: event.name },
      ipAddress: req.ip,
    });

    res.status(201).json({ ok: true, data: event });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

export async function updateEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateEventSchema.parse(req.body);

    const existing = await query<EventRow>(`SELECT * FROM events WHERE id = $1`, [id]);
    if (!existing.rows[0]) throw new AppError(404, 'Event not found');

    if (['LIVE', 'CLOSED', 'ARCHIVED'].includes(existing.rows[0].status)) {
      throw new AppError(409, 'Cannot edit an event that is LIVE, CLOSED, or ARCHIVED');
    }

    // Auto-derive event_date from event_start_time (UTC date) to keep the
    // event_date_matches_times check constraint satisfied regardless of the
    // client's local timezone.
    const derivedEventDate = body.event_start_time
      ? new Date(body.event_start_time).toISOString().slice(0, 10)
      : body.event_date ?? null;

    const result = await query<EventRow>(
      `UPDATE events SET
         name = COALESCE($1, name),
         event_date = COALESCE($2::date, event_date),
         event_start_time = COALESCE($3, event_start_time),
         event_end_time = COALESCE($4, event_end_time),
         gate_open_time = COALESCE($5, gate_open_time),
         venue = COALESCE($6, venue),
         parking_quota = COALESCE($7, parking_quota),
         guest_limit_per_grad = COALESCE($8, guest_limit_per_grad),
         vehicle_auto_threshold = COALESCE($9, vehicle_auto_threshold),
         updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        body.name ?? null, derivedEventDate,
        body.event_start_time ?? null, body.event_end_time ?? null,
        body.gate_open_time ?? null, body.venue ?? null,
        body.parking_quota ?? null, body.guest_limit_per_grad ?? null,
        body.vehicle_auto_threshold ?? null,
        id,
      ]
    );

    await logAudit({
      userId: req.admin!.sub,
      eventId: id,
      action: 'UPDATE_EVENT',
      targetId: id,
      targetType: 'event',
      details: body as Record<string, unknown>,
      ipAddress: req.ip,
    });

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

export async function changeEventStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = z.object({ status: z.enum(['REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','CLOSED','ARCHIVED']) }).parse(req.body);

    const existing = await query<EventRow>(`SELECT * FROM events WHERE id = $1`, [id]);
    if (!existing.rows[0]) throw new AppError(404, 'Event not found');

    const current = existing.rows[0].status;
    const allowed = validTransitions[current];
    if (!allowed.includes(status as EventStatus)) {
      throw new AppError(409, `Cannot transition event from ${current} to ${status}`);
    }

    const result = await query<EventRow>(
      `UPDATE events SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    await logAudit({
      userId: req.admin!.sub,
      eventId: id,
      action: 'CHANGE_EVENT_STATUS',
      targetId: id,
      targetType: 'event',
      details: { from: current, to: status },
      ipAddress: req.ip,
    });

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

// ── Gates ─────────────────────────────────────────────────────────────────────

const gateSchema = z.object({
  code:  z.string().min(1).max(10),
  type:  z.enum(['PEDESTRIAN', 'VEHICLE', 'GRADUATE']),
  label: z.string().max(100).optional(),
});

export async function listGates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await query<GateRow>(
      `SELECT * FROM gates WHERE event_id = $1 ORDER BY code`,
      [req.params.id]
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function createGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: eventId } = req.params;
    const body = gateSchema.parse(req.body);

    const result = await query<GateRow>(
      `INSERT INTO gates (event_id, code, type, label) VALUES ($1,$2,$3,$4) RETURNING *`,
      [eventId, body.code, body.type, body.label ?? null]
    );

    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

export async function updateGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: eventId, gateId } = req.params;
    const body = gateSchema.partial().parse(req.body);

    const result = await query<GateRow>(
      `UPDATE gates SET
         code  = COALESCE($1, code),
         type  = COALESCE($2::gate_type, type),
         label = COALESCE($3, label)
       WHERE id = $4 AND event_id = $5
       RETURNING *`,
      [body.code ?? null, body.type ?? null, body.label ?? null, gateId, eventId]
    );

    if (!result.rows[0]) throw new AppError(404, 'Gate not found');

    await logAudit({
      userId: req.admin!.sub,
      eventId,
      action: 'GATE_ASSIGNMENT_CHANGE',
      targetId: gateId,
      targetType: 'gate',
      details: body as Record<string, unknown>,
      ipAddress: req.ip,
    });

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

// ── Faculties ─────────────────────────────────────────────────────────────────

const facultySchema = z.object({
  name:    z.string().min(1).max(255),
  code:    z.string().min(1).max(10),
  gate_id: z.string().uuid(),
});

export async function listFaculties(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await query<FacultyRow & { gate_code: string; gate_type: string }>(
      `SELECT f.*, g.code AS gate_code, g.type AS gate_type
       FROM faculties f JOIN gates g ON g.id = f.gate_id
       WHERE f.event_id = $1
       ORDER BY f.code`,
      [req.params.id]
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function createFaculty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: eventId } = req.params;
    const body = facultySchema.parse(req.body);

    // Verify gate belongs to the same event
    const gateRes = await query<GateRow>(
      `SELECT id FROM gates WHERE id = $1 AND event_id = $2`,
      [body.gate_id, eventId]
    );
    if (!gateRes.rows[0]) throw new AppError(400, 'Gate not found in this event');

    const result = await query<FacultyRow>(
      `INSERT INTO faculties (event_id, name, code, gate_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [eventId, body.name, body.code, body.gate_id]
    );

    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

export async function updateFaculty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: eventId, facultyId } = req.params;
    const body = facultySchema.partial().parse(req.body);

    if (body.gate_id) {
      const gateRes = await query<GateRow>(
        `SELECT id FROM gates WHERE id = $1 AND event_id = $2`,
        [body.gate_id, eventId]
      );
      if (!gateRes.rows[0]) throw new AppError(400, 'Gate not found in this event');
    }

    const result = await query<FacultyRow>(
      `UPDATE faculties SET
         name    = COALESCE($1, name),
         code    = COALESCE($2, code),
         gate_id = COALESCE($3::uuid, gate_id)
       WHERE id = $4 AND event_id = $5
       RETURNING *`,
      [body.name ?? null, body.code ?? null, body.gate_id ?? null, facultyId, eventId]
    );

    if (!result.rows[0]) throw new AppError(404, 'Faculty not found');

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) { next(new AppError(400, 'Validation error', err.issues)); return; }
    next(err);
  }
}

export async function deleteFaculty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: eventId, facultyId } = req.params;
    await query(
      `DELETE FROM faculties WHERE id = $1 AND event_id = $2`,
      [facultyId, eventId]
    );
    res.json({ ok: true, data: null });
  } catch (err) { next(err); }
}

export async function deleteGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: eventId, gateId } = req.params;

    // Block if any faculty is still assigned to this gate
    const deps = await query(
      `SELECT id FROM faculties WHERE gate_id = $1 AND event_id = $2 LIMIT 1`,
      [gateId, eventId]
    );
    if (deps.rows.length > 0) {
      throw new AppError(409, 'Gate still has assigned faculties — reassign or delete them first');
    }

    const result = await query(
      `DELETE FROM gates WHERE id = $1 AND event_id = $2 RETURNING id`,
      [gateId, eventId]
    );
    if (!result.rows[0]) throw new AppError(404, 'Gate not found');

    res.json({ ok: true, data: null });
  } catch (err) { next(err); }
}
