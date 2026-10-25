import crypto from 'crypto';
import pool from '../db/pool';
import { sendSms, smsConfigured } from './sms';

const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;

const hash = (code: string): string => crypto.createHash('sha256').update(code).digest('hex');

export class CodeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function issueCode(phoneNumber: string, purpose: string): Promise<{ devCode: string | undefined }> {
  const recent = await pool.query(
    `SELECT created_at FROM phone_code WHERE phone_number = $1 AND purpose = $2
     AND created_at > now() - make_interval(secs => $3) LIMIT 1`,
    [phoneNumber, purpose, RESEND_SECONDS]
  );
  if (recent.rows.length > 0) throw new CodeError('Please wait a minute before requesting another code.', 429);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await pool.query(
    `UPDATE phone_code SET consumed_at = now() WHERE phone_number = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [phoneNumber, purpose]
  );
  await pool.query(
    `INSERT INTO phone_code (phone_number, purpose, code_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [phoneNumber, purpose, hash(code), TTL_MINUTES]
  );
  const text =
    purpose === 'verify'
      ? `Your DLOVS verification code is ${code}. It expires in ${TTL_MINUTES} minutes.`
      : `Your DLOVS password reset code is ${code}. It expires in ${TTL_MINUTES} minutes. If you didn't ask for this, ignore it.`;
  await sendSms(phoneNumber, text);
  const exposeForDemo = !smsConfigured() && process.env.NODE_ENV !== 'production';
  return { devCode: exposeForDemo ? code : undefined };
}

export async function checkCode(phoneNumber: string, purpose: string, code: unknown): Promise<void> {
  const result = await pool.query(
    `SELECT code_id, code_hash, attempts, expires_at FROM phone_code
     WHERE phone_number = $1 AND purpose = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [phoneNumber, purpose]
  );
  const row = result.rows[0];
  if (!row || new Date(row.expires_at) < new Date()) throw new CodeError('This code has expired. Request a new one.');
  if (row.attempts >= MAX_ATTEMPTS) throw new CodeError('Too many wrong attempts. Request a new code.', 429);
  const given = Buffer.from(hash(String(code || '').trim()));
  const expected = Buffer.from(row.code_hash);
  if (!crypto.timingSafeEqual(given, expected)) {
    await pool.query('UPDATE phone_code SET attempts = attempts + 1 WHERE code_id = $1', [row.code_id]);
    throw new CodeError('That code is not correct.');
  }
  await pool.query('UPDATE phone_code SET consumed_at = now() WHERE code_id = $1', [row.code_id]);
}
