import { Router } from 'express';
import { adminLogin, graduateLogin, forgotReceipt } from './auth.controller';
import { graduateLoginLimiter } from '../../middleware/rateLimiter';

const router = Router();

// POST /api/auth/admin/login
router.post('/admin/login', adminLogin);

// POST /api/auth/graduate/login
router.post('/graduate/login', graduateLoginLimiter, graduateLogin);

// POST /api/auth/graduate/forgot-receipt  — self-service receipt number reset
router.post('/graduate/forgot-receipt', graduateLoginLimiter, forgotReceipt);

export default router;
