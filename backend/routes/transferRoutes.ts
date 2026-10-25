// Transfers waiting for the owner's consent (FR11): the owner's SMS code, or a
// second officer's approval of the written consent.
import express, { Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as c from '../controllers/transferController';

const router = express.Router();

router.param('id', (req: Request, res: Response, next: NextFunction, id: string) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Transfer not found' });
  next();
});

const officer = requireRole('land_officer');

router.get('/', requireAuth, requireRole('land_officer', 'administrator'), c.listPendingTransfers);
router.post('/:id/confirm', requireAuth, officer, c.confirmWithCode);
router.post('/:id/resend', requireAuth, officer, c.resendCode);
router.put('/:id/approve', requireAuth, officer, c.approveTransfer);
router.put('/:id/reject', requireAuth, officer, c.rejectTransfer);
router.put('/:id/cancel', requireAuth, requireRole('land_officer', 'administrator'), c.cancelTransfer);

export default router;
