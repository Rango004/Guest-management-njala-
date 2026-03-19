import { Router } from 'express';
import { requireBankApiKey, issuePinForStudent } from './bank.controller';

const router = Router();

router.use(requireBankApiKey);

// POST /api/bank/issue-pin
// Bank calls this after confirming student payment; receives plaintext PIN to print on receipt
router.post('/issue-pin', issuePinForStudent);

export default router;
