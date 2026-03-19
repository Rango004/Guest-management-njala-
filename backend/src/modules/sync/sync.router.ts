import { Router } from 'express';
import { requireGateOfficer, requireSuperAdmin } from '../../middleware/auth';
import { downloadDataset, pushCheckins, reconcile } from './sync.controller';

const router = Router();

// Gate officer routes
// GET /api/sync/dataset — full pass dataset for offline use
router.get('/dataset', requireGateOfficer, downloadDataset);

// POST /api/sync/checkins — push offline check-ins, receive delta
router.post('/checkins', requireGateOfficer, pushCheckins);

// Admin route
// POST /api/sync/events/:eventId/reconcile — post-event duplicate detection
router.post('/events/:eventId/reconcile', requireSuperAdmin, reconcile);

export default router;
