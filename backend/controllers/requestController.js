const pool = require('../db/pool');
const { notifyUsers, notifyOfficers } = require('../utils/notify');
const { isExpoPushToken } = require('../utils/push');
const { fourPartName } = require('../utils/names');
const { matchOwner, normalise } = require('../utils/owners');
const { transferReason } = require('../utils/transferReasons');

const STAFF_ROLES = ['land_officer', 'administrator'];

// true when the account's national ID is the current owner of some parcel
const OWNS_LAND = `EXISTS (SELECT 1 FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
  WHERE o.national_id = u.national_id)`;

function parseCoordinate(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
}

// ---------- FR13: unregistered parcel reports ----------

// FR13: a citizen reports a plot that isn't registered
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

// Use case "Initiate Transfer Request": the owner asks for a transfer to a buyer
async function createTransferRequest(req, res) {
  const parcelId = Number(req.params.id);
  const buyerNationalId = req.body.buyer_national_id?.trim();
  if (!buyerNationalId) return res.status(400).json({ error: "The buyer's national ID is required" });
  // the buyer becomes the registered owner, so the same four names are needed
  const buyer = fourPartName(req.body.buyer_full_name, "the buyer's");
  if (buyer.error) return res.status(400).json({ error: buyer.error });
  const buyerName = buyer.name;
  const reason = transferReason(req.body.reason, req.body.reason_details);
  if (reason.error) return res.status(400).json({ error: reason.error });
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
    // Unlike officers, a citizen isn't told who the ID belongs to: that would
    // let anyone look up the name behind a national ID.
    if ((await matchOwner(pool, buyerNationalId, buyerName)).mismatch) {
      return res.status(409).json({
        error: "This national ID is registered under a different name. Check the buyer's ID card and enter their four names exactly as on it.",
        code: 'NATIONAL_ID_NAME_MISMATCH',
      });
    }
    const pending = await pool.query(
      `SELECT 1 FROM transfer_request WHERE parcel_id = $1 AND status = 'pending'`,
      [parcelId]
    );
    if (pending.rows.length > 0) {
      return res.status(409).json({ error: 'There is already a pending transfer request for this parcel' });
    }
    // Officer-free transfer: a buyer whose account holds this national ID,
    // confirmed in person and under the same name, can accept in the app.
    const buyerAccount = await pool.query(
      `SELECT user_id, full_name FROM "user" WHERE national_id = $1 AND role = 'citizen' AND is_active
       AND national_id_verified_at IS NOT NULL`,
      [buyerNationalId]
    );
    const buyerUser = buyerAccount.rows.find((u) => normalise(u.full_name) === normalise(buyerName));
    const result = await pool.query(
      `INSERT INTO transfer_request (parcel_id, requested_by, buyer_full_name, buyer_national_id, buyer_contact, notes,
         transfer_reason, transfer_reason_details, buyer_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING request_id, status, created_at`,
      [parcelId, req.user.user_id, buyerName, buyerNationalId, req.body.buyer_contact?.trim() || null, req.body.notes?.trim() || null,
        reason.reason, reason.details, buyerUser?.user_id || null]
    );
    if (buyerUser) {
      notifyUsers(
        [buyerUser.user_id],
        `${req.user.full_name} wants to transfer parcel #${parcelId} to you. Check the plot, then accept or decline under My Requests.`,
        { link: '/my/requests', sms: true }
      );
    } else {
      notifyOfficers(`Transfer requested for parcel #${parcelId} to ${buyerName}`, { link: '/transfer-requests' });
    }
    res.status(201).json({ ...result.rows[0], buyer_can_accept: Boolean(buyerUser) });
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
  // citizens: requests they made, and requests naming them as the buyer
  if (!isStaff) { params.push(req.user.user_id); where.push(`(t.requested_by = $${params.length} OR t.buyer_user_id = $${params.length})`); }
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
    res.json(result.rows.map(({ accept_code_hash, accept_code_attempts, accept_code_expires_at, ...r }) => {
      const row = { ...r, buyer_can_accept: r.buyer_user_id != null, incoming: !isStaff && r.buyer_user_id === req.user.user_id };
      if (!isStaff) delete row.requested_by_phone;
      return row;
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transfer requests' });
  }
}

// One transfer request, for the officer's transfer form
async function getTransferRequest(req, res) {
  try {
    const result = await pool.query(
      `SELECT t.*, u.full_name AS requested_by_name FROM transfer_request t
       JOIN "user" u ON u.user_id = t.requested_by WHERE t.request_id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transfer request not found' });
    const { accept_code_hash, accept_code_attempts, accept_code_expires_at, ...request } = result.rows[0];
    res.json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transfer request' });
  }
}

// An officer turns down a transfer request, with a reason
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

// National IDs waiting for an in-person check (only IDs that own land)
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
         -- only IDs that own land: an account without land needs no check
         -- until land is registered to it (then it appears here)
         AND ${OWNS_LAND}
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

// FR15: the user's notifications
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

// FR15: mark one or all notifications as read
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

// FR09: every parcel registered to an owner
async function getOwnerPortfolio(req, res) {
  try {
    const ownerResult = await pool.query(
      'SELECT owner_id, full_name, national_id, contact_number FROM owner WHERE owner_id = $1',
      [req.params.id]
    );
    const owner = ownerResult.rows[0];
    if (!owner) return res.status(404).json({ error: 'Owner not found' });
    const staffView = STAFF_ROLES.includes(req.user?.role);
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
    // The public sees the same names and parcels a search shows, grouped by
    // person, not the details that would let a broker contact or impersonate
    // the owner.
    const { national_id, contact_number, ...publicOwner } = owner;
    res.json({ owner: staffView ? owner : publicOwner, parcels: parcels.rows, previously_owned: previous.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load owner' });
  }
}

// FR15: POST /api/push-tokens { token }: the mobile app's Expo push token.
// A device belongs to whoever logged in on it last.
async function registerPushToken(req, res) {
  const token = req.body?.token;
  if (!isExpoPushToken(token)) return res.status(400).json({ error: 'token must be an Expo push token' });
  try {
    await pool.query(
      `INSERT INTO push_token (token, user_id) VALUES ($1, $2)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, created_at = now()`,
      [token, req.user.user_id]
    );
    res.status(201).json({ message: 'Push notifications enabled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save push token' });
  }
}

// DELETE /api/push-tokens { token }: on logout, so the next person to use
// the phone doesn't receive this account's alerts.
async function removePushToken(req, res) {
  try {
    await pool.query('DELETE FROM push_token WHERE token = $1 AND user_id = $2', [req.body?.token, req.user.user_id]);
    res.json({ message: 'Push notifications disabled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove push token' });
  }
}

module.exports = {
  createUnregisteredReport, listUnregisteredReports, closeUnregisteredReport,
  createTransferRequest, listTransferRequests, getTransferRequest, rejectTransferRequest, listIdChecks, decideIdCheck,
  listNotifications, markNotificationsRead, getOwnerPortfolio, registerPushToken, removePushToken,
};
