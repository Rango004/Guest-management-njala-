import { Router } from 'express';
import { requireGateOfficer } from '../../middleware/auth';
import { gateScanLimiter } from '../../middleware/rateLimiter';
import { validateQr, getGateConfig } from './gate.controller';

const router = Router();

router.use(requireGateOfficer);

// GET  /api/gate/config  — gate info for the officer's assigned gate
router.get('/config', getGateConfig);

// POST /api/gate/validate  — QR scan validation
// gateScanLimiter keyed by device_id header (120 scans/min per device)
router.post('/validate', gateScanLimiter, validateQr);

export default router;
