const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const parcelController = require('../controllers/parcelController');

// Guest use cases — no account required, per the Use Case Diagram
router.get('/search', parcelController.searchParcel);
router.get('/:id/verify', parcelController.verifyParcel);

// Land Officer use cases
router.post('/', requireAuth, requireRole('land_officer'), parcelController.createParcel);
router.get('/:id/qr', requireAuth, requireRole('land_officer'), parcelController.getQrCode);
router.post('/:id/transfer', requireAuth, requireRole('land_officer'), parcelController.processTransfer);

// Citizen use case
router.get('/mine', requireAuth, requireRole('citizen'), parcelController.viewOwnParcels);

module.exports = router;
