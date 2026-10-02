const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth, requireRole } = require('../middleware/auth');
const parcelController = require('../controllers/parcelController');
const documentController = require('../controllers/documentController');
const requestController = require('../controllers/requestController');
const { singleFile } = require('../middleware/upload');

// Parcel IDs are integers; reject anything else before it reaches a query.
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Parcel not found' });
  next();
});

// Citizen use case — must be before /:id routes
router.get('/mine', requireAuth, requireRole('citizen'), parcelController.viewOwnParcels);

// Officer / administrator dashboard summary — also before /:id routes
router.get('/stats', requireAuth, requireRole('land_officer', 'administrator'), parcelController.getStats);

// Guest use cases — no account required, per the Use Case Diagram.
router.get('/search', optionalAuth, parcelController.searchParcel);
router.get('/:id/verify', optionalAuth, parcelController.verifyParcel);

// Land Officer use cases
router.post('/', requireAuth, requireRole('land_officer'), parcelController.createParcel);
router.put('/:id', requireAuth, requireRole('land_officer'), parcelController.updateParcel);
router.get('/:id/qr', requireAuth, requireRole('land_officer', 'administrator'), parcelController.getQrCode);
router.post('/:id/transfer', requireAuth, requireRole('land_officer'), parcelController.processTransfer);

// FR10 documents: the owner (citizen) or a land officer uploads; staff and the owner can list
router.post('/:id/documents', requireAuth, requireRole('citizen', 'land_officer'), singleFile('file'), documentController.uploadDocument);
router.get('/:id/documents', requireAuth, documentController.listParcelDocuments);

// Citizen asks an officer to transfer their parcel
router.post('/:id/transfer-requests', requireAuth, requireRole('citizen'), requestController.createTransferRequest);

module.exports = router;
