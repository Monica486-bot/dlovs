// FR01 registration with SMS code, FR02 guest access, FR03 / NFR03 role-based access.
import { app, pool, request, closeDatabase, createStaff, createCitizen, createParcel } from './helpers';

afterAll(closeDatabase);

describe('FR01 phone registration', () => {
  test('an account cannot log in until the SMS code is confirmed', async () => {
    const phone = '+211955000001';
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ full_name: 'New Citizen Lado Wani', phone_number: phone, password: 'password123' });
    expect(reg.status).toBe(201);
    expect(reg.body.role).toBe('citizen');
    expect(reg.body.dev_code).toMatch(/^\d{6}$/);

    const early = await request(app).post('/api/auth/login').send({ phone_number: phone, password: 'password123' });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe('PHONE_NOT_VERIFIED');

    const wrongCode = reg.body.dev_code === '000000' ? '111111' : '000000';
    const wrong = await request(app).post('/api/auth/verify-phone').send({ phone_number: phone, code: wrongCode });
    expect(wrong.status).toBe(400);

    await request(app).post('/api/auth/verify-phone').send({ phone_number: phone, code: reg.body.dev_code }).expect(200);
    const ok = await request(app).post('/api/auth/login').send({ phone_number: phone, password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
  });

  test('citizens sign up with their four names, as on the ID card', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ full_name: 'Akoi Deng', phone_number: '+211955000003', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/four names/);
  });

  test('public sign-up can only create citizen accounts', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ full_name: 'Sneaky Person Chol Deng', phone_number: '+211955000002', password: 'password123', role: 'administrator' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('citizen');
  });

  test('passwords are stored as bcrypt hashes', async () => {
    const { rows } = await pool.query(`SELECT password_hash FROM "user" WHERE phone_number = '+211955000002'`);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });
});

describe('FR02 guest access / FR03 role-based access', () => {
  let officer: Awaited<ReturnType<typeof createStaff>>;
  let parcel: Record<string, unknown>;
  beforeAll(async () => {
    officer = await createStaff('land_officer');
    parcel = await createParcel(officer.token);
  });

  test('a guest can search and view an ownership record without an account', async () => {
    const search = await request(app).get('/api/parcels/search').query({ query: String(parcel.parcel_id), by: 'parcel_id' });
    expect(search.status).toBe(200);
    expect(search.body[0].parcel_id).toBe(parcel.parcel_id);

    const record = await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`);
    expect(record.status).toBe(200);
    expect(record.body.parcel.owner_name).toBe('Akoi Deng Majok Garang');
    expect(record.body.parcel.national_id).toBeUndefined();
    expect(record.body.parcel.qr_signature).toBeUndefined();
  });

  test('guests and citizens cannot create parcel records', async () => {
    const body = { gps_lat: 4.85, gps_lng: 31.57, neighbourhood: 'Gudele', owner: { full_name: 'X' } };
    await request(app).post('/api/parcels').send(body).expect(401);
    const citizen = await createCitizen();
    await request(app).post('/api/parcels').set('Authorization', `Bearer ${citizen.token}`).send(body).expect(403);
  });

  test('a deactivated account is refused on its next request', async () => {
    const citizen = await createCitizen();
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${citizen.token}`).expect(200);
    await pool.query('UPDATE "user" SET is_active = false WHERE user_id = $1', [citizen.user.user_id]);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${citizen.token}`).expect(401);
  });
});
