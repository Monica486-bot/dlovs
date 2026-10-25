// Mounted at /api: unregistered-parcel reports, transfer requests,
// notifications, owner portfolios, and national ID checks.
import express, { Request, Response, NextFunction } from 'express';
import { requireAuth, optionalAuth, requireRole } from '../middleware/auth';
import * as c from '../controllers/requestController';
import * as transfers from '../controllers/transferController';

const router = express.Router();

router.param('id', (req: Request, res: Response, next: NextFunction, id: string) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Not found' });
  next();
});

const staff = requireRole('land_officer', 'administrator');
const citizen = requireRole('citizen');

router.post('/unregistered-reports', requireAuth, requireRole('citizen'), c.createUnregisteredReport);
router.get('/unregistered-reports', requireAuth, c.listUnregisteredReports);
router.put('/unregistered-reports/:id', requireAuth, requireRole('land_officer'), c.closeUnregisteredReport);

router.get('/transfer-requests', requireAuth, c.listTransferRequests);
router.get('/transfer-requests/:id', requireAuth, staff, c.getTransferRequest);
router.put('/transfer-requests/:id/reject', requireAuth, requireRole('land_officer'), c.rejectTransferRequest);
router.post('/transfer-requests/:id/accept-code', requireAuth, citizen, transfers.sendAcceptCode);
router.post('/transfer-requests/:id/accept', requireAuth, citizen, transfers.acceptTransferRequest);
router.put('/transfer-requests/:id/decline', requireAuth, citizen, transfers.declineTransferRequest);

router.get('/notifications', requireAuth, c.listNotifications);
router.put('/notifications/read-all', requireAuth, c.markNotificationsRead);
router.put('/notifications/:id/read', requireAuth, c.markNotificationsRead);

router.get('/owners/:id', optionalAuth, c.getOwnerPortfolio);

router.post('/push-tokens', requireAuth, c.registerPushToken);
router.delete('/push-tokens', requireAuth, c.removePushToken);

router.get('/id-checks', requireAuth, staff, c.listIdChecks);
router.put('/id-checks/:id', requireAuth, staff, c.decideIdCheck);

export default router;
