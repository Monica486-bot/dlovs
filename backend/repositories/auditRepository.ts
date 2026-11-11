import type { Db } from './db';

export interface AuditEntry {
  officerId: number | null;
  action: string;
  parcelId?: number | string | null;
  details: string;
}

// FR14: every officer and administrator action is written here. The audit_log
// table's triggers refuse UPDATE and DELETE, so entries can only be added.
export async function recordAction(db: Db, { officerId, action, parcelId = null, details }: AuditEntry): Promise<void> {
  await db.query(
    'INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, $2, $3, $4)',
    [officerId, action, parcelId, details]
  );
}
