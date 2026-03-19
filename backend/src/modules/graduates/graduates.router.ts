import { Router } from 'express';
import { requireSuperAdmin } from '../../middleware/auth';
import {
  importGraduates, listGraduates, getGraduate, deleteGraduate,
  resendCredentials, resetPin, bulkResetPins, upload,
} from './graduates.controller';

const router = Router({ mergeParams: true });

router.use(requireSuperAdmin);

// POST /api/events/:id/graduates/import  — CSV upload
router.post('/import', upload.single('file'), importGraduates);

// POST /api/events/:id/graduates/bulk-reset-pins
// Regenerates PINs for all graduates who have never logged in; returns plaintext list once
router.post('/bulk-reset-pins', bulkResetPins);

// GET  /api/events/:id/graduates
router.get('/', listGraduates);

// GET  /api/events/:id/graduates/:graduateId
router.get('/:graduateId', getGraduate);

// DELETE /api/events/:id/graduates/:graduateId
router.delete('/:graduateId', deleteGraduate);

// POST /api/events/:id/graduates/:graduateId/reset-pin
// Generates a new PIN for a single graduate; returns plaintext once
router.post('/:graduateId/reset-pin', resetPin);

// POST /api/events/:id/graduates/:graduateId/resend-credentials
// Resets PIN and sends email with new PIN
router.post('/:graduateId/resend-credentials', resendCredentials);

export default router;
