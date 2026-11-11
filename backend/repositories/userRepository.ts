import pool from '../db/pool';

// Whether a citizen's national ID is on file and confirmed by an officer at the land office.
export async function nationalIdStatus(userId: number) {
  const result = await pool.query('SELECT national_id, national_id_verified_at FROM "user" WHERE user_id = $1', [userId]);
  return result.rows[0] as { national_id: string | null; national_id_verified_at: Date | null };
}
