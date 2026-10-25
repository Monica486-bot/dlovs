import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listAuditLogs } from '../controllers/auditController';

const router = express.Router();
router.get('/', requireAuth, requireRole('land_officer', 'administrator'), listAuditLogs);
export default router;
