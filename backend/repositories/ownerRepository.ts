import type { Db } from './db';

export interface NewOwner {
  full_name: string;
  contact_number?: string | null;
  document_type?: string | null;
  document_reference?: string | null;
  national_id?: string | null;
}

export async function createOwner(db: Db, owner: NewOwner): Promise<number> {
  const result = await db.query(
    `INSERT INTO owner (full_name, contact_number, document_type, document_reference, national_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING owner_id`,
    [owner.full_name, owner.contact_number || null, owner.document_type || null, owner.document_reference || null, owner.national_id || null]
  );
  return result.rows[0].owner_id;
}

export async function findOwnerById(db: Db, ownerId: number | string) {
  const result = await db.query('SELECT owner_id, full_name, national_id, contact_number FROM owner WHERE owner_id = $1', [ownerId]);
  return result.rows[0] as { owner_id: number; full_name: string; national_id: string | null; contact_number: string | null } | undefined;
}

// FR09: every parcel an owner holds now (matched by owner record or national ID), and the parcels they
// have transferred away, with who they went to
export async function portfolio(db: Db, owner: { owner_id: number; national_id: string | null }) {
  const [current, previous] = await Promise.all([
    db.query(
      `SELECT p.parcel_id, p.neighbourhood, p.gps_lat, p.gps_lng, p.area_sqm, p.status, p.registered_date,
              (SELECT COUNT(*)::int FROM document d WHERE d.parcel_id = p.parcel_id AND d.verification_status = 'verified') AS verified_documents
       FROM parcel p JOIN owner o ON o.owner_id = p.current_owner_id
       WHERE o.owner_id = $1 OR (o.national_id IS NOT NULL AND o.national_id = $2)
       ORDER BY p.registered_date, p.parcel_id`,
      [owner.owner_id, owner.national_id]
    ),
    db.query(
      `SELECT DISTINCT ON (h.parcel_id) h.parcel_id, h.transfer_date, nw.full_name AS transferred_to
       FROM ownership_history h
       JOIN owner pr ON pr.owner_id = h.previous_owner_id
       JOIN owner nw ON nw.owner_id = h.new_owner_id
       WHERE pr.owner_id = $1 OR (pr.national_id IS NOT NULL AND pr.national_id = $2)
       ORDER BY h.parcel_id, h.transfer_date DESC`,
      [owner.owner_id, owner.national_id]
    ),
  ]);
  return { parcels: current.rows, previouslyOwned: previous.rows };
}
