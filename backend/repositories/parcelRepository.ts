import pool from '../db/pool';
import type { Db } from './db';

// Search returns pages of this size; the total number of matches travels with each row.
export const SEARCH_PAGE_SIZE = 50;

// FR06 search pathways (FR17 filters are applied in the apps)
export const SEARCH_CONDITIONS: Record<string, string> = {
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

const METRES_PER_DEGREE_LAT = 111320;

// Smallest lat/lng rectangle containing every point within radiusMetres.
// Slightly larger than the circle, so the Haversine check still decides.
export function boundingBox(lat: number, lng: number, radiusMetres: number) {
  const dLat = radiusMetres / METRES_PER_DEGREE_LAT;
  const dLng = radiusMetres / (METRES_PER_DEGREE_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export interface SearchPage {
  rows: Record<string, unknown>[];
  total: number;
}

function toPage(rows: Record<string, unknown>[], offset: number): SearchPage {
  // an empty page past the end has no row to carry the total
  const total = rows.length ? Number(rows[0].total_count) : offset;
  return { rows: rows.map(({ total_count: _total, ...row }) => row), total };
}

export async function searchByText(by: string, query: string, offset: number): Promise<SearchPage> {
  // Page the matching IDs first, so document counts are only worked out for this page.
  const result = await pool.query(
    `SELECT ${SEARCH_COLUMNS}, page.total_count
     FROM (
       SELECT p.parcel_id, COUNT(*) OVER()::int AS total_count
       FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
       WHERE ${SEARCH_CONDITIONS[by]}
       ORDER BY p.parcel_id LIMIT ${SEARCH_PAGE_SIZE} OFFSET $2
     ) page
     JOIN parcel p ON p.parcel_id = page.parcel_id
     JOIN owner o ON o.owner_id = p.current_owner_id
     ORDER BY p.parcel_id`,
    [query, offset]
  );
  return toPage(result.rows, offset);
}

export async function searchNear(lat: number, lng: number, radius: number, offset: number): Promise<SearchPage> {
  // A lat/lng box around the circle uses idx_parcel_gps to skip distant
  // parcels, so the exact Haversine distance only runs on nearby ones;
  // document counts are added only for the page being returned.
  const box = boundingBox(lat, lng, radius);
  const result = await pool.query(
    `SELECT ${SEARCH_COLUMNS}, near.distance_m, near.total_count
     FROM (
       SELECT parcel_id, distance_m, COUNT(*) OVER()::int AS total_count FROM (
         SELECT p.parcel_id, ROUND(${DISTANCE_SQL})::int AS distance_m
         FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
         WHERE p.gps_lat BETWEEN $4 AND $5 AND p.gps_lng BETWEEN $6 AND $7
       ) measured
       WHERE distance_m <= $3
       ORDER BY distance_m, parcel_id LIMIT ${SEARCH_PAGE_SIZE} OFFSET $8
     ) near
     JOIN parcel p ON p.parcel_id = near.parcel_id
     JOIN owner o ON o.owner_id = p.current_owner_id
     ORDER BY near.distance_m, p.parcel_id`,
    [lat, lng, radius, box.minLat, box.maxLat, box.minLng, box.maxLng, offset]
  );
  return toPage(result.rows, offset);
}

export interface NewParcel {
  lat: number;
  lng: number;
  neighbourhood: string;
  areaSqm: number | null;
  registeredBy: number;
  ownerId: number;
}

// The QR code is signed with the new parcel ID, so the row is inserted first and the code set after.
export async function insertParcel(db: Db, parcel: NewParcel): Promise<number> {
  const result = await db.query(
    `INSERT INTO parcel (gps_lat, gps_lng, neighbourhood, area_sqm, unique_qr_code, qr_signature, registered_by, current_owner_id)
     VALUES ($1, $2, $3, $4, 'pending', 'pending', $5, $6) RETURNING parcel_id`,
    [parcel.lat, parcel.lng, parcel.neighbourhood, parcel.areaSqm, parcel.registeredBy, parcel.ownerId]
  );
  return result.rows[0].parcel_id;
}

export async function setQrCode(db: Db, parcelId: number, code: string, signature: string): Promise<void> {
  await db.query('UPDATE parcel SET unique_qr_code = $1, qr_signature = $2 WHERE parcel_id = $3', [code, signature, parcelId]);
}

export async function recordInitialOwner(db: Db, parcelId: number, ownerId: number, officerId: number): Promise<void> {
  await db.query(
    `INSERT INTO ownership_history (parcel_id, previous_owner_id, new_owner_id, processed_by, notes)
     VALUES ($1, NULL, $2, $3, 'Initial registration')`,
    [parcelId, ownerId, officerId]
  );
}

export async function findWithOwner(parcelId: number | string) {
  const result = await pool.query(
    `SELECT p.*, o.full_name AS owner_name, o.national_id, o.document_reference
     FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id WHERE p.parcel_id = $1`,
    [parcelId]
  );
  return result.rows[0] as Record<string, any> | undefined;
}

export async function findQrVersion(parcelId: number | string): Promise<number | null> {
  const result = await pool.query('SELECT qr_version FROM parcel WHERE parcel_id = $1', [parcelId]);
  return result.rows.length ? result.rows[0].qr_version : null;
}

// FR07: the history, disputes and documents shown on an ownership record
export async function recordDetails(parcelId: number | string) {
  const [history, disputes, documents] = await Promise.all([
    pool.query(
      `SELECT oh.*, o1.full_name AS previous_owner_name, o2.full_name AS new_owner_name
       FROM ownership_history oh
       LEFT JOIN owner o1 ON o1.owner_id = oh.previous_owner_id
       JOIN owner o2 ON o2.owner_id = oh.new_owner_id
       WHERE oh.parcel_id = $1 ORDER BY oh.transfer_date ASC`,
      [parcelId]
    ),
    pool.query(`SELECT dispute_id, dispute_type, status, created_at FROM dispute WHERE parcel_id = $1 ORDER BY created_at DESC`, [parcelId]),
    pool.query(
      `SELECT document_id, document_type, file_type, verification_status, upload_date FROM document WHERE parcel_id = $1 ORDER BY upload_date`,
      [parcelId]
    ),
  ]);
  return { history: history.rows, disputes: disputes.rows, documents: documents.rows };
}

export async function nationalIdOwnsLand(nationalId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id WHERE o.national_id = $1 LIMIT 1',
    [nationalId]
  );
  return result.rows.length > 0;
}

export async function parcelsOfNationalId(nationalId: string) {
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
  return result.rows;
}

// Locks the row for the rest of the transaction, so two officers can't edit it at once.
export async function lockForEdit(db: Db, parcelId: number | string) {
  const result = await db.query(
    'SELECT neighbourhood, gps_lat, gps_lng, area_sqm, status FROM parcel WHERE parcel_id = $1 FOR UPDATE',
    [parcelId]
  );
  return result.rows[0] as Record<string, any> | undefined;
}

export const EDITABLE_FIELDS = ['neighbourhood', 'gps_lat', 'gps_lng', 'area_sqm'];

export async function updateFields(db: Db, parcelId: number | string, changes: Record<string, unknown>): Promise<void> {
  // only known column names reach the SQL; values are always parameters
  const fields = Object.keys(changes).filter((f) => EDITABLE_FIELDS.includes(f));
  const sets = fields.map((field, i) => `${field} = $${i + 2}`).join(', ');
  await db.query(`UPDATE parcel SET ${sets} WHERE parcel_id = $1`, [parcelId, ...fields.map((f) => changes[f])]);
}

export async function dashboardStats(userId: number, isAdmin: boolean) {
  const [parcels, disputes, mine, recent, queues, recentParcels] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active')::int AS active,
                COUNT(*) FILTER (WHERE status = 'disputed')::int AS disputed,
                COUNT(*) FILTER (WHERE status = 'deactivated')::int AS deactivated FROM parcel`),
    pool.query(`SELECT COUNT(*)::int AS open FROM dispute WHERE status != 'resolved'`),
    pool.query(
      `SELECT COUNT(*)::int AS actions FROM audit_log WHERE officer_id = $1 AND timestamp > now() - interval '7 days' AND action_type != 'VERIFY_PARCEL'`,
      [userId]
    ),
    pool.query(
      `SELECT a.log_id, a.action_type, a.parcel_id, a.details, a.timestamp, u.full_name AS officer_name
       FROM audit_log a LEFT JOIN "user" u ON u.user_id = a.officer_id
       WHERE a.action_type != 'VERIFY_PARCEL' ${isAdmin ? '' : 'AND a.officer_id = $1'}
       ORDER BY a.timestamp DESC LIMIT 6`,
      isAdmin ? [] : [userId]
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
      [userId]
    ),
    pool.query(
      `SELECT p.parcel_id, p.neighbourhood, p.status, o.full_name AS owner_name,
              GREATEST(p.registered_date, (SELECT MAX(h.transfer_date) FROM ownership_history h WHERE h.parcel_id = p.parcel_id)) AS updated_at
       FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
       ORDER BY updated_at DESC, p.parcel_id DESC LIMIT 8`
    ),
  ]);
  return {
    parcels: parcels.rows[0],
    open_disputes: disputes.rows[0].open,
    ...queues.rows[0],
    my_actions_7_days: mine.rows[0].actions,
    recent_activity: recent.rows,
    recent_parcels: recentParcels.rows,
  };
}
