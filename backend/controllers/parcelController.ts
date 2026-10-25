import { Request, Response } from 'express';
import pool from '../db/pool';
import { generateQrDataUrl, checkSignature } from '../utils/qr';
import { askForIdCheck, alertOwner } from '../utils/notify';
import { NEIGHBOURHOODS, CITY, canonicalNeighbourhood } from '../utils/neighbourhoods';
import { fourPartName } from '../utils/names';
import { matchOwner } from '../utils/owners';
import { TRANSFER_REASONS } from '../utils/transferReasons';
import type { AuthUser } from '../middleware/auth';

const STAFF_ROLES = ['land_officer', 'administrator'];
const isStaff = (user: AuthUser | undefined) => Boolean(user && STAFF_ROLES.includes(user.role));

const STAFF_ONLY_SEARCHES = ['national_id'];
const SEARCH_CONDITIONS: Record<string, string> = {
  parcel_id: 'CAST(p.parcel_id AS TEXT) = $1',
  neighbourhood: "(p.neighbourhood ILIKE '%' || $1 || '%' OR p.city ILIKE $1)",
  owner_name: "o.full_name ILIKE '%' || $1 || '%'",
  national_id: 'o.national_id = $1',
  any: "CAST(p.parcel_id AS TEXT) = $1 OR p.neighbourhood ILIKE '%' || $1 || '%' OR p.city ILIKE $1 OR o.full_name ILIKE '%' || $1 || '%'",
};

const DISTANCE_SQL = `(2 * 6371000 * asin(sqrt(
  power(sin(radians(p.gps_lat::float8 - $1) / 2), 2) +
  cos(radians($1)) * cos(radians(p.gps_lat::float8)) * power(sin(radians(p.gps_lng::float8 - $2) / 2), 2)
)))`;

const SEARCH_COLUMNS = `
  p.parcel_id, p.neighbourhood, p.city, p.status, p.registered_date, o.owner_id, o.full_name AS owner_name,
  (SELECT COUNT(*)::int FROM document d WHERE d.parcel_id = p.parcel_id AND d.verification_status = 'verified') AS verified_documents,
  (SELECT COUNT(*)::int FROM document d WHERE d.parcel_id = p.parcel_id AND d.verification_status = 'pending') AS pending_documents`;

export async function createParcel(req: Request, res: Response) {
  const { gps_lat, gps_lng, area_sqm, owner } = req.body;
  const neighbourhood = canonicalNeighbourhood(req.body.neighbourhood);
  if (gps_lat == null || gps_lng == null || !neighbourhood || !owner || !owner.full_name) {
    return res.status(400).json({ error: 'gps_lat, gps_lng, neighbourhood, and owner.full_name are required' });
  }
  const lat = Number(gps_lat);
  const lng = Number(gps_lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'gps_lat must be between -90 and 90 and gps_lng between -180 and 180' });
  }
  const ownerName = fourPartName(owner.full_name);
  if (ownerName.error) return res.status(400).json({ error: ownerName.error });
  const nationalId: string | null = owner.national_id?.trim() || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const match = await matchOwner(client, nationalId, ownerName.name!);
    if (match.mismatch) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: match.mismatch, code: 'NATIONAL_ID_NAME_MISMATCH' });
    }
    let owner_id: number = match.owner?.owner_id ?? 0;
    if (!owner_id) {
      const ownerResult = await client.query(
        `INSERT INTO owner (full_name, contact_number, document_type, document_reference, national_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING owner_id`,
        [ownerName.name, owner.contact_number || null, owner.document_type || null, owner.document_reference || null, nationalId]
      );
      owner_id = ownerResult.rows[0].owner_id;
    }
    const parcelInsert = await client.query(
      `INSERT INTO parcel (gps_lat, gps_lng, neighbourhood, area_sqm, unique_qr_code, qr_signature, registered_by, current_owner_id)
       VALUES ($1, $2, $3, $4, 'pending', 'pending', $5, $6) RETURNING parcel_id`,
      [lat, lng, neighbourhood, area_sqm || null, req.user!.user_id, owner_id]
    );
    const parcel_id: number = parcelInsert.rows[0].parcel_id;
    const { code, signature, dataUrl } = await generateQrDataUrl(parcel_id);
    await client.query('UPDATE parcel SET unique_qr_code = $1, qr_signature = $2 WHERE parcel_id = $3', [code, signature, parcel_id]);
    await client.query(
      `INSERT INTO ownership_history (parcel_id, previous_owner_id, new_owner_id, processed_by, notes)
       VALUES ($1, NULL, $2, $3, 'Initial registration')`,
      [parcel_id, owner_id, req.user!.user_id]
    );
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'CREATE_PARCEL', $2, $3)`,
      [req.user!.user_id, parcel_id, `Registered parcel in ${neighbourhood} for owner ${ownerName.name}`]
    );
    await client.query('COMMIT');
    const full = await pool.query(
      `SELECT p.*, o.full_name AS owner_name FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id WHERE p.parcel_id = $1`,
      [parcel_id]
    );
    askForIdCheck(nationalId, parcel_id);
    alertOwner(parcel_id, req.user!, `registered parcel #${parcel_id} in ${neighbourhood} to you.`);
    res.status(201).json({ ...full.rows[0], qr_data_url: dataUrl });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create parcel record' });
  } finally {
    client.release();
  }
}

export async function getQrCode(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT parcel_id, qr_version FROM parcel WHERE parcel_id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Parcel not found' });
    const { qr_version: version } = result.rows[0];
    const { dataUrl } = await generateQrDataUrl(Number(id), version);
    res.json({ parcel_id: id, qr_version: version, qr_data_url: dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
}

export async function searchParcel(req: Request, res: Response) {
  const by = String(req.query.by || 'any');
  try {
    if (by === 'near') {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const radius = req.query.radius === undefined ? 200 : Number(req.query.radius);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'lat and lng are required for a GPS search' });
      }
      if (!Number.isFinite(radius) || radius <= 0 || radius > 5000) {
        return res.status(400).json({ error: 'radius must be between 1 and 5000 metres' });
      }
      const result = await pool.query(
        `SELECT * FROM (
           SELECT ${SEARCH_COLUMNS}, ROUND(${DISTANCE_SQL})::int AS distance_m
           FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
         ) found
         WHERE distance_m <= $3
         ORDER BY distance_m LIMIT 50`,
        [lat, lng, radius]
      );
      return res.json(result.rows);
    }
    let query = (String(req.query.query ?? '')).trim();
    if (by === 'neighbourhood' || by === 'any') query = query.replace(/^hai\s+/i, '') || query;
    if (!query) return res.status(400).json({ error: 'query parameter is required' });
    if (!SEARCH_CONDITIONS[by]) {
      return res.status(400).json({ error: `by must be one of ${[...Object.keys(SEARCH_CONDITIONS), 'near'].join(', ')}` });
    }
    if (STAFF_ONLY_SEARCHES.includes(by) && !isStaff(req.user)) {
      return res.status(403).json({ error: 'Only land officers can search by national ID', code: 'STAFF_ONLY_SEARCH' });
    }
    const result = await pool.query(
      `SELECT ${SEARCH_COLUMNS}
       FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
       WHERE ${SEARCH_CONDITIONS[by]}
       ORDER BY p.parcel_id LIMIT 50`,
      [query]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
}

export async function verifyParcel(req: Request, res: Response) {
  const id = String(req.params.id);
  const { signature, device_lat, device_lng } = req.query as Record<string, string | undefined>;
  try {
    const parcelResult = await pool.query(
      `SELECT p.*, o.full_name AS owner_name, o.national_id, o.document_reference
       FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id WHERE p.parcel_id = $1`,
      [id]
    );
    if (parcelResult.rows.length === 0) return res.status(404).json({ error: 'Parcel not found' });
    const parcel = parcelResult.rows[0];
    const qr_check = signature ? checkSignature(id, parcel.qr_version, signature) : null;
    if (qr_check === 'invalid') {
      return res.status(400).json({ error: 'Invalid QR signature: this code may be tampered with', code: 'QR_INVALID' });
    }
    if (!isStaff(req.user)) {
      delete parcel.national_id;
      delete parcel.document_reference;
      delete parcel.unique_qr_code;
      delete parcel.qr_signature;
    }
    const [historyResult, disputesResult, documentsResult] = await Promise.all([
      pool.query(
        `SELECT oh.*, o1.full_name AS previous_owner_name, o2.full_name AS new_owner_name
         FROM ownership_history oh
         LEFT JOIN owner o1 ON o1.owner_id = oh.previous_owner_id
         JOIN owner o2 ON o2.owner_id = oh.new_owner_id
         WHERE oh.parcel_id = $1 ORDER BY oh.transfer_date ASC`,
        [id]
      ),
      pool.query(
        `SELECT dispute_id, dispute_type, status, created_at FROM dispute WHERE parcel_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
      pool.query(
        `SELECT document_id, document_type, file_type, verification_status, upload_date FROM document WHERE parcel_id = $1 ORDER BY upload_date`,
        [id]
      ),
    ]);
    const lastTransfer = historyResult.rows.length > 1 ? historyResult.rows[historyResult.rows.length - 1].transfer_date : null;
    let gps_match: boolean | null = null;
    let distance_meters: number | null = null;
    if (device_lat != null && device_lng != null) {
      distance_meters = haversineMeters(parseFloat(device_lat), parseFloat(device_lng), parseFloat(parcel.gps_lat), parseFloat(parcel.gps_lng));
      gps_match = distance_meters <= 10;
    }
    await pool.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'VERIFY_PARCEL', $2, $3)`,
      [
        req.user?.user_id ?? null,
        id,
        `Ownership record viewed${qr_check ? `, QR code ${qr_check}` : ''}${gps_match !== null ? `, GPS match: ${gps_match}` : ''}`,
      ]
    );
    res.json({
      parcel,
      qr_check,
      qr_issued_at: qr_check === 'superseded' ? lastTransfer : undefined,
      ownership_history: historyResult.rows,
      disputes: disputesResult.rows,
      documents: documentsResult.rows,
      gps_check: device_lat != null ? { gps_match, distance_meters } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
}

export async function viewOwnParcels(req: Request, res: Response) {
  try {
    const userResult = await pool.query(
      'SELECT national_id, national_id_verified_at FROM "user" WHERE user_id = $1',
      [req.user!.user_id]
    );
    const { national_id: nationalId, national_id_verified_at: verifiedAt } = userResult.rows[0];
    if (!nationalId) {
      return res.json({ parcels: [], id_status: 'missing', message: 'Add your national ID to your profile to see parcels registered to you' });
    }
    if (!verifiedAt) {
      const owns = await pool.query(
        `SELECT 1 FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id WHERE o.national_id = $1 LIMIT 1`,
        [nationalId]
      );
      if (owns.rows.length === 0) {
        return res.json({ parcels: [], id_status: 'no_land', message: "No parcels are registered to your national ID. If land is registered to it, we'll ask you to show your ID card at the land office." });
      }
      return res.json({ parcels: [], id_status: 'pending', message: 'Show your national ID card at the land office once. After an officer confirms it, your parcels appear here.' });
    }
    const result = await pool.query(
      `SELECT p.parcel_id, p.neighbourhood, p.status, p.registered_date, p.gps_lat, p.gps_lng, p.area_sqm,
              (SELECT COUNT(*)::int FROM document d WHERE d.parcel_id = p.parcel_id AND d.verification_status = 'verified') AS verified_documents,
              (SELECT COUNT(*)::int FROM document d WHERE d.parcel_id = p.parcel_id AND d.verification_status = 'pending') AS pending_documents,
              (SELECT COUNT(*)::int FROM dispute x WHERE x.parcel_id = p.parcel_id AND x.status != 'resolved') AS open_disputes,
              EXISTS (SELECT 1 FROM transfer_request t WHERE t.parcel_id = p.parcel_id AND t.status = 'pending') AS transfer_pending
       FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
       WHERE o.national_id = $1 ORDER BY p.registered_date DESC`,
      [nationalId]
    );
    res.json({ parcels: result.rows, id_status: 'verified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch parcels' });
  }
}

const EDITABLE_FIELDS = ['neighbourhood', 'gps_lat', 'gps_lng', 'area_sqm'];

export async function updateParcel(req: Request, res: Response) {
  const { id } = req.params;
  const changes: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) changes[field] = req.body[field];
  }
  if (changes.neighbourhood !== undefined) {
    changes.neighbourhood = canonicalNeighbourhood(changes.neighbourhood as string);
    if (!changes.neighbourhood) return res.status(400).json({ error: 'neighbourhood cannot be empty' });
  }
  for (const [field, min, max] of [['gps_lat', -90, 90], ['gps_lng', -180, 180]] as [string, number, number][]) {
    if (changes[field] !== undefined) {
      const value = Number(changes[field]);
      if (changes[field] === null || changes[field] === '' || !Number.isFinite(value) || value < min || value > max) {
        return res.status(400).json({ error: `${field} must be a number between ${min} and ${max}` });
      }
      changes[field] = value;
    }
  }
  if (changes.area_sqm !== undefined) {
    if (changes.area_sqm === null || changes.area_sqm === '') changes.area_sqm = null;
    else if (!(Number(changes.area_sqm) > 0)) return res.status(400).json({ error: 'area_sqm must be a positive number' });
    else changes.area_sqm = Number(changes.area_sqm);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT neighbourhood, gps_lat, gps_lng, area_sqm, status FROM parcel WHERE parcel_id = $1 FOR UPDATE`,
      [id]
    );
    if (currentResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Parcel not found' }); }
    const current = currentResult.rows[0];
    if (current.status === 'deactivated') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Deactivated parcel records cannot be edited' }); }
    const same = (field: string) =>
      field === 'neighbourhood' ? current[field] === changes[field] : (current[field] == null ? null : Number(current[field])) === changes[field];
    const changed = Object.keys(changes).filter((field) => !same(field));
    if (changed.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Nothing to update' }); }
    const sets = changed.map((field, i) => `${field} = $${i + 2}`).join(', ');
    await client.query(`UPDATE parcel SET ${sets} WHERE parcel_id = $1`, [id, ...changed.map((f) => changes[f])]);
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'UPDATE_PARCEL', $2, $3)`,
      [req.user!.user_id, id, changed.map((f) => `${f}: ${current[f] ?? '-'} → ${changes[f] ?? '-'}`).join('; ')]
    );
    await client.query('COMMIT');
    alertOwner(Number(id), req.user!, `changed the record of parcel #${id} (${changed.join(', ')}).`);
    res.json({ message: 'Parcel updated', parcel_id: Number(id), changed });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update parcel' });
  } finally {
    client.release();
  }
}

export async function getStats(req: Request, res: Response) {
  const isAdmin = req.user!.role === 'administrator';
  try {
    const [parcels, disputes, mine, recent, queues, recentParcels] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active')::int AS active,
                  COUNT(*) FILTER (WHERE status = 'disputed')::int AS disputed,
                  COUNT(*) FILTER (WHERE status = 'deactivated')::int AS deactivated FROM parcel`),
      pool.query(`SELECT COUNT(*)::int AS open FROM dispute WHERE status != 'resolved'`),
      pool.query(
        `SELECT COUNT(*)::int AS actions FROM audit_log WHERE officer_id = $1 AND timestamp > now() - interval '7 days' AND action_type != 'VERIFY_PARCEL'`,
        [req.user!.user_id]
      ),
      pool.query(
        `SELECT a.log_id, a.action_type, a.parcel_id, a.details, a.timestamp, u.full_name AS officer_name
         FROM audit_log a LEFT JOIN "user" u ON u.user_id = a.officer_id
         WHERE a.action_type != 'VERIFY_PARCEL' ${isAdmin ? '' : 'AND a.officer_id = $1'}
         ORDER BY a.timestamp DESC LIMIT 6`,
        isAdmin ? [] : [req.user!.user_id]
      ),
      pool.query(
        `SELECT (SELECT COUNT(*) FROM document WHERE verification_status = 'pending')::int AS pending_documents,
                (SELECT COUNT(*) FROM unregistered_report WHERE status = 'open')::int AS open_reports,
                (SELECT COUNT(*) FROM transfer_request WHERE status = 'pending')::int AS pending_transfer_requests,
                (SELECT COUNT(*) FROM pending_transfer WHERE status = 'awaiting_approval' AND started_by != $1)::int AS pending_transfer_approvals,
                (SELECT COUNT(*) FROM "user" u WHERE u.role = 'citizen' AND u.is_active AND u.national_id IS NOT NULL
                   AND u.national_id_verified_at IS NULL
                   AND EXISTS (SELECT 1 FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
                     WHERE o.national_id = u.national_id))::int AS pending_id_checks`,
        [req.user!.user_id]
      ),
      pool.query(
        `SELECT p.parcel_id, p.neighbourhood, p.status, o.full_name AS owner_name,
                GREATEST(p.registered_date, (SELECT MAX(h.transfer_date) FROM ownership_history h WHERE h.parcel_id = p.parcel_id)) AS updated_at
         FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
         ORDER BY updated_at DESC, p.parcel_id DESC LIMIT 8`
      ),
    ]);
    res.json({
      parcels: parcels.rows[0],
      open_disputes: disputes.rows[0].open,
      pending_documents: queues.rows[0].pending_documents,
      open_reports: queues.rows[0].open_reports,
      pending_transfer_requests: queues.rows[0].pending_transfer_requests,
      pending_transfer_approvals: queues.rows[0].pending_transfer_approvals,
      pending_id_checks: queues.rows[0].pending_id_checks,
      my_actions_7_days: mine.rows[0].actions,
      recent_activity: recent.rows,
      recent_parcels: recentParcels.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function listTransferReasons(_req: Request, res: Response) { res.json(TRANSFER_REASONS); }
export function listNeighbourhoods(_req: Request, res: Response) { res.json({ city: CITY, neighbourhoods: NEIGHBOURHOODS }); }
