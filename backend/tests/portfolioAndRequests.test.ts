// FR06 verification pathways, FR09 owner portfolio, FR13 unregistered
// parcels, the citizen transfer request, and FR15 push tokens.
import { app, pool, request, closeDatabase, createStaff, createCitizen, createParcel, uniqueNationalId, hasNotification } from './helpers';

afterAll(closeDatabase);

// Follows the paging headers to collect every result's parcel ID.
async function allSearchResults(query: Record<string, unknown>): Promise<number[]> {
  const found: number[] = [];
  for (let offset = 0; ; ) {
    const res = await request(app).get('/api/parcels/search').query({ ...query, offset }).expect(200);
    found.push(...res.body.map((p: { parcel_id: number }) => p.parcel_id));
    offset += res.body.length;
    if (res.body.length === 0 || offset >= Number(res.headers['x-total-count'])) return found;
  }
}

let officer: Awaited<ReturnType<typeof createStaff>>;
beforeAll(async () => {
  officer = await createStaff('land_officer');
});

describe('FR06 verification pathways', () => {
  test('parcel ID, owner name, neighbourhood, national ID, and GPS all find the same parcel', async () => {
    const nationalId = uniqueNationalId();
    const parcel = await createParcel(officer.token, { ownerName: 'Nyandeng Pathway Kuol Ajak', nationalId, neighbourhood: 'Gudele Block 7' });
    const find = (query: Record<string, unknown>) => request(app).get('/api/parcels/search').query(query);
    const ids = (res: { body: { parcel_id: number }[] }) => res.body.map((p) => p.parcel_id);

    expect(ids(await find({ query: String(parcel.parcel_id), by: 'parcel_id' }))).toContain(parcel.parcel_id);
    expect(ids(await find({ query: 'nyandeng path', by: 'owner_name' }))).toContain(parcel.parcel_id);
    expect(ids(await find({ query: 'Block 7', by: 'neighbourhood' }))).toContain(parcel.parcel_id);
    const byId = (query: string) => find({ query, by: 'national_id' }).set('Authorization', `Bearer ${officer.token}`);
    expect(ids(await byId(nationalId))).toEqual([parcel.parcel_id]);
    // a partial ID (the prefix without the final number) must not match any national ID
    expect(ids(await byId(nationalId.replace(/\d+$/, '')))).toEqual([]);
    const near = await find({ by: 'near', lat: Number(parcel.gps_lat), lng: Number(parcel.gps_lng), radius: 50 });
    expect(ids(near)).toContain(parcel.parcel_id);
    expect(near.body.find((p: { parcel_id: unknown }) => p.parcel_id === parcel.parcel_id).distance_m).toBe(0);
  });

  test('GPS search keeps parcels inside the radius and drops those outside, at any bearing', async () => {
    const parcel = await createParcel(officer.token);
    const [lat0, lng0] = [Number(parcel.gps_lat), Number(parcel.gps_lng)];
    const metresPerDegree = 111320;
    const near = async (dNorth: number, dEast: number, radius: number) => {
      const lat = lat0 + dNorth / metresPerDegree;
      const lng = lng0 + dEast / (metresPerDegree * Math.cos((lat0 * Math.PI) / 180));
      const res = await request(app).get('/api/parcels/search').query({ by: 'near', lat, lng, radius }).expect(200);
      return res.body.find((p: { parcel_id: unknown }) => p.parcel_id === parcel.parcel_id);
    };
    // 100 m due north: outside 50 m, inside 150 m
    expect(await near(100, 0, 50)).toBeUndefined();
    expect((await near(100, 0, 150)).distance_m).toBeCloseTo(100, -1);
    // diagonal, close to the corner of the lat/lng box: still found when within the radius
    expect((await near(34, 34, 50)).distance_m).toBeLessThanOrEqual(50);
    expect(await near(40, 40, 50)).toBeUndefined();
  });

  test("guests and citizens can't find someone's land by their national ID", async () => {
    const nationalId = uniqueNationalId();
    await createParcel(officer.token, { nationalId });
    const citizen = await createCitizen();
    const search = () => request(app).get('/api/parcels/search').query({ query: nationalId, by: 'national_id' });
    await search().expect(403);
    await search().set('Authorization', `Bearer ${citizen.token}`).expect(403);
    const any = await request(app).get('/api/parcels/search').query({ query: nationalId });
    expect(any.body).toEqual([]);
  });

  test('searching the city finds parcels in every neighbourhood; "Hai" and casing are ignored', async () => {
    const munuki = await createParcel(officer.token, { neighbourhood: 'hai munuki' });
    const gudele = await createParcel(officer.token, { neighbourhood: 'Gudele' });
    expect(munuki.neighbourhood).toBe('Munuki');
    expect(munuki.city).toBe('Juba');

    const ids = (query: Record<string, unknown>) => allSearchResults(query);
    const juba = await ids({ query: 'Juba', by: 'neighbourhood' });
    expect(juba).toEqual(expect.arrayContaining([munuki.parcel_id, gudele.parcel_id]));
    expect(await ids({ query: 'juba' })).toEqual(expect.arrayContaining([munuki.parcel_id, gudele.parcel_id]));
    const area = await ids({ query: 'Hai Munuki', by: 'neighbourhood' });
    expect(area).toContain(munuki.parcel_id);
    expect(area).not.toContain(gudele.parcel_id);
  });

  test('search pages through every match: 50 at a time, with the total in a header', async () => {
    // 53 parcels for one owner name no other test uses, inserted directly to keep the test fast
    const name = `Paging ${String.fromCharCode(...Array.from({ length: 8 }, () => 97 + Math.floor(Math.random() * 26)))} Deng Kuol`;
    const owner = await pool.query('INSERT INTO owner (full_name) VALUES ($1) RETURNING owner_id', [name]);
    const inserted = await pool.query(
      `INSERT INTO parcel (gps_lat, gps_lng, neighbourhood, unique_qr_code, qr_signature, registered_by, current_owner_id)
       SELECT 4.85, 31.58, 'Munuki', $3::text || '-' || i, 'test', $2::int, $1::int FROM generate_series(1, 53) AS i
       RETURNING parcel_id`,
      [owner.rows[0].owner_id, officer.user.user_id, `paging-${owner.rows[0].owner_id}`]
    );
    const created = inserted.rows.map((r: { parcel_id: number }) => r.parcel_id).sort((x: number, y: number) => x - y);
    const first = await request(app).get('/api/parcels/search').query({ query: name, by: 'owner_name' }).expect(200);
    expect(first.body).toHaveLength(50);
    expect(first.headers['x-total-count']).toBe('53');
    expect(first.headers['x-page-size']).toBe('50');
    const second = await request(app).get('/api/parcels/search').query({ query: name, by: 'owner_name', offset: 50 }).expect(200);
    expect(second.body).toHaveLength(3);
    expect(second.headers['x-offset']).toBe('50');
    expect([...first.body, ...second.body].map((p: { parcel_id: number }) => p.parcel_id)).toEqual(created);
    await request(app).get('/api/parcels/search').query({ query: name, by: 'owner_name', offset: -1 }).expect(400);
  });

  test('the neighbourhood list is public', async () => {
    const res = await request(app).get('/api/parcels/neighbourhoods');
    expect(res.body.city).toBe('Juba');
    expect(res.body.neighbourhoods).toEqual(expect.arrayContaining(['Gudele', 'Munuki']));
  });

  test('FR13: an unregistered parcel returns no results', async () => {
    const res = await request(app).get('/api/parcels/search').query({ query: '99999999', by: 'parcel_id' });
    expect(res.body).toEqual([]);
    await request(app).get('/api/parcels/99999999/verify').expect(404);
  });
});

describe('FR09 owner portfolio', () => {
  test('anyone can see all parcels of an owner, without their national ID or phone', async () => {
    const nationalId = uniqueNationalId();
    const first = await createParcel(officer.token, { ownerName: 'Portfolio Owner Deng Lual', nationalId, neighbourhood: 'Munuki' });
    await createParcel(officer.token, { ownerName: 'Portfolio Owner Deng Lual', nationalId, neighbourhood: 'Gudele' });

    const search = await request(app).get('/api/parcels/search').query({ query: String(first.parcel_id), by: 'parcel_id' });
    const ownerId = search.body[0].owner_id;
    expect(ownerId).toBeTruthy();

    const guest = await request(app).get(`/api/owners/${ownerId}`);
    expect(guest.status).toBe(200);
    expect(guest.body.owner.full_name).toBe('Portfolio Owner Deng Lual');
    expect(guest.body.owner.national_id).toBeUndefined();
    expect(guest.body.owner.contact_number).toBeUndefined();
    expect(guest.body.parcels.map((p: { neighbourhood: string }) => p.neighbourhood).sort()).toEqual(['Gudele', 'Munuki']);
    expect(guest.body.parcels[0].gps_lat).toBeTruthy();

    const staff = await request(app).get(`/api/owners/${ownerId}`).set('Authorization', `Bearer ${officer.token}`);
    expect(staff.body.owner.national_id).toBe(nationalId);
  });
});

describe('FR13 unregistered plot reports', () => {
  test('a citizen can report a plot and officers are told', async () => {
    const citizen = await createCitizen();
    const res = await request(app)
      .post('/api/unregistered-reports')
      .set('Authorization', `Bearer ${citizen.token}`)
      .send({ neighbourhood: 'Munuki', location_details: 'Behind the water tank, blue gate', gps_lat: 4.86, gps_lng: 31.57 });
    expect(res.status).toBe(201);
    expect(await hasNotification(officer.token, (n) => (n.message as string).includes('unregistered plot'))).toBe(true);
  });
});

describe('citizen transfer request', () => {
  test('only the confirmed owner can ask to transfer a parcel', async () => {
    const nationalId = uniqueNationalId();
    const owner = await createCitizen({ nationalId, verifiedBy: officer.token });
    const parcel = await createParcel(officer.token, { nationalId });
    const body = { buyer_full_name: 'Buyer Person Lado Wani', buyer_national_id: uniqueNationalId(), reason: 'Sale' };

    const stranger = await createCitizen({ verifiedBy: officer.token });
    await request(app).post(`/api/parcels/${parcel.parcel_id}/transfer-requests`).set('Authorization', `Bearer ${stranger.token}`).send(body).expect(403);

    const ownerAuth = { Authorization: `Bearer ${owner.token}` };
    const url = `/api/parcels/${parcel.parcel_id}/transfer-requests`;
    await request(app).post(url).set(ownerAuth).send({ ...body, reason: undefined }).expect(400);
    await request(app).post(url).set(ownerAuth).send({ ...body, reason: 'Other' }).expect(400);

    const res = await request(app).post(url).set(ownerAuth).send({ ...body, reason: 'Inheritance' });
    expect(res.status).toBe(201);
    const saved = await request(app).get('/api/transfer-requests').set(ownerAuth);
    expect(saved.body.find((r: { request_id: number }) => r.request_id === res.body.request_id).transfer_reason).toBe('Inheritance');
    expect(res.body.status).toBe('pending');
  });

  test('completing a request closes it; a direct transfer closes any other pending request', async () => {
    const nationalId = uniqueNationalId();
    const owner = await createCitizen({ nationalId, verifiedBy: officer.token });
    const headers = { Authorization: `Bearer ${owner.token}` };
    const officerHeaders = { Authorization: `Bearer ${officer.token}` };

    const first = await createParcel(officer.token, { nationalId });
    const buyerId = uniqueNationalId();
    const asked = await request(app).post(`/api/parcels/${first.parcel_id}/transfer-requests`).set(headers)
      .send({ buyer_full_name: 'Ayen Lado Wani Lomoro', buyer_national_id: buyerId, reason: 'Sale' });
    await request(app).post(`/api/parcels/${first.parcel_id}/transfer`).set(officerHeaders)
      .send({ reason: 'Sale', new_owner: { full_name: 'Ayen Lado Wani Lomoro', national_id: buyerId }, transfer_request_id: asked.body.request_id })
      .expect(200);

    const second = await createParcel(officer.token, { nationalId });
    await request(app).post(`/api/parcels/${second.parcel_id}/transfer-requests`).set(headers)
      .send({ buyer_full_name: 'Chol Deng Majok Garang', buyer_national_id: uniqueNationalId(), reason: 'Gift' })
      .expect(201);
    const started = await request(app).post(`/api/parcels/${second.parcel_id}/transfer`).set(officerHeaders)
      .send({ reason: 'Gift', new_owner: { full_name: 'Achol Mayen Kuol Ajak' } })
      .expect(202);
    await request(app).post(`/api/pending-transfers/${started.body.transfer_id}/confirm`).set(officerHeaders)
      .send({ code: started.body.dev_code })
      .expect(200);

    const mine = await request(app).get('/api/transfer-requests').set(headers);
    const statusOf = (parcelId: number) => mine.body.find((r: { parcel_id: number }) => r.parcel_id === parcelId).status;
    expect(statusOf(first.parcel_id as number)).toBe('completed');
    expect(statusOf(second.parcel_id as number)).toBe('rejected');
    expect(await hasNotification(owner.token, (n) => (n.message as string).includes(`parcel #${second.parcel_id} was closed`))).toBe(true);
  });

  test('an unconfirmed national ID is not linked to any land', async () => {
    const nationalId = uniqueNationalId();
    await createParcel(officer.token, { nationalId });
    const claimant = await createCitizen({ nationalId });
    const mine = await request(app).get('/api/parcels/mine').set('Authorization', `Bearer ${claimant.token}`);
    expect(mine.body.id_status).toBe('pending');
    expect(mine.body.parcels).toEqual([]);
  });
});

describe('ID checks are only for national IDs that own land', () => {
  const auth = (s: { token: string }) => ({ Authorization: `Bearer ${s.token}` });

  test('an account without land stays out of the queue until land is registered to its ID', async () => {
    const nationalId = uniqueNationalId();
    const citizen = await createCitizen({ nationalId });

    const mine = await request(app).get('/api/parcels/mine').set(auth(citizen));
    expect(mine.body.id_status).toBe('no_land');
    let queue = await request(app).get('/api/id-checks').set(auth(officer));
    expect(queue.body.map((c: { user_id: number }) => c.user_id)).not.toContain(citizen.user.user_id);

    const parcel = await createParcel(officer.token, { nationalId });
    queue = await request(app).get('/api/id-checks').set(auth(officer));
    expect(queue.body.map((c: { user_id: number }) => c.user_id)).toContain(citizen.user.user_id);
    expect((await request(app).get('/api/parcels/mine').set(auth(citizen))).body.id_status).toBe('pending');

    expect(await hasNotification(citizen.token, (n) => (n.message as string).includes(`#${parcel.parcel_id}`) && (n.message as string).includes('ID card'))).toBe(true);
  });
});

describe('FR15 push notification tokens', () => {
  test('the mobile app can register and remove its Expo push token', async () => {
    const citizen = await createCitizen();
    const token = `ExponentPushToken[test-${Date.now()}]`;
    const headers = { Authorization: `Bearer ${citizen.token}` };

    await request(app).post('/api/push-tokens').set(headers).send({ token: 'not-a-token' }).expect(400);
    await request(app).post('/api/push-tokens').set(headers).send({ token }).expect(201);
    const saved = await pool.query('SELECT user_id FROM push_token WHERE token = $1', [token]);
    expect(saved.rows[0].user_id).toBe(citizen.user.user_id);

    await request(app).delete('/api/push-tokens').set(headers).send({ token }).expect(200);
    const gone = await pool.query('SELECT 1 FROM push_token WHERE token = $1', [token]);
    expect(gone.rows).toHaveLength(0);
  });
});
