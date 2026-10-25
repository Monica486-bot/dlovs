// FR11 / FR14: ownership only changes with proof of the owner's consent:
// their own transfer request, an SMS code they read to the officer, or written
// consent checked by a second officer.
import { app, pool, request, createStaff, createCitizen, createParcel, uniqueNationalId, hasNotification } from './helpers';

afterAll(() => pool.end());

let officer: Awaited<ReturnType<typeof createStaff>>;
let second: Awaited<ReturnType<typeof createStaff>>;
beforeAll(async () => {
  officer = await createStaff('land_officer', 'Starting Officer');
  second = await createStaff('land_officer', 'Second Officer');
});

const auth = (s: { token: string }) => ({ Authorization: `Bearer ${s.token}` });
const BUYER = 'Achol Mayen Kuol Ajak';

const start = (parcelId: number, body: Record<string, unknown> = {}, by = officer) =>
  request(app).post(`/api/parcels/${parcelId}/transfer`).set(auth(by)).send({ reason: 'Sale', new_owner: { full_name: BUYER, national_id: uniqueNationalId() }, ...body });
const ownerOf = async (parcelId: number) => (await request(app).get(`/api/parcels/${parcelId}/verify`)).body.parcel.owner_name;
const actions = async (parcelId: number) =>
  (await pool.query('SELECT action_type, officer_id FROM audit_log WHERE parcel_id = $1 ORDER BY log_id', [parcelId])).rows;

describe('owner with an account: SMS code', () => {
  test('nothing changes until the officer enters the code the owner received', async () => {
    const nationalId = uniqueNationalId();
    const owner = await createCitizen({ nationalId, verifiedBy: officer.token });
    const parcel = await createParcel(officer.token, { ownerName: 'Akoi Deng Majok Garang', nationalId });

    const consent = await request(app).get(`/api/parcels/${parcel.parcel_id}/transfer-consent`).set(auth(officer));
    expect(consent.body.method).toBe('owner_code');

    const res = await start(parcel.parcel_id as number);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('awaiting_owner');
    expect(res.body.sent_to[0]).toMatch(/•••••/);
    expect(await ownerOf(parcel.parcel_id as number)).toBe('Akoi Deng Majok Garang');

    expect(await hasNotification(owner.token, (n) => (n.message as string).includes('Only give it to the officer if you agreed'))).toBe(true);

    const id = res.body.transfer_id;
    const wrong = res.body.dev_code === '000000' ? '111111' : '000000';
    await request(app).post(`/api/pending-transfers/${id}/confirm`).set(auth(officer)).send({ code: wrong }).expect(400);
    await request(app).post(`/api/pending-transfers/${id}/confirm`).set(auth(second)).send({ code: res.body.dev_code }).expect(403);
    const done = await request(app).post(`/api/pending-transfers/${id}/confirm`).set(auth(officer)).send({ code: res.body.dev_code });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect(await ownerOf(parcel.parcel_id as number)).toBe(BUYER);

    const log = (await actions(parcel.parcel_id as number)).map((a: { action_type: string }) => a.action_type);
    expect(log).toEqual(expect.arrayContaining(['START_TRANSFER', 'PROCESS_TRANSFER']));
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
    const res = await start(parcel.parcel_id as number);
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

    const missing = await start(parcel.parcel_id as number);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('CONSENT_DOCUMENT_REQUIRED');

    const res = await start(parcel.parcel_id as number, { consent_document: 'Sale agreement signed before the Munuki chief, 12 Oct 2026' });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('awaiting_approval');
    expect(await ownerOf(parcel.parcel_id as number)).toBe('Peter Lomoro Taban Wani');

    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/approve`).set(auth(officer)).expect(403);
    const queue = await request(app).get('/api/pending-transfers').set(auth(second));
    expect(queue.body.find((t: { transfer_id: number; can_approve: boolean }) => t.transfer_id === res.body.transfer_id).can_approve).toBe(true);
    const approved = await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/approve`).set(auth(second));
    expect(approved.status).toBe(200);
    expect(await ownerOf(parcel.parcel_id as number)).toBe(BUYER);

    const log = await actions(parcel.parcel_id as number);
    expect(log).toEqual(expect.arrayContaining([
      { action_type: 'START_TRANSFER', officer_id: officer.user.user_id },
      { action_type: 'PROCESS_TRANSFER', officer_id: officer.user.user_id },
      { action_type: 'APPROVE_TRANSFER', officer_id: second.user.user_id },
    ]));
  });

  test('a rejected transfer leaves the owner unchanged', async () => {
    const parcel = await createParcel(officer.token, { ownerName: 'Rebecca Achol Lual Akol' });
    const res = await start(parcel.parcel_id as number, { consent_document: 'Witness letter, no signature from the owner' });
    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/reject`).set(auth(second)).send({}).expect(400);
    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/reject`).set(auth(second))
      .send({ reason: 'The owner has not signed the letter' }).expect(200);
    expect(await ownerOf(parcel.parcel_id as number)).toBe('Rebecca Achol Lual Akol');
    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/approve`).set(auth(second)).expect(409);
  });
});

describe('reason for the transfer', () => {
  test('a reason is required; "Other" needs a description; the history shows it', async () => {
    const consent_document = 'Sale agreement signed before the area chief';
    const parcel = await createParcel(officer.token, { ownerName: 'Peter Lomoro Taban Wani' });
    expect((await start(parcel.parcel_id as number, { reason: undefined, consent_document })).status).toBe(400);
    expect((await start(parcel.parcel_id as number, { reason: 'Because', consent_document })).status).toBe(400);
    expect((await start(parcel.parcel_id as number, { reason: 'Other', consent_document })).status).toBe(400);

    const res = await start(parcel.parcel_id as number, { reason: 'Other', reason_details: 'Settlement agreed before the chief', consent_document });
    expect(res.status).toBe(202);
    await request(app).put(`/api/pending-transfers/${res.body.transfer_id}/approve`).set(auth(second)).expect(200);
    const history = (await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`)).body.ownership_history;
    const last = history[history.length - 1];
    expect(last.transfer_reason).toBe('Other');
    expect(last.transfer_reason_details).toBe('Settlement agreed before the chief');
    expect(history[0].transfer_reason).toBeNull();
  });

  test('the list of reasons is available to the forms', async () => {
    const res = await request(app).get('/api/parcels/transfer-reasons');
    expect(res.body).toEqual(expect.arrayContaining(['Sale', 'Inheritance', 'Gift', 'Court order', 'Other']));
  });
});

describe('officer-free transfer: the buyer accepts with an SMS code', () => {
  const ACCOUNT_NAME = 'Test Citizen Deng Majok';

  async function ownerAndBuyer() {
    const nationalId = uniqueNationalId();
    const owner = await createCitizen({ nationalId, verifiedBy: officer.token });
    const parcel = await createParcel(officer.token, { ownerName: 'Akoi Deng Majok Garang', nationalId });
    const buyer = await createCitizen({ verifiedBy: officer.token });
    const asked = await request(app).post(`/api/parcels/${parcel.parcel_id}/transfer-requests`).set(auth(owner))
      .send({ buyer_full_name: ACCOUNT_NAME, buyer_national_id: buyer.nationalId, reason: 'Sale' });
    expect(asked.status).toBe(201);
    return { owner, buyer, parcel, requestId: asked.body.request_id, asked };
  }

  test('owner requests, buyer accepts with the code, and the land moves with no officer', async () => {
    const { owner, buyer, parcel, requestId, asked } = await ownerAndBuyer();
    expect(asked.body.buyer_can_accept).toBe(true);
    expect(await hasNotification(buyer.token, (n) => (n.message as string).includes(`parcel #${parcel.parcel_id} to you`))).toBe(true);

    const mine = await request(app).get('/api/transfer-requests').set(auth(buyer));
    const incoming = mine.body.find((r: { request_id: number }) => r.request_id === requestId);
    expect(incoming.incoming).toBe(true);
    expect(incoming.accept_code_hash).toBeUndefined();

    await request(app).post(`/api/transfer-requests/${requestId}/accept-code`).set(auth(owner)).expect(404);
    const sent = await request(app).post(`/api/transfer-requests/${requestId}/accept-code`).set(auth(buyer)).expect(200);
    const wrong = sent.body.dev_code === '000000' ? '111111' : '000000';
    await request(app).post(`/api/transfer-requests/${requestId}/accept`).set(auth(buyer)).send({ code: wrong }).expect(400);
    expect(await ownerOf(parcel.parcel_id as number)).toBe('Akoi Deng Majok Garang');

    const done = await request(app).post(`/api/transfer-requests/${requestId}/accept`).set(auth(buyer)).send({ code: sent.body.dev_code });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect(await ownerOf(parcel.parcel_id as number)).toBe(ACCOUNT_NAME);

    const log = await actions(parcel.parcel_id as number);
    expect(log).toEqual(expect.arrayContaining([{ action_type: 'PROCESS_TRANSFER', officer_id: null }]));
    const processed = await pool.query(
      `SELECT details FROM audit_log WHERE parcel_id = $1 AND action_type = 'PROCESS_TRANSFER'`, [parcel.parcel_id]);
    expect(processed.rows[0].details).toMatch(/buyer's SMS code/);
    expect(await hasNotification(officer.token, (n) => (n.message as string).includes(`Parcel #${parcel.parcel_id} was transferred`))).toBe(true);
    expect(await hasNotification(owner.token, (n) => (n.message as string).includes('transferred from you'))).toBe(true);
    await request(app).post(`/api/transfer-requests/${requestId}/accept`).set(auth(buyer)).send({ code: sent.body.dev_code }).expect(409);
  });

  test('the buyer can decline; a buyer without a confirmed account goes to the officers', async () => {
    const { owner, buyer, parcel, requestId } = await ownerAndBuyer();
    await request(app).put(`/api/transfer-requests/${requestId}/decline`).set(auth(buyer)).send({}).expect(200);
    expect(await ownerOf(parcel.parcel_id as number)).toBe('Akoi Deng Majok Garang');
    expect(await hasNotification(owner.token, (n) => (n.message as string).includes('declined'))).toBe(true);

    const unconfirmed = await createCitizen();
    const asked = await request(app).post(`/api/parcels/${parcel.parcel_id}/transfer-requests`).set(auth(owner))
      .send({ buyer_full_name: ACCOUNT_NAME, buyer_national_id: unconfirmed.nationalId, reason: 'Sale' });
    expect(asked.body.buyer_can_accept).toBe(false);
    await request(app).post(`/api/transfer-requests/${asked.body.request_id}/accept-code`).set(auth(unconfirmed)).expect(404);
  });

  test('a disputed parcel cannot be accepted', async () => {
    const { buyer, parcel, requestId } = await ownerAndBuyer();
    const sent = await request(app).post(`/api/transfer-requests/${requestId}/accept-code`).set(auth(buyer)).expect(200);
    await pool.query(`UPDATE parcel SET status = 'disputed' WHERE parcel_id = $1`, [parcel.parcel_id]);
    const res = await request(app).post(`/api/transfer-requests/${requestId}/accept`).set(auth(buyer)).send({ code: sent.body.dev_code });
    expect(res.status).toBe(409);
    expect(await ownerOf(parcel.parcel_id as number)).toBe('Akoi Deng Majok Garang');
  });
});

describe('the owner is told about every officer action on their land', () => {
  test('registration, edits and deactivation reach the owner', async () => {
    const nationalId = uniqueNationalId();
    const owner = await createCitizen({ nationalId, verifiedBy: officer.token });
    const parcel = await createParcel(officer.token, { nationalId });
    expect(await hasNotification(owner.token, (n) => (n.message as string).includes(`registered parcel #${parcel.parcel_id}`))).toBe(true);

    await request(app).put(`/api/parcels/${parcel.parcel_id}`).set(auth(second)).send({ area_sqm: 750 }).expect(200);
    expect(await hasNotification(owner.token, (n) => (n.message as string).includes('Officer Second Officer') && (n.message as string).includes('area_sqm'))).toBe(true);

    const admin = await createStaff('administrator', 'Chief Administrator');
    await request(app).put(`/api/admin/parcels/${parcel.parcel_id}/deactivate`).set(auth(admin)).expect(200);
    expect(await hasNotification(owner.token, (n) => (n.message as string).includes('deactivated'))).toBe(true);
  });
});

describe('a national ID belongs to one person', () => {
  test('a transfer to a registered national ID under another name is refused, not given to the ID holder', async () => {
    const heldId = uniqueNationalId();
    const holder = await createParcel(officer.token, { ownerName: 'Garang Akol Deng Mayen', nationalId: heldId });
    const parcel = await createParcel(officer.token, { ownerName: 'Peter Lomoro Taban Wani' });
    const consent_document = 'Sale agreement signed before the area chief';

    const wrong = await start(parcel.parcel_id as number, { consent_document, new_owner: { full_name: BUYER, national_id: heldId } });
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe('NATIONAL_ID_NAME_MISMATCH');
    expect(wrong.body.error).toMatch(/Garang Akol Deng Mayen/);
    expect(await ownerOf(parcel.parcel_id as number)).toBe('Peter Lomoro Taban Wani');
    expect(await ownerOf(holder.parcel_id as number)).toBe('Garang Akol Deng Mayen');

    const same = await start(parcel.parcel_id as number, { consent_document, new_owner: { full_name: 'garang  akol deng MAYEN', national_id: heldId } });
    expect(same.status).toBe(202);
    await request(app).put(`/api/pending-transfers/${same.body.transfer_id}/approve`).set(auth(second)).expect(200);
    const owners = await pool.query('SELECT DISTINCT current_owner_id FROM parcel WHERE parcel_id = ANY($1)', [[holder.parcel_id, parcel.parcel_id]]);
    expect(owners.rows).toHaveLength(1);
  });

  test('registering a parcel to a held national ID under another name is refused', async () => {
    const heldId = uniqueNationalId();
    await createParcel(officer.token, { ownerName: 'Garang Akol Deng Mayen', nationalId: heldId });
    const res = await request(app).post('/api/parcels').set(auth(officer)).send({
      gps_lat: 4.86, gps_lng: 31.57, neighbourhood: 'Munuki', owner: { full_name: BUYER, national_id: heldId },
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NATIONAL_ID_NAME_MISMATCH');
  });

  test("a citizen's request naming a held ID under another name is refused without revealing the holder", async () => {
    const heldId = uniqueNationalId();
    await createParcel(officer.token, { ownerName: 'Garang Akol Deng Mayen', nationalId: heldId });
    const nationalId = uniqueNationalId();
    const owner = await createCitizen({ nationalId, verifiedBy: officer.token });
    const parcel = await createParcel(officer.token, { nationalId });
    const res = await request(app).post(`/api/parcels/${parcel.parcel_id}/transfer-requests`).set(auth(owner))
      .send({ buyer_full_name: BUYER, buyer_national_id: heldId, reason: 'Sale' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NATIONAL_ID_NAME_MISMATCH');
    expect(res.body.error).not.toMatch(/Garang/);
  });
});

describe('one transfer at a time, and a request binds the buyer', () => {
  test('a second transfer is refused while one waits; cancelling frees the parcel', async () => {
    const parcel = await createParcel(officer.token);
    const consent_document = 'Sale agreement signed before the area chief';
    const first = await start(parcel.parcel_id as number, { consent_document });
    expect((await start(parcel.parcel_id as number, { consent_document })).status).toBe(409);
    await request(app).put(`/api/pending-transfers/${first.body.transfer_id}/cancel`).set(auth(second)).expect(403);
    await request(app).put(`/api/pending-transfers/${first.body.transfer_id}/cancel`).set(auth(officer)).expect(200);
    expect((await start(parcel.parcel_id as number, { consent_document })).status).toBe(202);
  });

  test("an officer can't swap the buyer named in the owner's request", async () => {
    const nationalId = uniqueNationalId();
    const owner = await createCitizen({ nationalId, verifiedBy: officer.token });
    const parcel = await createParcel(officer.token, { nationalId });
    const buyerId = uniqueNationalId();
    const asked = await request(app).post(`/api/parcels/${parcel.parcel_id}/transfer-requests`).set(auth(owner))
      .send({ buyer_full_name: BUYER, buyer_national_id: buyerId, reason: 'Sale' });
    const swapped = await start(parcel.parcel_id as number, { transfer_request_id: asked.body.request_id });
    expect(swapped.status).toBe(409);
    expect(swapped.body.error).toMatch(/buyer the owner named/);
    const ok = await start(parcel.parcel_id as number, {
      transfer_request_id: asked.body.request_id,
      new_owner: { full_name: BUYER, national_id: buyerId },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('completed');
  });
});
