// FR10: landowners (or an officer on their behalf) upload scanned land
// documents; a land officer verifies or rejects each one.
// FR14: separation of duties — an officer can't review a document on a parcel
// they registered, or a document they uploaded themselves.
// NFR10: files are encrypted at rest (utils/documentStorage.js).

const pool = require('../db/pool');
const { saveDocument, readDocument } = require('../utils/documentStorage');
const { notifyUsers, notifyOfficers } = require('../utils/notify');

const STAFF_ROLES = ['land_officer', 'administrator'];
const DOCUMENT_TYPES = ['Allocation Letter', 'Customary Certificate', 'Witness Agreement', 'Sale Agreement', 'Title Deed', 'Other'];

// Identify the file by its first bytes, not the name or the browser's claim.
function sniffType(buffer) {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

// True when the logged-in citizen's officer-verified national ID matches the
// parcel's current owner.
async function isParcelOwner(userId, parcelId) {
  const result = await pool.query(
    `SELECT 1 FROM parcel p
     JOIN owner o ON o.owner_id = p.current_owner_id
     JOIN "user" u ON u.user_id = $1 AND u.national_id IS NOT NULL AND u.national_id = o.national_id
       AND u.national_id_verified_at IS NOT NULL
     WHERE p.parcel_id = $2`,
    [userId, parcelId]
  );
  return result.rows.length > 0;
}

// Why this officer may not review this document, or null if they may.
function reviewBlock(user, doc) {
  if (user.role !== 'land_officer') return 'Only land officers review documents';
  if (doc.verification_status !== 'pending') return 'Already reviewed';
  if (doc.registered_by === user.user_id) return 'You registered this parcel — another officer must review its documents';
  if (doc.uploaded_by === user.user_id) return 'You uploaded this document — another officer must review it';
  return null;
}

const DOCUMENT_COLUMNS = `
  d.document_id, d.parcel_id, d.document_type, d.original_name, d.file_type, d.size_bytes, d.upload_date,
  d.verification_status, d.verification_date, d.rejection_reason, d.uploaded_by, d.verified_by,
  up.full_name AS uploaded_by_name, up.role AS uploaded_by_role, rv.full_name AS verified_by_name,
  p.registered_by, p.neighbourhood, o.full_name AS owner_name`;
const DOCUMENT_JOINS = `
  FROM document d
  JOIN parcel p ON p.parcel_id = d.parcel_id
  JOIN owner o ON o.owner_id = p.current_owner_id
  LEFT JOIN "user" up ON up.user_id = d.uploaded_by
  LEFT JOIN "user" rv ON rv.user_id = d.verified_by`;

function present(user, doc) {
  const block = reviewBlock(user, doc);
  const { registered_by, ...rest } = doc;
  return { ...rest, can_review: block === null, review_block: block };
}

// POST /api/parcels/:id/documents  (multipart: file, document_type)
async function uploadDocument(req, res) {
  const parcelId = Number(req.params.id);
  const documentType = req.body.document_type;
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload (PDF, JPG or PNG, up to 5 MB)' });
  if (!DOCUMENT_TYPES.includes(documentType)) {
    return res.status(400).json({ error: `document_type must be one of: ${DOCUMENT_TYPES.join(', ')}` });
  }
  const mime = sniffType(req.file.buffer);
  if (!mime) return res.status(400).json({ error: 'Only PDF, JPG and PNG files are accepted' });

  try {
    const parcel = await pool.query('SELECT status FROM parcel WHERE parcel_id = $1', [parcelId]);
    if (parcel.rows.length === 0) return res.status(404).json({ error: 'Parcel not found' });
    if (parcel.rows[0].status === 'deactivated') {
      return res.status(409).json({ error: 'Documents cannot be added to a deactivated record' });
    }
    if (req.user.role === 'citizen' && !(await isParcelOwner(req.user.user_id, parcelId))) {
      return res.status(403).json({ error: 'You can only upload documents for parcels registered to your national ID' });
    }
    if (req.user.role === 'administrator') {
      return res.status(403).json({ error: 'Documents are uploaded by the owner or a land officer' });
    }

    const reference = await saveDocument(req.file.buffer);
    const originalName = req.file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 120);
    const result = await pool.query(
      `INSERT INTO document (parcel_id, uploaded_by, file_url, file_type, document_type, original_name, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING document_id`,
      [parcelId, req.user.user_id, reference, mime, documentType, originalName, req.file.size]
    );
    const documentId = result.rows[0].document_id;
    if (STAFF_ROLES.includes(req.user.role)) {
      await pool.query(
        `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'UPLOAD_DOCUMENT', $2, $3)`,
        [req.user.user_id, parcelId, `Uploaded ${documentType} (${originalName}) on the owner's behalf`]
      );
    }
    notifyOfficers(`New ${documentType} uploaded for parcel #${parcelId} — waiting for review`, { link: '/documents' });
    res.status(201).json({ document_id: documentId, verification_status: 'pending' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
}

// GET /api/parcels/:id/documents — staff, or the citizen who owns the parcel
async function listParcelDocuments(req, res) {
  const parcelId = Number(req.params.id);
  try {
    if (!STAFF_ROLES.includes(req.user.role) && !(await isParcelOwner(req.user.user_id, parcelId))) {
      return res.status(403).json({ error: 'Only the owner and land officers can see these documents' });
    }
    const result = await pool.query(
      `SELECT ${DOCUMENT_COLUMNS} ${DOCUMENT_JOINS} WHERE d.parcel_id = $1 ORDER BY d.upload_date DESC`,
      [parcelId]
    );
    res.json(result.rows.map((d) => present(req.user, d)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load documents' });
  }
}

// GET /api/documents?status=pending — review queue for officers
async function listDocuments(req, res) {
  const status = req.query.status || 'pending';
  if (!['pending', 'verified', 'rejected', 'all'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending, verified, rejected, or all' });
  }
  try {
    const result = await pool.query(
      `SELECT ${DOCUMENT_COLUMNS} ${DOCUMENT_JOINS}
       ${status === 'all' ? '' : 'WHERE d.verification_status = $1'}
       ORDER BY d.upload_date ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
      status === 'all' ? [] : [status]
    );
    res.json(result.rows.map((d) => present(req.user, d)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load documents' });
  }
}

// PUT /api/documents/:id/review  { decision: 'verified' | 'rejected', reason }
async function reviewDocument(req, res) {
  const { decision } = req.body;
  const reason = req.body.reason?.trim();
  if (!['verified', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'verified' or 'rejected'" });
  }
  if (decision === 'rejected' && !reason) {
    return res.status(400).json({ error: 'Give a reason so the owner knows what to fix' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT d.document_id, d.parcel_id, d.document_type, d.uploaded_by, d.verification_status, p.registered_by
       FROM document d JOIN parcel p ON p.parcel_id = d.parcel_id
       WHERE d.document_id = $1 FOR UPDATE OF d`,
      [req.params.id]
    );
    const doc = result.rows[0];
    if (!doc) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Document not found' });
    }
    const block = reviewBlock(req.user, doc);
    if (block) {
      await client.query('ROLLBACK');
      return res.status(doc.verification_status !== 'pending' ? 409 : 403).json({ error: block });
    }
    await client.query(
      `UPDATE document SET verification_status = $1, verified_by = $2, verification_date = now(), rejection_reason = $3
       WHERE document_id = $4`,
      [decision, req.user.user_id, decision === 'rejected' ? reason : null, doc.document_id]
    );
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, $2, $3, $4)`,
      [
        req.user.user_id,
        decision === 'verified' ? 'VERIFY_DOCUMENT' : 'REJECT_DOCUMENT',
        doc.parcel_id,
        `${decision === 'verified' ? 'Verified' : 'Rejected'} ${doc.document_type} #${doc.document_id}${reason ? `: ${reason}` : ''}`,
      ]
    );
    await client.query('COMMIT');
    notifyUsers(
      [doc.uploaded_by],
      decision === 'verified'
        ? `Your ${doc.document_type} for parcel #${doc.parcel_id} was verified.`
        : `Your ${doc.document_type} for parcel #${doc.parcel_id} was rejected: ${reason}`,
      { link: `/my/parcels/${doc.parcel_id}`, sms: true }
    );
    res.json({ message: `Document ${decision}`, document_id: doc.document_id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Review failed' });
  } finally {
    client.release();
  }
}

// GET /api/documents/:id/file — staff, the uploader, or the parcel's owner
async function downloadDocument(req, res) {
  try {
    const result = await pool.query(
      'SELECT document_id, parcel_id, uploaded_by, file_url, file_type, original_name FROM document WHERE document_id = $1',
      [req.params.id]
    );
    const doc = result.rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const allowed =
      STAFF_ROLES.includes(req.user.role) ||
      doc.uploaded_by === req.user.user_id ||
      (await isParcelOwner(req.user.user_id, doc.parcel_id));
    if (!allowed) return res.status(403).json({ error: 'You cannot view this document' });

    const contents = await readDocument(doc.file_url);
    res.set({
      'Content-Type': doc.file_type,
      'Content-Disposition': `inline; filename="${(doc.original_name || `document-${doc.document_id}`).replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(contents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not open the document' });
  }
}

module.exports = {
  uploadDocument, listParcelDocuments, listDocuments, reviewDocument, downloadDocument, DOCUMENT_TYPES,
};
