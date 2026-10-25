import express, { Request, Response, NextFunction } from 'express';
import { requireAuth, optionalAuth, requireRole } from '../middleware/auth';
import * as parcelController from '../controllers/parcelController';
import * as documentController from '../controllers/documentController';
import * as requestController from '../controllers/requestController';
import * as transferController from '../controllers/transferController';
import { singleFile } from '../middleware/upload';

const router = express.Router();

router.param('id', (req: Request, res: Response, next: NextFunction, id: string) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Parcel not found' });
  next();
});

router.get('/mine', requireAuth, requireRole('citizen'), parcelController.viewOwnParcels);
router.get('/stats', requireAuth, requireRole('land_officer', 'administrator'), parcelController.getStats);
router.get('/neighbourhoods', parcelController.listNeighbourhoods);
router.get('/transfer-reasons', parcelController.listTransferReasons);
router.get('/search', optionalAuth, parcelController.searchParcel);
router.get('/:id/verify', optionalAuth, parcelController.verifyParcel);
router.post('/', requireAuth, requireRole('land_officer'), parcelController.createParcel);
router.put('/:id', requireAuth, requireRole('land_officer'), parcelController.updateParcel);
router.get('/:id/qr', requireAuth, requireRole('land_officer', 'administrator'), parcelController.getQrCode);
router.get('/:id/transfer-consent', requireAuth, requireRole('land_officer'), transferController.transferConsent);
router.post('/:id/transfer', requireAuth, requireRole('land_officer'), transferController.startTransfer);
router.post('/:id/documents', requireAuth, requireRole('citizen', 'land_officer'), singleFile('file'), documentController.uploadDocument);
router.get('/:id/documents', requireAuth, documentController.listParcelDocuments);
router.post('/:id/transfer-requests', requireAuth, requireRole('citizen'), requestController.createTransferRequest);

export default router;
