const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const auditController = require('../controllers/auditController');

router.get('/', requireAuth, requireRole('land_officer', 'administrator'), auditController.listAuditLogs);

module.exports = router;
