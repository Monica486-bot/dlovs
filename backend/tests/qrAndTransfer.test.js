// FR05 signed QR codes, FR11 transfers with a new QR code, FR08 / NFR07
// append-only ownership history.
const { app, pool, request, createStaff, createParcel, uniqueNationalId, signatureFromCode, transferWithApproval } = require('./helpers');

afterAll(() => pool.end());

let officer;
let approver; // the second officer who approves direct transfers
beforeAll(async () => {
  officer = await createStaff('land_officer');
  approver = await createStaff('land_officer', 'Approving Officer');
});

// these owners have no accounts, so a second officer approves the consent
function transfer(parcelId, body) {
  return transferWithApproval(officer.token, approver.token, parcelId, body);
}

describe('FR05 QR codes', () => {
  test('the QR code encodes the parcel verification URL with a signature', async () => {
    const parcel = await createParcel(officer.token);
    expect(parcel.unique_qr_code).toMatch(new RegExp(`^https://dlovs\\.test/verify/${parcel.parcel_id}\\?s=[0-9a-f]{16}$`));
    expect(parcel.qr_data_url).toMatch(/^data:image\/png;base64,/);
  });

  test('a genuine code is accepted and a forged one is refused', async () => {
    const parcel = await createParcel(officer.token);
    const signature = signatureFromCode(parcel.unique_qr_code);

    const genuine = await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`).query({ signature });
    expect(genuine.status).toBe(200);
    expect(genuine.body.qr_check).toBe('valid');

    const forged = await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`).query({ signature: '0123456789abcdef' });
    expect(forged.status).toBe(400);
    expect(forged.body.code).toBe('QR_INVALID');

    // another parcel's genuine code doesn't work on this one
    const other = await createParcel(officer.token);
    const swapped = await request(app)
      .get(`/api/parcels/${parcel.parcel_id}/verify`)
      .query({ signature: signatureFromCode(other.unique_qr_code) });
    expect(swapped.status).toBe(400);
  });
});

describe('FR11 land transfer', () => {
  test('a transfer records history, changes the owner, and issues a new QR code', async () => {
    const parcel = await createParcel(officer.token, { ownerName: 'Seller One Lomoro Taban' });
    const oldSignature = signatureFromCode(parcel.unique_qr_code);

    const res = await transfer(parcel.parcel_id, { new_owner: { full_name: 'Buyer One Achol Mayen', national_id: uniqueNationalId() }, notes: 'Sale' });
    expect(res.status).toBe(200);
    expect(res.body.qr_version).toBe(2);
    expect(res.body.qr_data_url).toMatch(/^data:image\/png;base64,/);

    const { rows } = await pool.query('SELECT unique_qr_code FROM parcel WHERE parcel_id = $1', [parcel.parcel_id]);
    const newSignature = signatureFromCode(rows[0].unique_qr_code);
    expect(newSignature).not.toBe(oldSignature);

    const record = await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`).query({ signature: newSignature });
    expect(record.body.qr_check).toBe('valid');
    expect(record.body.parcel.owner_name).toBe('Buyer One Achol Mayen');
    expect(record.body.ownership_history.map((h) => h.new_owner_name)).toEqual(['Seller One Lomoro Taban', 'Buyer One Achol Mayen']);
    expect(record.body.ownership_history[1].previous_owner_name).toBe('Seller One Lomoro Taban');
    expect(record.body.ownership_history[1].processed_by).toBe(officer.user.user_id);
  });

  test("the previous owner's old marker is recognised as replaced, not as current", async () => {
    const parcel = await createParcel(officer.token, { ownerName: 'Old Owner Mading Aguer' });
    const oldSignature = signatureFromCode(parcel.unique_qr_code);
    expect((await transfer(parcel.parcel_id, { new_owner: { full_name: 'New Owner Rebecca Ayen', national_id: uniqueNationalId() } })).status).toBe(200);

    const res = await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`).query({ signature: oldSignature });
    expect(res.status).toBe(200);
    expect(res.body.qr_check).toBe('superseded');
    expect(res.body.qr_issued_at).toBeTruthy();
    expect(res.body.parcel.owner_name).toBe('New Owner Rebecca Ayen');
  });

  test('owners are registered with four names, as on a national ID', async () => {
    const short = await request(app)
      .post('/api/parcels')
      .set('Authorization', `Bearer ${officer.token}`)
      .send({ gps_lat: 4.86, gps_lng: 31.57, neighbourhood: 'Munuki', owner: { full_name: 'Akoi Deng' } });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/four names/);

    const parcel = await createParcel(officer.token, { ownerName: '  Akoi   Deng Majok  Garang ' });
    expect(parcel.owner_name).toBe('Akoi Deng Majok Garang');
    const res = await transfer(parcel.parcel_id, { new_owner: { full_name: 'Nyandeng Kuol' } });
    expect(res.status).toBe(400);
  });

  test('a disputed parcel cannot be transferred', async () => {
    const parcel = await createParcel(officer.token);
    await pool.query(`UPDATE parcel SET status = 'disputed' WHERE parcel_id = $1`, [parcel.parcel_id]);
    const res = await transfer(parcel.parcel_id, { new_owner: { full_name: 'Buyer Deng Kuol Garang' } });
    expect(res.status).toBe(409);
  });

  test('a stale transfer is refused, so a plot cannot be sold twice', async () => {
    const parcel = await createParcel(officer.token);
    const ownerId = parcel.current_owner_id;
    expect((await transfer(parcel.parcel_id, { new_owner: { full_name: 'First Buyer Deng Majok' }, expected_owner_id: ownerId })).status).toBe(200);
    const second = await transfer(parcel.parcel_id, { new_owner: { full_name: 'Second Buyer Lual Chol' }, expected_owner_id: ownerId });
    expect(second.status).toBe(409);
  });
});

describe('FR08 / NFR07 append-only records', () => {
  test('ownership history and audit log rows cannot be changed or deleted', async () => {
    const parcel = await createParcel(officer.token);
    await expect(pool.query('UPDATE ownership_history SET notes = $1 WHERE parcel_id = $2', ['edited', parcel.parcel_id]))
      .rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM ownership_history WHERE parcel_id = $1', [parcel.parcel_id]))
      .rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM audit_log WHERE parcel_id = $1', [parcel.parcel_id]))
      .rejects.toThrow(/append-only/);
  });
});
