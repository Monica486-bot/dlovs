import express, { Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as documentController from '../controllers/documentController';

const router = express.Router();

router.param('id', (req: Request, res: Response, next: NextFunction, id: string) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Document not found' });
  next();
});

router.get('/types', (_req: Request, res: Response) => res.json(documentController.DOCUMENT_TYPES));
router.get('/', requireAuth, requireRole('land_officer', 'administrator'), documentController.listDocuments);
router.put('/:id/review', requireAuth, requireRole('land_officer'), documentController.reviewDocument);
router.get('/:id/file', requireAuth, documentController.downloadDocument);

export default router;
