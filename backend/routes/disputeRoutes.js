const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const disputeController = require('../controllers/disputeController');

router.post('/', requireAuth, requireRole('citizen'), disputeController.flagDispute);
router.get('/', requireAuth, requireRole('land_officer', 'administrator'), disputeController.listDisputes);
router.put('/:id/resolve', requireAuth, requireRole('land_officer'), disputeController.resolveDispute);

module.exports = router;
