// FR11 / FR14: ownership only changes with proof of the owner's consent —
// their own transfer request, an SMS code they read to the officer, or written
// consent checked by a second officer.
const { app, pool, request, createStaff, createCitizen, createParcel, uniqueNationalId, hasNotification } = require('./helpers');

afterAll(() => pool.end());

let officer;
let second;
beforeAll(async () => {
  officer = await createStaff('land_officer', 'Starting Officer');
  second = await createStaff('land_officer', 'Second Officer');
});

const auth = (s) => ({ Authorization: `Bearer ${s.token}` });
const BUYER = 'Achol Mayen Kuol Ajak';

const start = (parcelId, body = {}, by = officer) =>
  request(app).post(`/api/parcels/${parcelId}/transfer`).set(auth(by)).send({ reason: 'Sale', new_owner: { full_name: BUYER, national_id: uniqueNationalId() }, ...body });
const ownerOf = async (parcelId) => (await request(app).get(`/api/parcels/${parcelId}/verify`)).body.parcel.owner_name;
const actions = async (parcelId) =>
  (await pool.query('SELECT action_type, officer_id FROM audit_log WHERE parcel_id = $1 ORDER BY log_id', [parcelId])).rows;

describe('owner with an account: SMS code', () => {
  test('nothing changes until the officer enters the code the owner received', async () => {
    const nationalId = uniqueNationalId();
    const owner = await createCitizen({ nationalId, verifiedBy: officer.token });
    const parcel = await createParcel(officer.token, { ownerName: 'Akoi Deng Majok Garang', nationalId });

    const consent = await request(app).get(`/api/parcels/${parcel.parcel_id}/transfer-consent`).set(auth(officer));
    expect(consent.body.method).toBe('owner_code');

    const res = await start(parcel.parcel_id);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('awaiting_owner');
    expect(res.body.sent_to[0]).toMatch(/•••••/);
    expect(await ownerOf(parcel.parcel_id)).toBe('Akoi Deng Majok Garang');

    // the owner is warned in the app too
    expect(await hasNotification(owner.token, (n) => n.message.includes('only give it to the officer if you agreed'))).toBe(true);

    const id = res.body.transfer_id;
    const wrong = res.body.dev_code === '000000' ? '111111' : '000000';
    await request(app).post(`/api/pending-transfers/${id}/confirm`).set(auth(officer)).send({ code: wrong }).expect(400);
    // only the officer who started it can complete it
    await request(app).post(`/api/pending-transfers/${id}/confirm`).set(auth(second)).send({ code: res.body.dev_code }).expect(403);
    const done = await request(app).post(`/api/pending-transfers/${id}/confirm`).set(auth(officer)).send({ code: res.body.dev_code });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect(await ownerOf(parcel.parcel_id)).toBe(BUYER);

    const log = (await actions(parcel.parcel_id)).map((a) => a.action_type);
    expect(log).toEqual(expect.arrayContaining(['START_TRANSFER', 'PROCESS_TRANSFER']));
    // how consent was given is in the audit log, not the public history
    const processed = await pool.query(
      `SELECT details FROM audit_log WHERE parcel_id = $1 AND action_type = 'PROCESS_TRANSFER'`, [parcel.parcel_id]);
    expect(processed.rows[0].details).toMatch(/SMS code/);
    const history = (await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`)).body.ownership_history;
    expect(history[history.length - 1].notes).not.toMatch(/consent/);
  });

  test('five wrong codes lock the transfer; a new code unlocks it', async () => {
    const nationalId = uniqueNationalId();
    await createCitizen({ nationalId, verifiedBy: officer.token });
    const parcel = await createParcel(officer.token, { nationalId });
    const res = await start(parcel.parcel_id);
    const id = res.body.transfer_id;
    const wrong = res.body.dev_code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await request(app).post(`/api/pending-transfers/${id}/confirm`).set(auth(officer)).send({ code: wrong }).expect(400);
    }
    await request(app).post(`/api/pending-transfers/${id}/confirm`).set(auth(officer)).send({ code: res.body.dev_code }).expect(429);
    const again = await request(app).post(`/api/pending-transfers/${id}/resend`).set(auth(officer)).expect(200);
    await request(app).post(`/api/pending-transfers/${id}/confirm`).set(auth(officer)).send({ code: again.body.dev_code }).expect(200);
  });
});

describe('owner without an account: second officer', () => {
  test('the written consent is required, and the starting officer cannot approve it', async () => {
    const parcel = await createParcel(officer.token, { ownerName: 'Peter Lomoro Taban Wani' });
    const consent = await request(app).get(`/api/parcels/${parcel.parcel_id}/transfer-consent`).set(auth(officer));
    expect(consent.body.method).toBe('second_officer');

    const missing = await start(parcel.parcel_id);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('CONSENT_DOCUMENT_REQUIRED');

    const res = await start(parcel.parcel_id, { consent_document: 'Sale agreement signed before the Munuki chief, 12 Oct 2026' });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('awaiting_approval');
    expect(await ownerOf(parcel.parcel_id)).toBe('Peter Lomoro Taban Wani');

    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/approve`).set(auth(officer)).expect(403);
    const queue = await request(app).get('/api/pending-transfers').set(auth(second));
    expect(queue.body.find((t) => t.transfer_id === res.body.transfer_id).can_approve).toBe(true);
    const approved = await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/approve`).set(auth(second));
    expect(approved.status).toBe(200);
    expect(await ownerOf(parcel.parcel_id)).toBe(BUYER);

    const log = await actions(parcel.parcel_id);
    expect(log).toEqual(expect.arrayContaining([
      { action_type: 'START_TRANSFER', officer_id: officer.user.user_id },
      { action_type: 'PROCESS_TRANSFER', officer_id: officer.user.user_id },
      { action_type: 'APPROVE_TRANSFER', officer_id: second.user.user_id },
    ]));
  });

  test('a rejected transfer leaves the owner unchanged', async () => {
    const parcel = await createParcel(officer.token, { ownerName: 'Rebecca Achol Lual Akol' });
    const res = await start(parcel.parcel_id, { consent_document: 'Witness letter, no signature from the owner' });
    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/reject`).set(auth(second)).send({}).expect(400);
    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/reject`).set(auth(second))
      .send({ reason: 'The owner has not signed the letter' }).expect(200);
    expect(await ownerOf(parcel.parcel_id)).toBe('Rebecca Achol Lual Akol');
    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/approve`).set(auth(second)).expect(409);
  });
});

describe('reason for the transfer', () => {
  test('a reason is required; "Other" needs a description; the history shows it', async () => {
    const consent_document = 'Sale agreement signed before the area chief';
    const parcel = await createParcel(officer.token, { ownerName: 'Peter Lomoro Taban Wani' });
    expect((await start(parcel.parcel_id, { reason: undefined, consent_document })).status).toBe(400);
    expect((await start(parcel.parcel_id, { reason: 'Because', consent_document })).status).toBe(400);
    expect((await start(parcel.parcel_id, { reason: 'Other', consent_document })).status).toBe(400);

    const res = await start(parcel.parcel_id, { reason: 'Other', reason_details: 'Settlement agreed before the chief', consent_document });
    expect(res.status).toBe(202);
    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/approve`).set(auth(second)).expect(200);
    const history = (await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`)).body.ownership_history;
    const last = history[history.length - 1];
    expect(last.transfer_reason).toBe('Other');
    expect(last.transfer_reason_details).toBe('Settlement agreed before the chief');
    expect(history[0].transfer_reason).toBeNull(); // the initial registration
  });

  test('the list of reasons is available to the forms', async () => {
    const res = await request(app).get('/api/parcels/transfer-reasons');
    expect(res.body).toEqual(expect.arrayContaining(['Sale', 'Inheritance', 'Gift', 'Court order', 'Other']));
  });
});

describe('one transfer at a time, and a request binds the buyer', () => {
  test('a second transfer is refused while one waits; cancelling frees the parcel', async () => {
    const parcel = await createParcel(officer.token);
    const consent_document = 'Sale agreement signed before the area chief';
    const first = await start(parcel.parcel_id, { consent_document });
    expect((await start(parcel.parcel_id, { consent_document })).status).toBe(409);
    await request(app).put(`/api/pending-transfers/${first.body.transfer_id}/cancel`).set(auth(second)).expect(403);
    await request(app).put(`/api/pending-transfers/${first.body.transfer_id}/cancel`).set(auth(officer)).expect(200);
    expect((await start(parcel.parcel_id, { consent_document })).status).toBe(202);
  });

  test("an officer can't swap the buyer named in the owner's request", async () => {
    const nationalId = uniqueNationalId();
    const owner = await createCitizen({ nationalId, verifiedBy: officer.token });
    const parcel = await createParcel(officer.token, { nationalId });
    const buyerId = uniqueNationalId();
    const asked = await request(app).post(`/api/parcels/${parcel.parcel_id}/transfer-requests`).set(auth(owner))
      .send({ buyer_full_name: BUYER, buyer_national_id: buyerId, reason: 'Sale' });
    const swapped = await start(parcel.parcel_id, { transfer_request_id: asked.body.request_id });
    expect(swapped.status).toBe(409);
    expect(swapped.body.error).toMatch(/buyer the owner named/);
    const ok = await start(parcel.parcel_id, {
      transfer_request_id: asked.body.request_id,
      new_owner: { full_name: BUYER, national_id: buyerId },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('completed');
  });
});
