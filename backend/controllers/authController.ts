import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import pool from '../db/pool';
import { secret } from '../utils/secrets';
import { issueCode, checkCode, CodeError } from '../utils/phoneCodes';
import { fourPartName } from '../utils/names';

const PLATFORMS = ['mobile', 'web'];
const PHONE_PATTERN = /^\+?\d{9,15}$/;
const normalisePhone = (phone: unknown): string => String(phone || '').replace(/[\s-]/g, '');

function sendCodeError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof CodeError) { res.status(err.status).json({ error: err.message }); return; }
  console.error(err);
  res.status(500).json({ error: fallback });
}

function userPayload(user: Record<string, unknown>) {
  return {
    user_id: user.user_id, full_name: user.full_name, role: user.role,
    platform: user.platform, phone_number: user.phone_number, national_id: user.national_id,
    national_id_verified: Boolean(user.national_id_verified_at),
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { password, national_id, platform = 'mobile' } = req.body;
  const phone_number = normalisePhone(req.body.phone_number);
  if (!req.body.full_name?.trim() || !phone_number || !password) { res.status(400).json({ error: 'full_name, phone_number, and password are required' }); return; }
  const names = fourPartName(req.body.full_name, 'your');
  if (names.error) { res.status(400).json({ error: names.error }); return; }
  if (!PHONE_PATTERN.test(phone_number)) { res.status(400).json({ error: 'Enter the phone number with its country code, e.g. +211912345678' }); return; }
  if (password.length < 6) { res.status(400).json({ error: 'password must be at least 6 characters' }); return; }
  if (!PLATFORMS.includes(platform)) { res.status(400).json({ error: `platform must be one of ${PLATFORMS.join(', ')}` }); return; }
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO "user" (full_name, phone_number, password_hash, role, platform, national_id, phone_verified)
       VALUES ($1, $2, $3, 'citizen', $4, $5, false)
       RETURNING user_id, full_name, phone_number, role, platform, national_id, created_at`,
      [names.name, phone_number, password_hash, platform, national_id?.trim() || null]
    );
    const { devCode } = await issueCode(phone_number, 'verify');
    res.status(201).json({ ...result.rows[0], verification_required: true, dev_code: devCode });
  } catch (err: unknown) {
    const e = err as { constraint?: string; code?: string };
    if (e.constraint === 'user_national_id_citizen_unique') { res.status(409).json({ error: 'This national ID is already linked to another account. If it is yours, visit the land office.' }); return; }
    if (e.code === '23505') { res.status(409).json({ error: 'A user with this phone number already exists' }); return; }
    sendCodeError(res, err, 'Registration failed');
  }
}

export async function verifyPhone(req: Request, res: Response): Promise<void> {
  const phone_number = normalisePhone(req.body.phone_number);
  try {
    await checkCode(phone_number, 'verify', req.body.code);
    const result = await pool.query(`UPDATE "user" SET phone_verified = true WHERE phone_number = $1 RETURNING user_id`, [phone_number]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'No account with this phone number' }); return; }
    res.json({ message: 'Phone number verified. You can now log in.' });
  } catch (err) { sendCodeError(res, err, 'Verification failed'); }
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const phone_number = normalisePhone(req.body.phone_number);
  try {
    const result = await pool.query('SELECT phone_verified FROM "user" WHERE phone_number = $1', [phone_number]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'No account with this phone number' }); return; }
    if (result.rows[0].phone_verified) { res.status(400).json({ error: 'This phone number is already verified' }); return; }
    const { devCode } = await issueCode(phone_number, 'verify');
    res.json({ message: 'A new code has been sent.', dev_code: devCode });
  } catch (err) { sendCodeError(res, err, 'Could not send a code'); }
}

export async function login(req: Request, res: Response): Promise<void> {
  const phone_number = normalisePhone(req.body.phone_number);
  const { password } = req.body;
  if (!phone_number || !password) { res.status(400).json({ error: 'phone_number and password are required' }); return; }
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE phone_number = $1', [phone_number]);
    const user = result.rows[0];
    if (!user) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    if (!(await bcrypt.compare(password, user.password_hash))) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    if (!user.is_active) { res.status(403).json({ error: 'This account has been deactivated' }); return; }
    if (!user.phone_verified) { res.status(403).json({ error: 'Confirm your phone number first', code: 'PHONE_NOT_VERIFIED' }); return; }
    const token = jwt.sign({ user_id: user.user_id, role: user.role, full_name: user.full_name }, secret('JWT_SECRET'), { expiresIn: '12h' });
    res.json({ token, user: userPayload(user) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Login failed' }); }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE user_id = $1', [req.user!.user_id]);
    res.json(userPayload(result.rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to load profile' }); }
}

export function logout(_req: Request, res: Response): void {
  res.json({ message: 'Logged out. Discard the token client-side.' });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const { national_id } = req.body;
  let full_name: string | null = null;
  if (req.body.full_name) {
    const names = fourPartName(req.body.full_name, 'your');
    if (names.error) { res.status(400).json({ error: names.error }); return; }
    full_name = names.name!;
  }
  try {
    if (national_id) {
      const current = await pool.query('SELECT national_id FROM "user" WHERE user_id = $1', [req.user!.user_id]);
      const existing = current.rows[0].national_id;
      if (existing && existing !== national_id) { res.status(409).json({ error: 'National ID is already set; contact an administrator to change it' }); return; }
    }
    await pool.query(
      `UPDATE "user" SET full_name = COALESCE($1, full_name), national_id = COALESCE(national_id, $2) WHERE user_id = $3`,
      [full_name, national_id || null, req.user!.user_id]
    );
    res.json({ message: 'Profile updated' });
  } catch (err: unknown) {
    const e = err as { constraint?: string };
    if (e.constraint === 'user_national_id_citizen_unique') { res.status(409).json({ error: 'This national ID is already linked to another account. If it is yours, visit the land office.' }); return; }
    console.error(err); res.status(500).json({ error: 'Update failed' });
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) { res.status(400).json({ error: 'new_password must be at least 6 characters' }); return; }
  try {
    const result = await pool.query('SELECT password_hash FROM "user" WHERE user_id = $1', [req.user!.user_id]);
    if (!current_password || !(await bcrypt.compare(current_password, result.rows[0].password_hash))) { res.status(401).json({ error: 'Your current password is not correct' }); return; }
    await pool.query('UPDATE "user" SET password_hash = $1 WHERE user_id = $2', [await bcrypt.hash(new_password, 10), req.user!.user_id]);
    res.json({ message: 'Password changed' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Password change failed' }); }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const phone_number = normalisePhone(req.body.phone_number);
  if (!phone_number) { res.status(400).json({ error: 'phone_number is required' }); return; }
  try {
    const result = await pool.query('SELECT role, is_active FROM "user" WHERE phone_number = $1', [phone_number]);
    const user = result.rows[0];
    const generic = { message: 'If this number has a citizen account, a reset code has been sent by SMS.' };
    if (!user || !user.is_active) { res.json(generic); return; }
    if (user.role !== 'citizen') { res.json({ message: 'Land officer and administrator passwords are reset by a DLOVS administrator.', staff: true }); return; }
    const { devCode } = await issueCode(phone_number, 'reset');
    res.json({ ...generic, dev_code: devCode });
  } catch (err) { sendCodeError(res, err, 'Could not send a reset code'); }
}

export async function resetPasswordWithCode(req: Request, res: Response): Promise<void> {
  const phone_number = normalisePhone(req.body.phone_number);
  const { code, new_password } = req.body;
  if (!new_password || new_password.length < 6) { res.status(400).json({ error: 'new_password must be at least 6 characters' }); return; }
  try {
    await checkCode(phone_number, 'reset', code);
    await pool.query(
      `UPDATE "user" SET password_hash = $1, phone_verified = true WHERE phone_number = $2 AND role = 'citizen'`,
      [await bcrypt.hash(new_password, 10), phone_number]
    );
    res.json({ message: 'Password reset. You can now log in.' });
  } catch (err) { sendCodeError(res, err, 'Password reset failed'); }
}
