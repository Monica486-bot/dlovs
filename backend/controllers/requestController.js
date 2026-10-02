// Requests from citizens that officers act on:
//  - FR13: reports of plots that aren't in DLOVS
//  - Use case "Initiate Transfer Request": an owner asks for a parcel to be
//    transferred to a buyer. The officer completes it through the normal
//    transfer (parcelController.processTransfer with transfer_request_id).
// Plus FR15 in-app notifications and the FR09 owner portfolio.

const pool = require('../db/pool');
const { notifyUsers, notifyOfficers } = require('../utils/notify');

const STAFF_ROLES = ['land_officer', 'administrator'];

function parseCoordinate(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
}

// ---------- FR13: unregistered parcel reports ----------

async function createUnregisteredReport(req, res) {
  const neighbourhood = req.body.neighbourhood?.trim();
  const locationDetails = req.body.location_details?.trim();
  const lat = parseCoordinate(req.body.gps_lat, -90, 90);
  const lng = parseCoordinate(req.body.gps_lng, -180, 180);
  if (!neighbourhood || !locationDetails) {
    return res.status(400).json({ error: 'neighbourhood and location_details are required' });
  }
  if (Number.isNaN(lat) || Number.isNaN(lng) || (lat === null) !== (lng === null)) {
    return res.status(400).json({ error: 'GPS coordinates are invalid' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO unregistered_report (reported_by, neighbourhood, location_details, gps_lat, gps_lng, claimed_owner)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING report_id, status, created_at`,
      [req.user.user_id, neighbourhood, locationDetails, lat, lng, req.body.claimed_owner?.trim() || null]
    );
    notifyOfficers(`New report of an unregistered plot in ${neighbourhood}`, { link: '/reports' });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
}

// staff: all (default open); citizens: their own
async function listUnregisteredReports(req, res) {
  const isStaff = STAFF_ROLES.includes(req.user.role);
  const status = req.query.status || (isStaff ? 'open' : 'all');
  if (!['open', 'registered', 'dismissed', 'all'].includes(status)) {
    return res.status(400).json({ error: 'status must be open, registered, dismissed, or all' });
  }
  const where = [];
  const params = [];
  if (!isStaff) { params.push(req.user.user_id); where.push(`r.reported_by = $${params.length}`); }
  if (status !== 'all') { params.push(status); where.push(`r.status = $${params.length}`); }
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name AS reporter_name, u.phone_number AS reporter_phone, h.full_name AS handled_by_name
       FROM unregistered_report r
       JOIN "user" u ON u.user_id = r.reported_by
       LEFT JOIN "user" h ON h.user_id = r.handled_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.created_at DESC LIMIT 200`,
      params
    );
    res.json(result.rows.map((r) => (isStaff ? r : { ...r, reporter_phone: undefined })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load reports' });
  }
}

// officer closes a report: registered (optionally linking the new parcel) or dismissed
async function closeUnregisteredReport(req, res) {
  const { status } = req.body;
  const notes = req.body.response_notes?.trim();
  const parcelId = req.body.parcel_id ? Number(req.body.parcel_id) : null;
  if (!['registered', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: "status must be 'registered' or 'dismissed'" });
  }
  if (!notes) return res.status(400).json({ error: 'Add a note for the person who reported it' });
  try {
    if (parcelId) {
      const exists = await pool.query('SELECT 1 FROM parcel WHERE parcel_id = $1', [parcelId]);
      if (exists.rows.length === 0) return res.status(400).json({ error: `Parcel #${parcelId} does not exist` });
    }
    const result = await pool.query(
      `UPDATE unregistered_report
       SET status = $1, response_notes = $2, parcel_id = $3, handled_by = $4, handled_at = now()
       WHERE report_id = $5 AND status = 'open'
       RETURNING report_id, reported_by, neighbourhood`,
      [status, notes, parcelId, req.user.user_id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(409).json({ error: 'Report not found or already closed' });
    const report = result.rows[0];
    await pool.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'CLOSE_REPORT', $2, $3)`,
      [req.user.user_id, parcelId, `Unregistered plot report #${report.report_id} (${report.neighbourhood}) ${status}: ${notes}`]
    );
    notifyUsers(
      [report.reported_by],
      status === 'registered'
        ? `The plot you reported in ${report.neighbourhood} is now registered${parcelId ? ` as parcel #${parcelId}` : ''}.`
        : `Your report about a plot in ${report.neighbourhood} was closed: ${notes}`,
      { link: '/my/requests', sms: true }
    );
    res.json({ message: `Report ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update report' });
  }
}

// ---------- Transfer requests ----------

async function createTransferRequest(req, res) {
  const parcelId = Number(req.params.id);
  const buyerName = req.body.buyer_full_name?.trim();
  const buyerNationalId = req.body.buyer_national_id?.trim();
  if (!buyerName || !buyerNationalId) {
    return res.status(400).json({ error: "The buyer's full name and national ID are required" });
  }
  try {
    const parcel = await pool.query(
      `SELECT p.status, o.national_id AS owner_national_id, u.national_id AS my_national_id,
              u.national_id_verified_at IS NOT NULL AS my_id_verified
       FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
       JOIN "user" u ON u.user_id = $2
       WHERE p.parcel_id = $1`,
      [parcelId, req.user.user_id]
    );
    const row = parcel.rows[0];
    if (!row) return res.status(404).json({ error: 'Parcel not found' });
    if (row.my_national_id && row.my_national_id === row.owner_national_id && !row.my_id_verified) {
      return res.status(403).json({ error: 'Show your national ID card at the land office first, so an officer can confirm it is yours' });
    }
    if (!row.my_national_id || row.my_national_id !== row.owner_national_id) {
      return res.status(403).json({ error: 'You can only request transfers of parcels registered to your national ID' });
    }
    if (row.status !== 'active') {
      return res.status(409).json({ error: `This parcel is ${row.status} and cannot be transferred` });
    }
    if (buyerNationalId === row.owner_national_id) {
      return res.status(400).json({ error: 'The buyer is already the owner' });
    }
    const pending = await pool.query(
      `SELECT 1 FROM transfer_request WHERE parcel_id = $1 AND status = 'pending'`,
      [parcelId]
    );
    if (pending.rows.length > 0) {
      return res.status(409).json({ error: 'There is already a pending transfer request for this parcel' });
    }
    const result = await pool.query(
      `INSERT INTO transfer_request (parcel_id, requested_by, buyer_full_name, buyer_national_id, buyer_contact, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING request_id, status, created_at`,
      [parcelId, req.user.user_id, buyerName, buyerNationalId, req.body.buyer_contact?.trim() || null, req.body.notes?.trim() || null]
    );
    notifyOfficers(`Transfer requested for parcel #${parcelId} to ${buyerName}`, { link: '/transfer-requests' });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit transfer request' });
  }
}

// staff: pending by default; citizens: their own
async function listTransferRequests(req, res) {
  const isStaff = STAFF_ROLES.includes(req.user.role);
  const status = req.query.status || (isStaff ? 'pending' : 'all');
  if (!['pending', 'completed', 'rejected', 'all'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending, completed, rejected, or all' });
  }
  const where = [];
  const params = [];
  if (!isStaff) { params.push(req.user.user_id); where.push(`t.requested_by = $${params.length}`); }
  if (status !== 'all') { params.push(status); where.push(`t.status = $${params.length}`); }
  try {
    const result = await pool.query(
      `SELECT t.*, p.neighbourhood, p.status AS parcel_status, o.full_name AS owner_name,
              u.full_name AS requested_by_name, u.phone_number AS requested_by_phone, h.full_name AS handled_by_name
       FROM transfer_request t
       JOIN parcel p ON p.parcel_id = t.parcel_id
       JOIN owner o ON o.owner_id = p.current_owner_id
       JOIN "user" u ON u.user_id = t.requested_by
       LEFT JOIN "user" h ON h.user_id = t.handled_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY t.created_at DESC LIMIT 200`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transfer requests' });
  }
}

async function getTransferRequest(req, res) {
  try {
    const result = await pool.query(
      `SELECT t.*, u.full_name AS requested_by_name FROM transfer_request t
       JOIN "user" u ON u.user_id = t.requested_by WHERE t.request_id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transfer request not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transfer request' });
  }
}

async function rejectTransferRequest(req, res) {
  const notes = req.body.response_notes?.trim();
  if (!notes) return res.status(400).json({ error: 'Give a reason so the owner knows what to do next' });
  try {
    const result = await pool.query(
      `UPDATE transfer_request SET status = 'rejected', response_notes = $1, handled_by = $2, handled_at = now()
       WHERE request_id = $3 AND status = 'pending'
       RETURNING request_id, parcel_id, requested_by, buyer_full_name`,
      [notes, req.user.user_id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(409).json({ error: 'Request not found or already handled' });
    const request = result.rows[0];
    await pool.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'REJECT_TRANSFER_REQUEST', $2, $3)`,
      [req.user.user_id, request.parcel_id, `Rejected transfer request #${request.request_id} to ${request.buyer_full_name}: ${notes}`]
    );
    notifyUsers(
      [request.requested_by],
      `Your request to transfer parcel #${request.parcel_id} to ${request.buyer_full_name} was not approved: ${notes}`,
      { link: '/my/requests', sms: true }
    );
    res.json({ message: 'Transfer request rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject request' });
  }
}

// ---------- National ID checks ----------
// A citizen's national ID links their account to land only after a land
// officer has seen the ID card in person. Officers work through this queue.

async function listIdChecks(req, res) {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.phone_number, u.national_id, u.created_at,
              (SELECT COUNT(*)::int FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
               WHERE o.national_id = u.national_id) AS parcels_with_this_id,
              (SELECT string_agg(DISTINCT o.full_name, ', ') FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
               WHERE o.national_id = u.national_id) AS registered_owner_names
       FROM "user" u
       WHERE u.role = 'citizen' AND u.is_active AND u.national_id IS NOT NULL AND u.national_id_verified_at IS NULL
       ORDER BY u.created_at`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load ID checks' });
  }
}

// PUT /api/id-checks/:id  { decision: 'verified' | 'rejected', reason }
// Rejecting clears the ID, so the real owner can link it to their own account.
async function decideIdCheck(req, res) {
  const { decision } = req.body;
  const reason = req.body.reason?.trim();
  if (!['verified', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'verified' or 'rejected'" });
  }
  if (decision === 'rejected' && !reason) {
    return res.status(400).json({ error: 'Give a reason so the citizen knows what to do' });
  }
  try {
    const result = decision === 'verified'
      ? await pool.query(
        `UPDATE "user" SET national_id_verified_at = now(), national_id_verified_by = $1
         WHERE user_id = $2 AND role = 'citizen' AND national_id IS NOT NULL AND national_id_verified_at IS NULL
         RETURNING user_id, full_name, national_id`,
        [req.user.user_id, req.params.id]
      )
      : await pool.query(
        `UPDATE "user" u SET national_id = NULL
         FROM (SELECT user_id, national_id AS old_id FROM "user" WHERE user_id = $1) prev
         WHERE u.user_id = prev.user_id AND u.role = 'citizen' AND u.national_id IS NOT NULL AND u.national_id_verified_at IS NULL
         RETURNING u.user_id, u.full_name, prev.old_id AS national_id`,
        [req.params.id]
      );
    if (result.rows.length === 0) return res.status(409).json({ error: 'No pending ID check for this account' });
    const citizen = result.rows[0];
    await pool.query(
      `INSERT INTO audit_log (officer_id, action_type, details) VALUES ($1, $2, $3)`,
      [
        req.user.user_id,
        decision === 'verified' ? 'VERIFY_NATIONAL_ID' : 'REJECT_NATIONAL_ID',
        decision === 'verified'
          ? `Checked the ID card of ${citizen.full_name} (#${citizen.user_id}) in person: national ID ${citizen.national_id}`
          : `Rejected national ID ${citizen.national_id} for ${citizen.full_name} (#${citizen.user_id}): ${reason}`,
      ]
    );
    notifyUsers(
      [citizen.user_id],
      decision === 'verified'
        ? 'Your national ID has been confirmed. Parcels registered to it now appear under My Parcels.'
        : `Your national ID could not be confirmed: ${reason}`,
      { link: '/my', sms: true }
    );
    res.json({ message: decision === 'verified' ? 'National ID confirmed' : 'National ID rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update ID check' });
  }
}

// ---------- FR15: notifications ----------

async function listNotifications(req, res) {
  try {
    const [items, unread] = await Promise.all([
      pool.query(
        `SELECT notification_id, message, link, is_read, created_at FROM notification
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.user.user_id]
      ),
      pool.query('SELECT COUNT(*)::int AS n FROM notification WHERE user_id = $1 AND NOT is_read', [req.user.user_id]),
    ]);
    res.json({ unread: unread.rows[0].n, notifications: items.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
}

async function markNotificationsRead(req, res) {
  try {
    if (req.params.id) {
      await pool.query('UPDATE notification SET is_read = true WHERE notification_id = $1 AND user_id = $2', [req.params.id, req.user.user_id]);
    } else {
      await pool.query('UPDATE notification SET is_read = true WHERE user_id = $1 AND NOT is_read', [req.user.user_id]);
    }
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
}

// ---------- FR09: owner portfolio (staff) ----------

async function getOwnerPortfolio(req, res) {
  try {
    const ownerResult = await pool.query(
      'SELECT owner_id, full_name, national_id, contact_number FROM owner WHERE owner_id = $1',
      [req.params.id]
    );
    const owner = ownerResult.rows[0];
    if (!owner) return res.status(404).json({ error: 'Owner not found' });
    // all owner records with the same national ID are the same person
    const parcels = await pool.query(
      `SELECT p.parcel_id, p.neighbourhood, p.gps_lat, p.gps_lng, p.area_sqm, p.status, p.registered_date,
              (SELECT COUNT(*)::int FROM document d WHERE d.parcel_id = p.parcel_id AND d.verification_status = 'verified') AS verified_documents
       FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
       WHERE o.owner_id = $1 OR (o.national_id IS NOT NULL AND o.national_id = $2)
       ORDER BY p.registered_date, p.parcel_id`,
      [owner.owner_id, owner.national_id]
    );
    const previous = await pool.query(
      `SELECT DISTINCT ON (h.parcel_id) h.parcel_id, h.transfer_date, nw.full_name AS transferred_to
       FROM ownership_history h
       JOIN owner pr ON pr.owner_id = h.previous_owner_id
       JOIN owner nw ON nw.owner_id = h.new_owner_id
       WHERE pr.owner_id = $1 OR (pr.national_id IS NOT NULL AND pr.national_id = $2)
       ORDER BY h.parcel_id, h.transfer_date DESC`,
      [owner.owner_id, owner.national_id]
    );
    res.json({ owner, parcels: parcels.rows, previously_owned: previous.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load owner' });
  }
}

module.exports = {
  createUnregisteredReport, listUnregisteredReports, closeUnregisteredReport,
  createTransferRequest, listTransferRequests, getTransferRequest, rejectTransferRequest, listIdChecks, decideIdCheck,
  listNotifications, markNotificationsRead, getOwnerPortfolio,
};
