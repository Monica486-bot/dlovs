const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.use(requireAuth, requireRole('administrator'));

router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id/role', adminController.setRole);
router.put('/users/:id/national-id', adminController.setNationalId);
router.put('/users/:id/password', adminController.resetUserPassword);
router.put('/users/:id/deactivate', adminController.deactivateUser);
router.put('/users/:id/reactivate', adminController.reactivateUser);
router.put('/parcels/:id/deactivate', adminController.deactivateParcel);
router.get('/reports', adminController.usageReport);

module.exports = router;
