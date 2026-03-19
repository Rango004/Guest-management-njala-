import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { AdminJwtPayload, GraduateJwtPayload, UserRole } from '../types';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

// ── Admin / Gate Officer authentication ──────────────────────────────────────

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret) as AdminJwtPayload;
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}

// Restrict to SUPER_ADMIN only
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAdmin(req, res, () => {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ ok: false, error: 'Super admin access required' });
      return;
    }
    next();
  });
}

// Restrict to one or more specific roles
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAdmin(req, res, () => {
      if (!req.admin || !roles.includes(req.admin.role)) {
        res.status(403).json({ ok: false, error: 'Insufficient permissions' });
        return;
      }
      next();
    });
  };
}

// Gate officers are only allowed to operate on their assigned gate
export function requireGateOfficer(req: Request, res: Response, next: NextFunction): void {
  requireAdmin(req, res, () => {
    if (req.admin?.role !== 'GATE_OFFICER' || !req.admin.gateId) {
      res.status(403).json({ ok: false, error: 'Gate officer access required' });
      return;
    }
    next();
  });
}

// ── Graduate portal authentication ───────────────────────────────────────────

export function requireGraduate(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret) as GraduateJwtPayload;
    if (payload.role !== 'GRADUATE') {
      res.status(403).json({ ok: false, error: 'Graduate access only' });
      return;
    }
    req.graduate = payload;
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}
