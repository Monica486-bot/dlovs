const crypto = require('crypto');
const pool = require('../db/pool');
const { generateQrDataUrl } = require('../utils/qr');
const { notifyUsers, notifyOfficers, accountIdsForNationalId, askForIdCheck, alertOwner } = require('../utils/notify');
const { fourPartName } = require('../utils/names');
const { matchOwner } = require('../utils/owners');
const { transferReason } = require('../utils/transferReasons');
const { sendSms, smsConfigured } = require('../utils/sms');

const CODE_TTL_MINUTES = 30; // long enough for the owner to reach the office
const MAX_CODE_ATTEMPTS = 5;
const OPEN = ['awaiting_owner', 'awaiting_approval'];

class TransferError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const maskPhone = (phone) => `${phone.slice(0, 4)}•••••${phone.slice(-3)}`;

// Citizen accounts whose officer-checked national ID is the owner's
async function ownerAccounts(db, nationalId) {
  if (!nationalId) return [];
  const result = await db.query(
    `SELECT user_id, phone_number FROM "user"
     WHERE national_id = $1 AND role = 'citizen' AND is_active AND national_id_verified_at IS NOT NULL`,
    [nationalId]
  );
  return result.rows;
}

// Locks the parcel and checks it can still be transferred (no double sale).
async function lockParcel(client, parcelId, expectedOwnerId) {
  const parcelResult = await client.query(
    'SELECT current_owner_id, status, qr_version FROM parcel WHERE parcel_id = $1 FOR UPDATE',
    [parcelId]
  );
  if (parcelResult.rows.length === 0) throw new TransferError(404, 'Parcel not found');
  const ownerRow = await client.query('SELECT full_name, national_id FROM owner WHERE owner_id = $1', [
    parcelResult.rows[0].current_owner_id,
  ]);
  const current = {
    ...parcelResult.rows[0],
    owner_name: ownerRow.rows[0].full_name,
    owner_national_id: ownerRow.rows[0].national_id,
  };
  // If someone else transferred the parcel in the meantime, refuse rather
  // than sell the same plot twice.
  if (expectedOwnerId != null && Number(expectedOwnerId) !== current.current_owner_id) {
    throw new TransferError(409, `Ownership changed since you opened this page. The parcel is now registered to ${current.owner_name}. Reload and check before transferring.`);
  }
  // Selling a disputed or fraudulent plot is exactly what DLOVS exists to stop.
  if (current.status !== 'active') {
    throw new TransferError(409, current.status === 'disputed'
      ? 'This parcel has an open dispute. Resolve the dispute before transferring ownership.'
      : 'This parcel record has been deactivated and cannot be transferred.');
  }
  return current;
}

// Changes the owner inside the caller's transaction: history, new QR code,
// audit log, and the parcel's transfer requests. Returns what the caller needs
// to notify people afterwards.
async function executeTransfer(client, { parcelId, current, newOwner, notes, officerId, requestId, consent, reason }) {
  // Reuse the owner record when the buyer's national ID is already
  // registered, but only for the same person (see utils/owners.js). Checked
  // again here because the name may have been registered after the start.
  const match = await matchOwner(client, newOwner.national_id, newOwner.full_name);
  if (match.mismatch) throw new TransferError(409, match.mismatch, 'NATIONAL_ID_NAME_MISMATCH');
  let newOwnerId = match.owner?.owner_id ?? null;
  const newOwnerName = match.owner?.full_name ?? newOwner.full_name;
  if (!newOwnerId) {
    const ownerResult = await client.query(
      `INSERT INTO owner (full_name, contact_number, document_type, national_id) VALUES ($1, $2, $3, $4) RETURNING owner_id`,
      [newOwner.full_name, newOwner.contact_number || null, newOwner.document_type || null, newOwner.national_id || null]
    );
    newOwnerId = ownerResult.rows[0].owner_id;
  }

  // FR11: a new QR code for the new owner. The old marker stops being the
  // current code, so anyone scanning it is warned it was replaced.
  const qrVersion = current.qr_version + 1;
  const qr = await generateQrDataUrl(parcelId, qrVersion);
  await client.query(
    'UPDATE parcel SET current_owner_id = $1, qr_version = $2, unique_qr_code = $3, qr_signature = $4 WHERE parcel_id = $5',
    [newOwnerId, qrVersion, qr.code, qr.signature, parcelId]
  );
  await client.query(
    `INSERT INTO ownership_history (parcel_id, previous_owner_id, new_owner_id, processed_by, notes, transfer_reason, transfer_reason_details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [parcelId, current.current_owner_id, newOwnerId, officerId, notes?.trim() || 'Ownership transfer processed', reason.reason, reason.details]
  );
  await client.query(
    `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'PROCESS_TRANSFER', $2, $3)`,
    [officerId, parcelId, `Transferred from ${current.owner_name} to ${newOwnerName}; reason: ${reasonText(reason)}; consent: ${consent}; new QR code issued (version ${qrVersion})`]
  );
  if (requestId) {
    await client.query(
      `UPDATE transfer_request SET status = 'completed', handled_by = $1, handled_at = now() WHERE request_id = $2`,
      [officerId, requestId]
    );
  }
  // Any other pending request was made by the previous owner; it can never
  // be completed now, so close it instead of leaving it waiting forever.
  const closed = await client.query(
    `UPDATE transfer_request SET status = 'rejected', handled_by = $1, handled_at = now(), response_notes = $3
     WHERE parcel_id = $2 AND status = 'pending' RETURNING requested_by`,
    [officerId, parcelId, `Closed: the parcel was transferred to ${newOwnerName}.`]
  );
  return { newOwnerId, newOwnerName, qrVersion, qr, closedRequesters: closed.rows.map((r) => r.requested_by) };
}

// FR15: both owners (if they have accounts) hear about it by SMS
async function notifyTransfer(parcelId, current, newOwner, done, requestedBy) {
  const [previousOwners, newOwners] = await Promise.all([
    accountIdsForNationalId(current.owner_national_id),
    accountIdsForNationalId(newOwner.national_id),
  ]);
  notifyUsers(
    [...previousOwners, requestedBy],
    `Parcel #${parcelId} has been transferred from you to ${done.newOwnerName}.`,
    { link: '/my', sms: true }
  );
  notifyUsers(newOwners, `Parcel #${parcelId} is now registered to you.`, { link: `/my/parcels/${parcelId}`, sms: true });
  askForIdCheck(newOwner.national_id, parcelId);
  notifyUsers(
    done.closedRequesters,
    `Your transfer request for parcel #${parcelId} was closed because the parcel was transferred to ${done.newOwnerName}.`,
    { link: '/my/requests', sms: true }
  );
}

function completed(parcelId, done) {
  return {
    status: 'completed',
    message: 'Transfer processed',
    parcel_id: Number(parcelId),
    new_owner_id: done.newOwnerId,
    new_owner_name: done.newOwnerName,
    qr_version: done.qrVersion,
    qr_data_url: done.qr.dataUrl,
  };
}

function sendError(res, err, fallback) {
  if (err instanceof TransferError) {
    return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  console.error(err);
  return res.status(500).json({ error: fallback });
}

async function openTransferFor(db, parcelId) {
  const result = await db.query(
    `SELECT t.*, u.full_name AS started_by_name FROM pending_transfer t JOIN "user" u ON u.user_id = t.started_by
     WHERE t.parcel_id = $1 AND t.status = ANY($2::text[])`,
    [parcelId, OPEN]
  );
  return result.rows[0] || null;
}

const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// Sends the owner the consent code after the transfer is saved.
async function sendConsentCode(accounts, code, parcelId, newOwnerName, officerName) {
  const text = `DLOVS: Officer ${officerName} is transferring parcel #${parcelId} to ${newOwnerName}. If you agreed, give the officer this code: ${code}. If you did NOT agree, do not share it and report this to the land office.`;
  await Promise.all(accounts.map((a) => sendSms(a.phone_number, text)));
  notifyUsers(
    accounts.map((a) => a.user_id),
    `Officer ${officerName} started transferring parcel #${parcelId} to ${newOwnerName}. A code was sent to your phone by SMS. Only give it to the officer if you agreed to this transfer.`,
    { link: '/my' }
  );
  const exposeForDemo = !smsConfigured() && process.env.NODE_ENV !== 'production';
  return exposeForDemo ? code : undefined;
}

// GET /api/parcels/:id/transfer-consent: which consent the transfer form
// must collect, and any transfer already waiting.
async function transferConsent(req, res) {
  try {
    const parcel = await pool.query(
      'SELECT o.national_id FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id WHERE p.parcel_id = $1',
      [req.params.id]
    );
    if (parcel.rows.length === 0) return res.status(404).json({ error: 'Parcel not found' });
    const accounts = await ownerAccounts(pool, parcel.rows[0].national_id);
    const open = await openTransferFor(pool, req.params.id);
    res.json({
      method: accounts.length ? 'owner_code' : 'second_officer',
      owner_phones: accounts.map((a) => maskPhone(a.phone_number)),
      pending: open && presentPending(req.user, open),
    });
  } catch (err) {
    sendError(res, err, 'Failed to check transfer consent');
  }
}

// FR11: start a transfer. Ownership changes only with the owner's consent:
// their own request, an SMS code, or written consent approved by a second officer.
// POST /api/parcels/:id/transfer: LandOfficer.processTransfer(parcelId)
async function startTransfer(req, res) {
  const parcelId = Number(req.params.id);
  const { new_owner, notes, expected_owner_id, transfer_request_id } = req.body;
  const names = fourPartName(new_owner?.full_name, "the new owner's");
  if (names.error) return res.status(400).json({ error: names.error });
  const reason = transferReason(req.body.reason, req.body.reason_details);
  if (reason.error) return res.status(400).json({ error: reason.error });
  const newOwner = {
    full_name: names.name,
    national_id: new_owner?.national_id?.trim() || null,
    contact_number: new_owner?.contact_number?.trim() || null,
    document_type: new_owner?.document_type?.trim() || null,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await lockParcel(client, parcelId, expected_owner_id);
    if (newOwner.national_id && newOwner.national_id === current.owner_national_id) {
      throw new TransferError(409, `${current.owner_name} already owns this parcel`);
    }
    const match = await matchOwner(client, newOwner.national_id, newOwner.full_name);
    if (match.mismatch) throw new TransferError(409, match.mismatch, 'NATIONAL_ID_NAME_MISMATCH');
    if (await openTransferFor(client, parcelId)) {
      throw new TransferError(409, 'A transfer of this parcel is already waiting for consent. Complete or cancel it first.');
    }

    // 1. A citizen's transfer request is the owner's consent, for the buyer
    // they named, and nobody else.
    if (transfer_request_id != null) {
      const requestResult = await client.query(
        `SELECT request_id, requested_by, buyer_national_id FROM transfer_request
         WHERE request_id = $1 AND parcel_id = $2 AND status = 'pending' FOR UPDATE`,
        [transfer_request_id, parcelId]
      );
      const request = requestResult.rows[0];
      if (!request) throw new TransferError(409, 'That transfer request is no longer pending');
      if (newOwner.national_id !== request.buyer_national_id) {
        throw new TransferError(409, "The new owner's national ID must match the buyer the owner named in their request");
      }
      const done = await executeTransfer(client, {
        parcelId, current, newOwner, notes, officerId: req.user.user_id, requestId: request.request_id,
        consent: `owner's transfer request #${request.request_id}`, reason,
      });
      await client.query('COMMIT');
      notifyTransfer(parcelId, current, newOwner, done, request.requested_by);
      return res.json(completed(parcelId, done));
    }

    const accounts = await ownerAccounts(client, current.owner_national_id);
    const pendingColumns = [parcelId, current.current_owner_id, newOwner.full_name, newOwner.national_id,
      newOwner.contact_number, newOwner.document_type, notes?.trim() || null, req.user.user_id, reason.reason, reason.details];

    // 2. The owner has an account: they confirm with an SMS code.
    if (accounts.length) {
      const code = newCode();
      const inserted = await client.query(
        `INSERT INTO pending_transfer (parcel_id, expected_owner_id, new_owner_name, new_owner_national_id, new_owner_contact,
           new_owner_document, notes, started_by, transfer_reason, transfer_reason_details, consent_method, status, code_hash, code_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'owner_code', 'awaiting_owner', $11, now() + make_interval(mins => $12))
         RETURNING transfer_id`,
        [...pendingColumns, hashCode(code), CODE_TTL_MINUTES]
      );
      await client.query(
        `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'START_TRANSFER', $2, $3)`,
        [req.user.user_id, parcelId, `Started transfer from ${current.owner_name} to ${newOwner.full_name} (${reasonText(reason)}); SMS code sent to the owner`]
      );
      await client.query('COMMIT');
      const devCode = await sendConsentCode(accounts, code, parcelId, newOwner.full_name, req.user.full_name);
      return res.status(202).json({
        status: 'awaiting_owner',
        transfer_id: inserted.rows[0].transfer_id,
        sent_to: accounts.map((a) => maskPhone(a.phone_number)),
        dev_code: devCode,
      });
    }

    // 3. No account: the paper consent, approved by a second officer.
    const consentDocument = req.body.consent_document?.trim();
    if (!consentDocument || consentDocument.length < 10) {
      throw new TransferError(400, "Describe the owner's written consent (the document, who signed it and where) so a second officer can check it", 'CONSENT_DOCUMENT_REQUIRED');
    }
    const inserted = await client.query(
      `INSERT INTO pending_transfer (parcel_id, expected_owner_id, new_owner_name, new_owner_national_id, new_owner_contact,
         new_owner_document, notes, started_by, transfer_reason, transfer_reason_details, consent_method, status, consent_document)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'second_officer', 'awaiting_approval', $11)
       RETURNING transfer_id`,
      [...pendingColumns, consentDocument]
    );
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'START_TRANSFER', $2, $3)`,
      [req.user.user_id, parcelId, `Started transfer from ${current.owner_name} to ${newOwner.full_name} (${reasonText(reason)}); consent document: ${consentDocument}`]
    );
    await client.query('COMMIT');
    notifyOtherOfficers(req.user.user_id, `Transfer of parcel #${parcelId} to ${newOwner.full_name} needs a second officer's approval`);
    res.status(202).json({ status: 'awaiting_approval', transfer_id: inserted.rows[0].transfer_id });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, err, 'Transfer failed');
  } finally {
    client.release();
  }
}

async function notifyOtherOfficers(exceptUserId, message) {
  try {
    const result = await pool.query(
      `SELECT user_id FROM "user" WHERE role = 'land_officer' AND is_active AND user_id != $1`,
      [exceptUserId]
    );
    notifyUsers(result.rows.map((r) => r.user_id), message, { link: '/transfer-approvals' });
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

// Loads an open pending transfer, locked, or throws
async function lockPending(client, transferId, status) {
  const result = await client.query('SELECT * FROM pending_transfer WHERE transfer_id = $1 FOR UPDATE', [transferId]);
  const pending = result.rows[0];
  if (!pending) throw new TransferError(404, 'Transfer not found');
  if (pending.status !== status) throw new TransferError(409, 'This transfer is no longer waiting for that step');
  return pending;
}

const reasonText = (r) => (r.details ? `${r.reason}: ${r.details}` : r.reason);
const pendingReason = (p) => ({ reason: p.transfer_reason, details: p.transfer_reason_details });

const pendingOwner = (p) => ({
  full_name: p.new_owner_name,
  national_id: p.new_owner_national_id,
  contact_number: p.new_owner_contact,
  document_type: p.new_owner_document,
});

// POST /api/pending-transfers/:id/confirm { code }: the officer enters the
// code the owner read out
async function confirmWithCode(req, res) {
  const code = String(req.body?.code || '').trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await lockPending(client, req.params.id, 'awaiting_owner');
    if (pending.started_by !== req.user.user_id) {
      throw new TransferError(403, 'Only the officer who started this transfer can complete it');
    }
    if (new Date(pending.code_expires_at) < new Date()) {
      throw new TransferError(400, 'The code has expired. Send the owner a new one.');
    }
    if (pending.code_attempts >= MAX_CODE_ATTEMPTS) {
      throw new TransferError(429, 'Too many wrong codes. Send the owner a new one.');
    }
    const given = Buffer.from(hashCode(code));
    if (!crypto.timingSafeEqual(given, Buffer.from(pending.code_hash))) {
      // the failed attempt must count even though nothing else is saved
      await client.query('UPDATE pending_transfer SET code_attempts = code_attempts + 1 WHERE transfer_id = $1', [pending.transfer_id]);
      await client.query('COMMIT');
      return res.status(400).json({ error: 'That code is not correct. Check it with the owner.' });
    }
    const current = await lockParcel(client, pending.parcel_id, pending.expected_owner_id);
    const newOwner = pendingOwner(pending);
    const done = await executeTransfer(client, {
      parcelId: pending.parcel_id, current, newOwner, notes: pending.notes, officerId: req.user.user_id,
      consent: 'owner confirmed with the SMS code sent to their registered phone',
      reason: pendingReason(pending),
    });
    await client.query(
      `UPDATE pending_transfer SET status = 'completed', decided_by = $1, decided_at = now(), code_hash = NULL WHERE transfer_id = $2`,
      [req.user.user_id, pending.transfer_id]
    );
    await client.query('COMMIT');
    notifyTransfer(pending.parcel_id, current, newOwner, done);
    res.json(completed(pending.parcel_id, done));
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, err, 'Transfer failed');
  } finally {
    client.release();
  }
}

// POST /api/pending-transfers/:id/resend: a new code, e.g. the SMS was lost
async function resendCode(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await lockPending(client, req.params.id, 'awaiting_owner');
    if (pending.started_by !== req.user.user_id) {
      throw new TransferError(403, 'Only the officer who started this transfer can resend the code');
    }
    const owner = await client.query('SELECT national_id FROM owner WHERE owner_id = $1', [pending.expected_owner_id]);
    const accounts = await ownerAccounts(client, owner.rows[0].national_id);
    if (accounts.length === 0) throw new TransferError(409, "The owner's account can no longer receive codes. Cancel and start again.");
    const code = newCode();
    await client.query(
      `UPDATE pending_transfer SET code_hash = $1, code_attempts = 0, code_expires_at = now() + make_interval(mins => $2)
       WHERE transfer_id = $3`,
      [hashCode(code), CODE_TTL_MINUTES, pending.transfer_id]
    );
    await client.query('COMMIT');
    const devCode = await sendConsentCode(accounts, code, pending.parcel_id, pending.new_owner_name, req.user.full_name);
    res.json({ status: 'awaiting_owner', sent_to: accounts.map((a) => maskPhone(a.phone_number)), dev_code: devCode });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, err, 'Failed to send a new code');
  } finally {
    client.release();
  }
}

// PUT /api/pending-transfers/:id/approve: a second officer checks the
// consent document and approves (FR14 separation of duties)
async function approveTransfer(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await lockPending(client, req.params.id, 'awaiting_approval');
    if (pending.started_by === req.user.user_id) {
      throw new TransferError(403, 'You started this transfer, so another officer must approve it');
    }
    const current = await lockParcel(client, pending.parcel_id, pending.expected_owner_id);
    const newOwner = pendingOwner(pending);
    const approver = req.user.full_name;
    const done = await executeTransfer(client, {
      parcelId: pending.parcel_id, current, newOwner, notes: pending.notes, officerId: pending.started_by,
      consent: `written consent (${pending.consent_document}), approved by ${approver}`,
      reason: pendingReason(pending),
    });
    await client.query(
      `UPDATE pending_transfer SET status = 'completed', decided_by = $1, decided_at = now() WHERE transfer_id = $2`,
      [req.user.user_id, pending.transfer_id]
    );
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'APPROVE_TRANSFER', $2, $3)`,
      [req.user.user_id, pending.parcel_id, `Approved transfer #${pending.transfer_id} to ${done.newOwnerName} after checking: ${pending.consent_document}`]
    );
    await client.query('COMMIT');
    notifyTransfer(pending.parcel_id, current, newOwner, done);
    notifyUsers([pending.started_by], `${approver} approved the transfer of parcel #${pending.parcel_id} to ${done.newOwnerName}.`, { link: `/parcels/${pending.parcel_id}` });
    res.json(completed(pending.parcel_id, done));
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, err, 'Approval failed');
  } finally {
    client.release();
  }
}

// PUT /api/pending-transfers/:id/reject { reason }: the second officer
// isn't satisfied with the consent document
async function rejectTransfer(req, res) {
  const reason = req.body?.reason?.trim();
  if (!reason) return res.status(400).json({ error: 'Give a reason, so the officer knows what is missing' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await lockPending(client, req.params.id, 'awaiting_approval');
    if (pending.started_by === req.user.user_id) {
      throw new TransferError(403, 'You started this transfer, so cancel it instead');
    }
    await client.query(
      `UPDATE pending_transfer SET status = 'rejected', decided_by = $1, decided_at = now(), decision_notes = $2 WHERE transfer_id = $3`,
      [req.user.user_id, reason, pending.transfer_id]
    );
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'REJECT_TRANSFER', $2, $3)`,
      [req.user.user_id, pending.parcel_id, `Rejected transfer #${pending.transfer_id} to ${pending.new_owner_name}: ${reason}`]
    );
    await client.query('COMMIT');
    notifyUsers([pending.started_by], `${req.user.full_name} rejected the transfer of parcel #${pending.parcel_id}: ${reason}`, { link: `/parcels/${pending.parcel_id}` });
    res.json({ status: 'rejected' });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, err, 'Rejection failed');
  } finally {
    client.release();
  }
}

// PUT /api/pending-transfers/:id/cancel: by the officer who started it, or
// an administrator
async function cancelTransfer(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM pending_transfer WHERE transfer_id = $1 FOR UPDATE', [req.params.id]);
    const pending = result.rows[0];
    if (!pending) throw new TransferError(404, 'Transfer not found');
    if (!OPEN.includes(pending.status)) throw new TransferError(409, 'This transfer is already finished');
    if (pending.started_by !== req.user.user_id && req.user.role !== 'administrator') {
      throw new TransferError(403, 'Only the officer who started this transfer can cancel it');
    }
    await client.query(
      `UPDATE pending_transfer SET status = 'cancelled', decided_by = $1, decided_at = now(), code_hash = NULL WHERE transfer_id = $2`,
      [req.user.user_id, pending.transfer_id]
    );
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'CANCEL_TRANSFER', $2, $3)`,
      [req.user.user_id, pending.parcel_id, `Cancelled transfer #${pending.transfer_id} to ${pending.new_owner_name}`]
    );
    await client.query('COMMIT');
    if (pending.consent_method === 'owner_code') {
      alertOwner(pending.parcel_id, req.user, `cancelled the transfer of parcel #${pending.parcel_id} to ${pending.new_owner_name}. The code you received no longer works.`);
    }
    res.json({ status: 'cancelled' });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, err, 'Cancel failed');
  } finally {
    client.release();
  }
}

function presentPending(user, p) {
  const { code_hash, code_attempts, ...rest } = p;
  return {
    ...rest,
    can_approve: p.status === 'awaiting_approval' && user.role === 'land_officer' && p.started_by !== user.user_id,
    can_confirm: p.status === 'awaiting_owner' && p.started_by === user.user_id,
    can_cancel: OPEN.includes(p.status) && (p.started_by === user.user_id || user.role === 'administrator'),
  };
}

// GET /api/pending-transfers?status=open|all: the approvals queue
async function listPendingTransfers(req, res) {
  const status = req.query.status || 'open';
  if (!['open', 'all'].includes(status)) return res.status(400).json({ error: 'status must be open or all' });
  try {
    const result = await pool.query(
      `SELECT t.*, u.full_name AS started_by_name, d.full_name AS decided_by_name, p.neighbourhood,
              o.full_name AS owner_name
       FROM pending_transfer t
       JOIN parcel p ON p.parcel_id = t.parcel_id
       JOIN owner o ON o.owner_id = t.expected_owner_id
       JOIN "user" u ON u.user_id = t.started_by
       LEFT JOIN "user" d ON d.user_id = t.decided_by
       ${status === 'open' ? 'WHERE t.status = ANY($1::text[])' : ''}
       ORDER BY t.created_at DESC LIMIT 200`,
      status === 'open' ? [OPEN] : []
    );
    res.json(result.rows.map((p) => presentPending(req.user, p)));
  } catch (err) {
    sendError(res, err, 'Failed to load transfers');
  }
}

// ---------- Officer-free transfers ----------
// When the buyer named in an owner's transfer request has an account whose
// national ID an officer has confirmed, the buyer accepts in the app with an
// SMS code and the transfer completes without an officer. The owner's request
// and the buyer's code are both parties' consent; the audit log still records
// it, and officers can still complete the request at the office instead.

const RESEND_SECONDS = 60;

// The buyer's pending request, locked when inside a transaction.
async function buyersRequest(db, requestId, userId, lock = false) {
  const result = await db.query(
    `SELECT t.*, u.national_id AS buyer_account_national_id, u.national_id_verified_at, u.phone_number AS buyer_phone
     FROM transfer_request t JOIN "user" u ON u.user_id = t.buyer_user_id
     WHERE t.request_id = $1 ${lock ? 'FOR UPDATE OF t' : ''}`,
    [requestId]
  );
  const request = result.rows[0];
  if (!request || request.buyer_user_id !== userId) throw new TransferError(404, 'Transfer request not found');
  if (request.status !== 'pending') throw new TransferError(409, `This request is already ${request.status}`);
  // the account must still hold the confirmed national ID the owner named
  if (request.buyer_account_national_id !== request.buyer_national_id || !request.national_id_verified_at) {
    throw new TransferError(403, 'Your national ID must be confirmed at the land office before you can accept land');
  }
  return request;
}

// POST /api/transfer-requests/:id/accept-code: the buyer asks for the SMS code
async function sendAcceptCode(req, res) {
  try {
    const request = await buyersRequest(pool, Number(req.params.id), req.user.user_id);
    if (request.accept_code_sent_at && Date.now() - new Date(request.accept_code_sent_at).getTime() < RESEND_SECONDS * 1000) {
      throw new TransferError(429, 'Please wait a minute before requesting another code.');
    }
    const code = newCode();
    await pool.query(
      `UPDATE transfer_request SET accept_code_hash = $1, accept_code_attempts = 0, accept_code_sent_at = now(),
         accept_code_expires_at = now() + make_interval(mins => $2) WHERE request_id = $3`,
      [hashCode(code), CODE_TTL_MINUTES, request.request_id]
    );
    await sendSms(
      request.buyer_phone,
      `DLOVS: your code to accept parcel #${request.parcel_id} is ${code}. Only enter it if you agreed to this transfer and checked the plot.`
    );
    const exposeForDemo = !smsConfigured() && process.env.NODE_ENV !== 'production';
    res.json({ sent_to: maskPhone(request.buyer_phone), dev_code: exposeForDemo ? code : undefined });
  } catch (err) {
    sendError(res, err, 'Failed to send the code');
  }
}

// POST /api/transfer-requests/:id/accept: the buyer enters the code and the
// parcel is transferred to them
async function acceptTransferRequest(req, res) {
  const requestId = Number(req.params.id);
  const client = await pool.connect();
  let request;
  let current;
  let done;
  try {
    await client.query('BEGIN');
    request = await buyersRequest(client, requestId, req.user.user_id, true);
    if (!request.accept_code_hash) throw new TransferError(400, 'Ask for a code first');
    if (request.accept_code_attempts >= MAX_CODE_ATTEMPTS) {
      throw new TransferError(429, 'Too many wrong codes. Ask for a new code.');
    }
    if (new Date(request.accept_code_expires_at) < new Date()) throw new TransferError(400, 'This code has expired. Ask for a new code.');
    if (hashCode(String(req.body.code || '').trim()) !== request.accept_code_hash) {
      await client.query('UPDATE transfer_request SET accept_code_attempts = accept_code_attempts + 1 WHERE request_id = $1', [requestId]);
      await client.query('COMMIT');
      return res.status(400).json({ error: 'Wrong code' });
    }

    current = await lockParcel(client, request.parcel_id);
    // the land must still belong to the owner who made the request
    const requester = await client.query(
      'SELECT national_id FROM "user" WHERE user_id = $1 AND is_active AND national_id_verified_at IS NOT NULL',
      [request.requested_by]
    );
    if (!requester.rows[0] || requester.rows[0].national_id !== current.owner_national_id) {
      throw new TransferError(409, 'The parcel is no longer registered to the owner who made this request');
    }
    if (await openTransferFor(client, request.parcel_id)) {
      throw new TransferError(409, 'An officer has started another transfer of this parcel. Contact the land office.');
    }
    done = await executeTransfer(client, {
      parcelId: request.parcel_id,
      current,
      newOwner: { full_name: request.buyer_full_name, national_id: request.buyer_national_id, contact_number: request.buyer_contact },
      notes: request.notes || 'Transfer agreed by the owner and the buyer in DLOVS',
      officerId: null,
      requestId,
      consent: `owner's transfer request #${requestId} and the buyer's SMS code (no officer needed)`,
      reason: { reason: request.transfer_reason, details: request.transfer_reason_details },
    });
    await client.query('UPDATE transfer_request SET handled_by = $1, accept_code_hash = NULL WHERE request_id = $2', [req.user.user_id, requestId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return sendError(res, err, 'Failed to accept the transfer');
  } finally {
    client.release();
  }
  notifyTransfer(request.parcel_id, current, { national_id: request.buyer_national_id }, done, request.requested_by);
  // the old plot marker now reads "replaced", so an officer prints the new one
  notifyOfficers(
    `Parcel #${request.parcel_id} was transferred to ${done.newOwnerName} by the owner and buyer. Print and install the new QR marker.`,
    { link: `/parcels/${request.parcel_id}` }
  );
  res.json(completed(request.parcel_id, done));
}

// PUT /api/transfer-requests/:id/decline: the buyer turns the request down
async function declineTransferRequest(req, res) {
  try {
    const request = await buyersRequest(pool, Number(req.params.id), req.user.user_id);
    const notes = req.body.reason?.trim() || 'The buyer declined the transfer';
    await pool.query(
      `UPDATE transfer_request SET status = 'rejected', handled_by = $1, handled_at = now(), response_notes = $2, accept_code_hash = NULL
       WHERE request_id = $3 AND status = 'pending'`,
      [req.user.user_id, notes, request.request_id]
    );
    notifyUsers(
      [request.requested_by],
      `${request.buyer_full_name} declined your request to transfer parcel #${request.parcel_id}: ${notes}`,
      { link: '/my/requests', sms: true }
    );
    res.json({ status: 'rejected' });
  } catch (err) {
    sendError(res, err, 'Failed to decline the transfer');
  }
}

module.exports = {
  transferConsent, startTransfer, confirmWithCode, resendCode, approveTransfer, rejectTransfer, cancelTransfer,
  listPendingTransfers, sendAcceptCode, acceptTransferRequest, declineTransferRequest,
};
