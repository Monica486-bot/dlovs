import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as disputeController from '../controllers/disputeController';

const router = express.Router();
router.post('/', requireAuth, requireRole('citizen'), disputeController.flagDispute);
router.get('/', requireAuth, requireRole('land_officer', 'administrator'), disputeController.listDisputes);
router.put('/:id/resolve', requireAuth, requireRole('land_officer'), disputeController.resolveDispute);
export default router;
