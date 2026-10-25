import crypto from 'crypto';
import bcrypt from 'bcrypt';
import supertest from 'supertest';
import app from '../app';
import pool from '../db/pool';

export { app, pool };
export const request = supertest;

const prefix = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
let counter = 0;
function uniquePhone(): string {
  counter += 1;
  return `+2119${prefix}${String(counter).padStart(3, '0')}`;
}

export function uniqueNationalId(): string {
  counter += 1;
  return `SS-${prefix}-${counter}`;
}

export interface Session {
  token: string;
  user: { user_id: number; role: string; [key: string]: unknown };
  phone?: string;
  nationalId?: string;
}

async function login(phone: string, password: string): Promise<Session> {
  const res = await supertest(app).post('/api/auth/login').send({ phone_number: phone, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user };
}

export async function createStaff(role: string, name = `Test ${role}`): Promise<Session> {
  const phone = uniquePhone();
  const hash = await bcrypt.hash('password123', 4);
  await pool.query(
    `INSERT INTO "user" (full_name, phone_number, password_hash, role, platform, phone_verified)
     VALUES ($1, $2, $3, $4, 'web', true)`,
    [name, phone, hash, role]
  );
  return login(phone, 'password123');
}

export async function createCitizen({ nationalId = uniqueNationalId(), verifiedBy }: { nationalId?: string; verifiedBy?: string } = {}): Promise<Session> {
  const phone = uniquePhone();
  const reg = await supertest(app)
    .post('/api/auth/register')
    .send({ full_name: 'Test Citizen Deng Majok', phone_number: phone, password: 'password123', national_id: nationalId });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const confirm = await supertest(app).post('/api/auth/verify-phone').send({ phone_number: phone, code: reg.body.dev_code });
  if (confirm.status !== 200) throw new Error(`verify-phone failed: ${confirm.status} ${JSON.stringify(confirm.body)}`);
  const session = await login(phone, 'password123');
  if (verifiedBy) {
    const check = await supertest(app)
      .put(`/api/id-checks/${session.user.user_id}`)
      .set('Authorization', `Bearer ${verifiedBy}`)
      .send({ decision: 'verified' });
    if (check.status !== 200) throw new Error(`id check failed: ${check.status} ${JSON.stringify(check.body)}`);
  }
  return { ...session, phone, nationalId };
}

export async function createParcel(
  officerToken: string,
  { ownerName = 'Akoi Deng Majok Garang', nationalId = uniqueNationalId(), neighbourhood = 'Munuki' } = {}
): Promise<Record<string, unknown>> {
  const res = await supertest(app)
    .post('/api/parcels')
    .set('Authorization', `Bearer ${officerToken}`)
    .send({ gps_lat: 4.8594, gps_lng: 31.5713, neighbourhood, area_sqm: 600, owner: { full_name: ownerName, national_id: nationalId } });
  if (res.status !== 201) throw new Error(`create parcel failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function transferWithApproval(
  starterToken: string,
  approverToken: string,
  parcelId: number,
  body: Record<string, unknown>
): Promise<supertest.Response> {
  const start = await supertest(app)
    .post(`/api/parcels/${parcelId}/transfer`)
    .set('Authorization', `Bearer ${starterToken}`)
    .send({ reason: 'Sale', consent_document: 'Sale agreement signed before the area chief, with three witnesses', ...body });
  if (start.status !== 202) return start;
  return supertest(app)
    .put(`/api/pending-transfers/${start.body.transfer_id}/approve`)
    .set('Authorization', `Bearer ${approverToken}`);
}

export async function hasNotification(token: string, matches: (n: Record<string, unknown>) => boolean): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    const inbox = await supertest(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    if (inbox.body.notifications.some(matches)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export function signatureFromCode(code: string): string {
  return new URL(code).searchParams.get('s') ?? '';
}
