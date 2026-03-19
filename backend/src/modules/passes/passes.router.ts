import { Router } from 'express';
import { requireGraduate, requireSuperAdmin } from '../../middleware/auth';
import {
  getMyPasses, requestGuestPass, requestVehiclePass, cancelPass, emailPass,
  listPassesByEvent, revokePass,
} from './passes.controller';

// ── Graduate portal routes (/api/portal/passes) ───────────────────────────────
export const portalPassesRouter = Router();
portalPassesRouter.use(requireGraduate);

portalPassesRouter.get('/',                  getMyPasses);
portalPassesRouter.post('/guest',            requestGuestPass);
portalPassesRouter.post('/vehicle',          requestVehiclePass);
portalPassesRouter.delete('/:passId',        cancelPass);
portalPassesRouter.post('/:passId/email',    emailPass);

// ── Admin pass management routes (/api/events/:id/passes) ────────────────────
export const adminPassesRouter = Router({ mergeParams: true });
adminPassesRouter.use(requireSuperAdmin);

adminPassesRouter.get('/',                   listPassesByEvent);
adminPassesRouter.post('/:passId/revoke',    revokePass);
