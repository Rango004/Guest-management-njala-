import { Router } from 'express';
import { requireSuperAdmin } from '../../middleware/auth';
import {
  listEvents, getEvent, createEvent, updateEvent, changeEventStatus,
  listGates, createGate, updateGate, deleteGate,
  listFaculties, createFaculty, updateFaculty, deleteFaculty,
} from './events.controller';

const router = Router();

// All event routes require super admin
router.use(requireSuperAdmin);

// Events
router.get('/',              listEvents);
router.post('/',             createEvent);
router.get('/:id',           getEvent);
router.patch('/:id',         updateEvent);
router.patch('/:id/status',  changeEventStatus);

// Gates
router.get('/:id/gates',                listGates);
router.post('/:id/gates',               createGate);
router.patch('/:id/gates/:gateId',      updateGate);
router.delete('/:id/gates/:gateId',     deleteGate);

// Faculties
router.get('/:id/faculties',                        listFaculties);
router.post('/:id/faculties',                       createFaculty);
router.patch('/:id/faculties/:facultyId',           updateFaculty);
router.delete('/:id/faculties/:facultyId',          deleteFaculty);

export default router;
