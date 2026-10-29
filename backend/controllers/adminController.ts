import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import pool from '../db/pool';
import { alertOwner } from '../utils/notify';
import { passwordProblem } from '../utils/passwords';

const ROLES = ['citizen', 'land_officer', 'administrator'];
const NATIONAL_ID_UNIQUE = 'user_national_id_citizen_unique';
const NATIONAL_ID_TAKEN = 'This national ID is already linked to another account. If it is yours, visit the land office.';

async function logAdminAction(userId: number, actionType: string, details: string, parcelId: number | string | null = null): Promise<void> {
  await pool.query(`INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, $2, $3, $4)`, [userId, actionType, parcelId, details]);
}

export async function listUsers(_req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(`SELECT user_id, full_name, phone_number, role, platform, national_id, is_active, created_at FROM "user" ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch users' }); }
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const { full_name, phone_number, password, role, national_id } = req.body;
  if (!full_name || !phone_number || !password || !role) { res.status(400).json({ error: 'full_name, phone_number, password, and role are required' }); return; }
  if (!ROLES.includes(role)) { res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` }); return; }
  const weak = passwordProblem(password, phone_number);
  if (weak) { res.status(400).json({ error: weak }); return; }
  try {
    const result = await pool.query(
      `INSERT INTO "user" (full_name, phone_number, password_hash, role, platform, national_id, phone_verified)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING user_id, full_name, phone_number, role, platform, national_id, is_active, created_at`,
      [full_name, phone_number, await bcrypt.hash(password, 10), role, role === 'citizen' ? 'mobile' : 'web', national_id || null]
    );
    await logAdminAction(req.user!.user_id, 'CREATE_USER', `Created ${role} account for ${full_name} (#${result.rows[0].user_id})`);
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    const e = err as { constraint?: string; code?: string };
    if (e.constraint === NATIONAL_ID_UNIQUE) { res.status(409).json({ error: NATIONAL_ID_TAKEN }); return; }
    if (e.code === '23505') { res.status(409).json({ error: 'A user with this phone number already exists' }); return; }
    console.error(err); res.status(500).json({ error: 'Failed to create user' });
  }
}

export async function setRole(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { role } = req.body;
  if (!ROLES.includes(role)) { res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` }); return; }
  if (Number(id) === req.user!.user_id) { res.status(400).json({ error: 'You cannot change your own role' }); return; }
  try {
    const result = await pool.query(`UPDATE "user" SET role = $1, platform = $2 WHERE user_id = $3 RETURNING user_id, full_name, role`, [role, role === 'citizen' ? 'mobile' : 'web', id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    await logAdminAction(req.user!.user_id, 'CHANGE_ROLE', `Set role of ${result.rows[0].full_name} (#${id}) to ${role}`);
    res.json({ message: 'Role updated', user: result.rows[0] });
  } catch (err: unknown) {
    const e = err as { constraint?: string };
    if (e.constraint === NATIONAL_ID_UNIQUE) { res.status(409).json({ error: NATIONAL_ID_TAKEN }); return; }
    console.error(err); res.status(500).json({ error: 'Failed to change role' });
  }
}

export async function setNationalId(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const national_id = (req.body.national_id || '').trim() || null;
  try {
    const result = await pool.query(
      `UPDATE "user" SET national_id = $1, national_id_verified_at = NULL, national_id_verified_by = NULL WHERE user_id = $2 RETURNING user_id, full_name`,
      [national_id, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    await logAdminAction(req.user!.user_id, 'CHANGE_NATIONAL_ID', `Set national ID of ${result.rows[0].full_name} (#${id}) to ${national_id || '(cleared)'}`);
    res.json({ message: 'National ID updated', user: result.rows[0] });
  } catch (err: unknown) {
    const e = err as { constraint?: string };
    if (e.constraint === NATIONAL_ID_UNIQUE) { res.status(409).json({ error: NATIONAL_ID_TAKEN }); return; }
    console.error(err); res.status(500).json({ error: 'Failed to update national ID' });
  }
}

async function setActive(req: Request, res: Response, isActive: boolean): Promise<void> {
  const { id } = req.params;
  if (Number(id) === req.user!.user_id) { res.status(400).json({ error: 'You cannot deactivate your own account' }); return; }
  try {
    const result = await pool.query(`UPDATE "user" SET is_active = $1 WHERE user_id = $2 RETURNING user_id, full_name`, [isActive, id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    await logAdminAction(req.user!.user_id, isActive ? 'REACTIVATE_USER' : 'DEACTIVATE_USER', `${isActive ? 'Reactivated' : 'Deactivated'} user ${result.rows[0].full_name} (#${id})`);
    res.json({ message: isActive ? 'User reactivated' : 'User deactivated', user: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update user' }); }
}

export const deactivateUser = (req: Request, res: Response) => setActive(req, res, false);
export const reactivateUser = (req: Request, res: Response) => setActive(req, res, true);

export async function resetUserPassword(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { new_password } = req.body;
  try {
    const target = await pool.query('SELECT phone_number FROM "user" WHERE user_id = $1', [id]);
    if (target.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    const weak = passwordProblem(new_password, target.rows[0].phone_number);
    if (weak) { res.status(400).json({ error: weak }); return; }
    const result = await pool.query(`UPDATE "user" SET password_hash = $1 WHERE user_id = $2 RETURNING user_id, full_name`, [await bcrypt.hash(new_password, 10), id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    await logAdminAction(req.user!.user_id, 'RESET_PASSWORD', `Reset the password of ${result.rows[0].full_name} (#${id})`);
    res.json({ message: 'Password reset', user: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to reset password' }); }
}

export async function usageReport(req: Request, res: Response): Promise<void> {
  const parse = (value: string, endOfDay: boolean) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`) : new Date(value);
  const to = req.query.to ? parse(String(req.query.to), true) : new Date();
  const from = req.query.from ? parse(String(req.query.from), false) : new Date(to.getTime() - 89 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) { res.status(400).json({ error: 'from and to must be dates (YYYY-MM-DD) with from before to' }); return; }
  const range = [from, to];
  try {
    const [totals, monthly, officers, neighbourhoods] = await Promise.all([
      pool.query(`SELECT
         (SELECT COUNT(*) FROM audit_log WHERE action_type = 'CREATE_PARCEL' AND timestamp BETWEEN $1 AND $2)::int AS parcels_registered,
         (SELECT COUNT(*) FROM audit_log WHERE action_type = 'PROCESS_TRANSFER' AND timestamp BETWEEN $1 AND $2)::int AS transfers,
         (SELECT COUNT(*) FROM audit_log WHERE action_type = 'UPDATE_PARCEL' AND timestamp BETWEEN $1 AND $2)::int AS parcel_edits,
         (SELECT COUNT(*) FROM audit_log WHERE action_type = 'VERIFY_PARCEL' AND timestamp BETWEEN $1 AND $2)::int AS verifications,
         (SELECT COUNT(*) FROM dispute WHERE created_at BETWEEN $1 AND $2)::int AS disputes_opened,
         (SELECT COUNT(*) FROM dispute WHERE resolved_at BETWEEN $1 AND $2)::int AS disputes_resolved,
         (SELECT COUNT(*) FROM document WHERE upload_date BETWEEN $1 AND $2)::int AS documents_uploaded,
         (SELECT COUNT(*) FROM document WHERE verification_status = 'verified' AND verification_date BETWEEN $1 AND $2)::int AS documents_verified,
         (SELECT COUNT(*) FROM document WHERE verification_status = 'rejected' AND verification_date BETWEEN $1 AND $2)::int AS documents_rejected,
         (SELECT COUNT(*) FROM unregistered_report WHERE created_at BETWEEN $1 AND $2)::int AS unregistered_reports,
         (SELECT COUNT(*) FROM "user" WHERE role = 'citizen' AND created_at BETWEEN $1 AND $2)::int AS citizen_signups,
         (SELECT ROUND(AVG(EXTRACT(EPOCH FROM resolved_at - created_at) / 86400)::numeric, 1) FROM dispute WHERE resolved_at BETWEEN $1 AND $2) AS avg_days_to_resolve`, range),
      pool.query(`SELECT to_char(date_trunc('month', timestamp), 'YYYY-MM') AS month,
         COUNT(*) FILTER (WHERE action_type = 'CREATE_PARCEL')::int AS parcels_registered,
         COUNT(*) FILTER (WHERE action_type = 'PROCESS_TRANSFER')::int AS transfers,
         COUNT(*) FILTER (WHERE action_type = 'RESOLVE_DISPUTE')::int AS disputes_resolved,
         COUNT(*) FILTER (WHERE action_type = 'VERIFY_PARCEL')::int AS verifications
         FROM audit_log WHERE timestamp BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, range),
      pool.query(`SELECT u.user_id, u.full_name, u.role,
         COUNT(a.log_id) FILTER (WHERE a.action_type = 'CREATE_PARCEL')::int AS registered,
         COUNT(a.log_id) FILTER (WHERE a.action_type = 'UPDATE_PARCEL')::int AS edited,
         COUNT(a.log_id) FILTER (WHERE a.action_type = 'PROCESS_TRANSFER')::int AS transfers,
         COUNT(a.log_id) FILTER (WHERE a.action_type = 'RESOLVE_DISPUTE')::int AS disputes_resolved,
         COUNT(a.log_id) FILTER (WHERE a.action_type IN ('VERIFY_DOCUMENT', 'REJECT_DOCUMENT'))::int AS documents_reviewed,
         COUNT(a.log_id) FILTER (WHERE a.action_type <> 'VERIFY_PARCEL')::int AS total_actions
         FROM "user" u LEFT JOIN audit_log a ON a.officer_id = u.user_id AND a.timestamp BETWEEN $1 AND $2
         WHERE u.role IN ('land_officer', 'administrator') GROUP BY u.user_id ORDER BY total_actions DESC, u.full_name`, range),
      pool.query(`SELECT neighbourhood, COUNT(*)::int AS parcels, COUNT(*) FILTER (WHERE status = 'disputed')::int AS disputed, COUNT(*) FILTER (WHERE status = 'deactivated')::int AS deactivated FROM parcel GROUP BY neighbourhood ORDER BY parcels DESC`),
    ]);
    res.json({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), totals: totals.rows[0], monthly: monthly.rows, officers: officers.rows, neighbourhoods: neighbourhoods.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to build report' }); }
}

export async function deactivateParcel(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const result = await pool.query(`UPDATE parcel SET status = 'deactivated' WHERE parcel_id = $1 RETURNING parcel_id`, [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Parcel not found' }); return; }
    await logAdminAction(req.user!.user_id, 'DEACTIVATE_PARCEL', 'Parcel deactivated as fraudulent', String(id));
    alertOwner(String(id), req.user!, `deactivated the record of parcel #${id} as fraudulent.`);
    res.json({ message: 'Parcel deactivated', parcel_id: id });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to deactivate parcel' }); }
}
