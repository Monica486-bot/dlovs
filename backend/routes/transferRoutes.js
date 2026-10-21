// Transfers waiting for the owner's consent (FR11): the owner's SMS code, or a
// second officer's approval of the written consent.
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/transferController');

router.param('id', (req, res, next, id) => {
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

module.exports = router;
