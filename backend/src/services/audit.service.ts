import { PoolClient } from 'pg';
import { query } from '../db/pool';
import type { AuditAction } from '../types';

interface AuditEntry {
  userId: string | null;
  eventId?: string | null;
  action: AuditAction;
  targetId?: string | null;
  targetType?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Write an admin audit log entry.
 * Pass a PoolClient to include the write inside an existing transaction.
 */
export async function logAudit(
  entry: AuditEntry,
  client?: PoolClient
): Promise<void> {
  const sql = `
    INSERT INTO admin_audit_logs
      (user_id, event_id, action, target_id, target_type, details, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `;
  const params = [
    entry.userId,
    entry.eventId ?? null,
    entry.action,
    entry.targetId ?? null,
    entry.targetType ?? null,
    entry.details ? JSON.stringify(entry.details) : null,
    entry.ipAddress ?? null,
  ];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}
