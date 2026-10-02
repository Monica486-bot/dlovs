const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const documentController = require('../controllers/documentController');

router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Document not found' });
  next();
});

router.get('/types', (req, res) => res.json(documentController.DOCUMENT_TYPES));
router.get('/', requireAuth, requireRole('land_officer', 'administrator'), documentController.listDocuments);
router.put('/:id/review', requireAuth, requireRole('land_officer'), documentController.reviewDocument);
router.get('/:id/file', requireAuth, documentController.downloadDocument);

module.exports = router;
