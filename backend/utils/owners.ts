import type { PoolClient, Pool } from 'pg';

export interface OwnerRow {
  owner_id: number;
  full_name: string;
}

export type MatchOwnerResult =
  | { owner: OwnerRow | null; mismatch?: never }
  | { mismatch: string; owner?: never };

const normalise = (name: string): string =>
  String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

async function ownerByNationalId(db: Pool | PoolClient, nationalId: string | null): Promise<OwnerRow | null> {
  if (!nationalId) return null;
  const result = await db.query(
    'SELECT owner_id, full_name FROM owner WHERE national_id = $1 ORDER BY owner_id LIMIT 1',
    [nationalId]
  );
  return result.rows[0] || null;
}

export async function matchOwner(
  db: Pool | PoolClient,
  nationalId: string | null,
  fullName: string
): Promise<MatchOwnerResult> {
  const existing = await ownerByNationalId(db, nationalId);
  if (!existing || normalise(existing.full_name) === normalise(fullName)) return { owner: existing };
  return {
    mismatch:
      `National ID ${nationalId} is already registered to ${existing.full_name}, not ${fullName}. ` +
      'Check the ID card: if it is the same person, enter the name exactly as registered; if not, the ID number is wrong.',
  };
}

export { normalise, ownerByNationalId };
