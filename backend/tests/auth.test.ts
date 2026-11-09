// FR01 registration with SMS code, FR02 guest access, FR03 / NFR03 role-based access.
import { app, TEST_PASSWORD, pool, request, closeDatabase, createStaff, createCitizen, createParcel } from './helpers';
import { normalisePhone } from '../utils/phone';

afterAll(closeDatabase);

describe('FR01 phone registration', () => {
  test('an account cannot log in until the SMS code is confirmed', async () => {
    const phone = '+211915000001';
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ full_name: 'New Citizen Lado Wani', phone_number: phone, password: TEST_PASSWORD });
    expect(reg.status).toBe(201);
    expect(reg.body.role).toBe('citizen');
    expect(reg.body.dev_code).toMatch(/^\d{6}$/);

    const early = await request(app).post('/api/auth/login').send({ phone_number: phone, password: TEST_PASSWORD });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe('PHONE_NOT_VERIFIED');

    const wrongCode = reg.body.dev_code === '000000' ? '111111' : '000000';
    const wrong = await request(app).post('/api/auth/verify-phone').send({ phone_number: phone, code: wrongCode });
    expect(wrong.status).toBe(400);

    await request(app).post('/api/auth/verify-phone').send({ phone_number: phone, code: reg.body.dev_code }).expect(200);
    const ok = await request(app).post('/api/auth/login').send({ phone_number: phone, password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
  });

  test('citizens sign up with their four names, as on the ID card', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ full_name: 'Akoi Deng', phone_number: '+211915000003', password: TEST_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/four names/);
  });

  test('public sign-up can only create citizen accounts', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ full_name: 'Sneaky Person Chol Deng', phone_number: '+211915000002', password: TEST_PASSWORD, role: 'administrator' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('citizen');
  });

  test('passwords are stored as bcrypt hashes', async () => {
    const { rows } = await pool.query(`SELECT password_hash FROM "user" WHERE phone_number = '+211915000002'`);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  test('weak passwords are refused: too short, too common, or the phone number', async () => {
    const signUp = (phone: string, password: string) => request(app).post('/api/auth/register')
      .send({ full_name: 'Weak Password Ayen Kuol', phone_number: phone, password });
    const cases: [string, RegExp][] = [
      ['short7!', /at least 8 characters/],
      ['password123', /too common/],
      ['12345678', /too common/],
      ['aaaaaaaaaa', /too common/],
      ['+211915000077', /phone number/],
      ['0915000077', /phone number/],
      ['x'.repeat(73), /too long/],
    ];
    for (const [password, reason] of cases) {
      const res = await signUp('+211915000077', password);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(reason);
    }
    // a long passphrase with no symbols is fine: no forced character rules
    expect((await signUp('+211915000077', 'mango tree by the river')).status).toBe(201);
  });
});

describe('South Sudan phone numbers (Zain 91, MTN 92, Digitel 98)', () => {
  test('the usual ways of typing a number all become +211XXXXXXXXX', () => {
    for (const typed of ['0912 345 678', '912345678', '+211 912-345-678', '211912345678', '00211912345678', '(091) 234-5678']) {
      expect(normalisePhone(typed)).toMatch(/^\+21191\d{7}$/);
    }
    expect(normalisePhone('0922 000 111')).toBe('+211922000111');
    expect(normalisePhone('0981 000 111')).toBe('+211981000111');
  });

  test('numbers from other operators, other countries or the wrong length are refused', () => {
    for (const typed of ['0955 000 111', '0971 000 111', '+254712345678', '091234567', '09123456789', 'abc', '']) {
      expect(normalisePhone(typed)).toBeNull();
    }
  });

  test('sign up with a local number, then log in with it typed differently', async () => {
    const reg = await request(app).post('/api/auth/register')
      .send({ full_name: 'Local Number Achol Deng Kuol', phone_number: '0925 000 010', password: TEST_PASSWORD });
    expect(reg.status).toBe(201);
    expect(reg.body.phone_number).toBe('+211925000010');
    await request(app).post('/api/auth/verify-phone').send({ phone_number: '925000010', code: reg.body.dev_code }).expect(200);
    const login = await request(app).post('/api/auth/login').send({ phone_number: '+211 925 000 010', password: TEST_PASSWORD });
    expect(login.status).toBe(200);
  });

  test('sign-up refuses a number that is not Zain, MTN or Digitel', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ full_name: 'Wrong Number Garang Deng Ajak', phone_number: '+211955000010', password: TEST_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Zain.*MTN.*Digitel/);
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
