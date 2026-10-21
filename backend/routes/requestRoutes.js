// Mounted at /api: unregistered-parcel reports, transfer requests,
// notifications, owner portfolios, and national ID checks.
const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth, requireRole } = require('../middleware/auth');
const c = require('../controllers/requestController');

router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Not found' });
  next();
});

const staff = requireRole('land_officer', 'administrator');

router.post('/unregistered-reports', requireAuth, requireRole('citizen'), c.createUnregisteredReport);
router.get('/unregistered-reports', requireAuth, c.listUnregisteredReports);
router.put('/unregistered-reports/:id', requireAuth, requireRole('land_officer'), c.closeUnregisteredReport);

router.get('/transfer-requests', requireAuth, c.listTransferRequests);
router.get('/transfer-requests/:id', requireAuth, staff, c.getTransferRequest);
router.put('/transfer-requests/:id/reject', requireAuth, requireRole('land_officer'), c.rejectTransferRequest);

router.get('/notifications', requireAuth, c.listNotifications);
router.put('/notifications/read-all', requireAuth, c.markNotificationsRead);
router.put('/notifications/:id/read', requireAuth, c.markNotificationsRead);

// FR09: anyone can see every parcel registered to an owner; identity details
// (national ID, phone) are only included for staff
router.get('/owners/:id', optionalAuth, c.getOwnerPortfolio);

// FR15: the mobile app registers its Expo push token after login
router.post('/push-tokens', requireAuth, c.registerPushToken);
router.delete('/push-tokens', requireAuth, c.removePushToken);

// officer checks a citizen's ID card in person
router.get('/id-checks', requireAuth, staff, c.listIdChecks);
router.put('/id-checks/:id', requireAuth, staff, c.decideIdCheck);

module.exports = router;
