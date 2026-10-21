// Shared helpers: accounts for each role, and a registered parcel.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

// Each test file loads its own copy of this module, so a random prefix keeps
// phone numbers and IDs unique across files in the same run.
const prefix = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
let counter = 0;
function uniquePhone() {
  counter += 1;
  return `+2119${prefix}${String(counter).padStart(3, '0')}`;
}

function uniqueNationalId() {
  counter += 1;
  return `SS-${prefix}-${counter}`;
}

async function login(phone, password) {
  const res = await request(app).post('/api/auth/login').send({ phone_number: phone, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user };
}

// Officers and administrators are created by an administrator, not by sign-up
// (FR01), so the tests insert them directly.
async function createStaff(role, name = `Test ${role}`) {
  const phone = uniquePhone();
  const hash = await bcrypt.hash('password123', 4);
  await pool.query(
    `INSERT INTO "user" (full_name, phone_number, password_hash, role, platform, phone_verified)
     VALUES ($1, $2, $3, $4, 'web', true)`,
    [name, phone, hash, role]
  );
  return login(phone, 'password123');
}

// The real citizen flow: sign up, confirm the SMS code, log in. With
// verifiedBy (an officer's token) the officer also confirms the national ID
// in person, which links the account to land registered under that ID.
async function createCitizen({ nationalId = uniqueNationalId(), verifiedBy } = {}) {
  const phone = uniquePhone();
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ full_name: 'Test Citizen Deng Majok', phone_number: phone, password: 'password123', national_id: nationalId });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const confirm = await request(app).post('/api/auth/verify-phone').send({ phone_number: phone, code: reg.body.dev_code });
  if (confirm.status !== 200) throw new Error(`verify-phone failed: ${confirm.status} ${JSON.stringify(confirm.body)}`);
  const session = await login(phone, 'password123');
  if (verifiedBy) {
    const check = await request(app)
      .put(`/api/id-checks/${session.user.user_id}`)
      .set('Authorization', `Bearer ${verifiedBy}`)
      .send({ decision: 'verified' });
    if (check.status !== 200) throw new Error(`id check failed: ${check.status} ${JSON.stringify(check.body)}`);
  }
  return { ...session, phone, nationalId };
}

async function createParcel(officerToken, { ownerName = 'Akoi Deng Majok Garang', nationalId = uniqueNationalId(), neighbourhood = 'Munuki' } = {}) {
  const res = await request(app)
    .post('/api/parcels')
    .set('Authorization', `Bearer ${officerToken}`)
    .send({ gps_lat: 4.8594, gps_lng: 31.5713, neighbourhood, area_sqm: 600, owner: { full_name: ownerName, national_id: nationalId } });
  if (res.status !== 201) throw new Error(`create parcel failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// A direct transfer of a parcel whose owner has no account: one officer
// records the written consent and a second officer approves it. Returns the
// start response if it was refused, otherwise the approval response.
async function transferWithApproval(starterToken, approverToken, parcelId, body) {
  const start = await request(app)
    .post(`/api/parcels/${parcelId}/transfer`)
    .set('Authorization', `Bearer ${starterToken}`)
    .send({ reason: 'Sale', consent_document: 'Sale agreement signed before the area chief, with three witnesses', ...body });
  if (start.status !== 202) return start;
  return request(app)
    .put(`/api/pending-transfers/${start.body.transfer_id}/approve`)
    .set('Authorization', `Bearer ${approverToken}`);
}

// Notifications are sent just after the API replies, so wait for one to
// arrive (up to 3 s) instead of reading the inbox once.
async function hasNotification(token, matches) {
  for (let i = 0; i < 30; i++) {
    const inbox = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    if (inbox.body.notifications.some(matches)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

// The signature inside a QR code's verification URL
function signatureFromCode(code) {
  return new URL(code).searchParams.get('s');
}

module.exports = {
  app, pool, request, createStaff, createCitizen, createParcel, uniqueNationalId, signatureFromCode, transferWithApproval,
  hasNotification,
};
