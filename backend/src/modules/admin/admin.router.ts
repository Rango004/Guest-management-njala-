import { Router } from 'express';
import { requireSuperAdmin } from '../../middleware/auth';
import {
  getDashboard,
  listPendingVehiclePasses, approveVehiclePass, rejectVehiclePass,
  getAuditLogs,
  createUser, listUsers, resetUserPassword, updateUserAssignment,
} from './admin.controller';

const router = Router();
router.use(requireSuperAdmin);

// Dashboard
router.get('/events/:eventId/dashboard',        getDashboard);
router.get('/events/:eventId/audit-logs',       getAuditLogs);

// Vehicle pass approval queue
router.get('/events/:eventId/vehicle-requests',              listPendingVehiclePasses);
router.post('/events/:eventId/vehicle-requests/:passId/approve', approveVehiclePass);
router.post('/events/:eventId/vehicle-requests/:passId/reject',  rejectVehiclePass);

// User management
router.get('/users',                        listUsers);
router.post('/users',                       createUser);
router.patch('/users/:userId/password',     resetUserPassword);
router.patch('/users/:userId/assignment',   updateUserAssignment);

export default router;
