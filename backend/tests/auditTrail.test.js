const { app, pool, request, createStaff, createCitizen, createParcel, uniqueNationalId, transferWithApproval, hasNotification } = require('./helpers');

afterAll(() => pool.end());

const BUYERS = ['Ayen Lado Wani Lomoro', 'Chol Deng Majok Garang', 'Achol Mayen Kuol Ajak', 'Taban Peter Lomoro Wani', 'Rebecca Ayen Mading Aguer'];
const PDF = Buffer.from('%PDF-1.4\n% DLOVS test document\n');

let registrar; // registers the parcels
let reviewer; // a second officer, who may review their documents
beforeAll(async () => {
  registrar = await createStaff('land_officer', 'Registrar Officer');
  reviewer = await createStaff('land_officer', 'Reviewer Officer');
});

function auth(session) {
  return { Authorization: `Bearer ${session.token}` };
}

async function auditEntry(officerId, actionType, parcelId) {
  const { rows } = await pool.query(
    'SELECT * FROM audit_log WHERE officer_id = $1 AND action_type = $2 AND parcel_id = $3',
    [officerId, actionType, parcelId]
  );
  return rows;
}

// A parcel owned by a citizen whose national ID an officer has confirmed
async function ownedParcel() {
  const nationalId = uniqueNationalId();
  const owner = await createCitizen({ nationalId, verifiedBy: reviewer.token });
  const parcel = await createParcel(registrar.token, { nationalId });
  return { owner, parcel };
}

async function uploadDocument(session, parcelId, file = PDF, name = 'deed.pdf') {
  return request(app)
    .post(`/api/parcels/${parcelId}/documents`)
    .set(auth(session))
    .field('document_type', 'Allocation Letter')
    .attach('file', file, name);
}

// FR14: the proposal's metric (d), 20 officer transactions checked against the log
describe('metric (d): 100% of 20 officer transactions are in the audit log', () => {
  const transactions = [];

  test('5 parcel record creations', async () => {
    for (let i = 0; i < 5; i++) {
      const parcel = await createParcel(registrar.token, { neighbourhood: i % 2 ? 'Gudele' : 'Munuki' });
      transactions.push({ officer: registrar.user.user_id, action: 'CREATE_PARCEL', parcel: parcel.parcel_id });
    }
  });

  test('5 document approvals', async () => {
    for (let i = 0; i < 5; i++) {
      const { owner, parcel } = await ownedParcel();
      const upload = await uploadDocument(owner, parcel.parcel_id);
      expect(upload.status).toBe(201);
      const review = await request(app)
        .put(`/api/documents/${upload.body.document_id}/review`)
        .set(auth(reviewer))
        .send({ decision: 'verified' });
      expect(review.status).toBe(200);
      transactions.push({ officer: reviewer.user.user_id, action: 'VERIFY_DOCUMENT', parcel: parcel.parcel_id });
    }
  });

  test('5 land transfers', async () => {
    for (let i = 0; i < 5; i++) {
      const parcel = await createParcel(registrar.token);
      // started by the registrar, approved by the reviewer (owner has no account)
      const res = await transferWithApproval(registrar.token, reviewer.token, parcel.parcel_id, {
        new_owner: { full_name: BUYERS[i], national_id: uniqueNationalId() },
      });
      expect(res.status).toBe(200);
      transactions.push({ officer: registrar.user.user_id, action: 'PROCESS_TRANSFER', parcel: parcel.parcel_id });
    }
  });

  test('5 dispute resolutions', async () => {
    const citizen = await createCitizen();
    for (let i = 0; i < 5; i++) {
      const parcel = await createParcel(registrar.token);
      const flag = await request(app)
        .post('/api/disputes')
        .set(auth(citizen))
        .send({ parcel_id: parcel.parcel_id, dispute_type: i % 2 ? 'boundary' : 'ownership', description: 'Someone else is claiming this plot.' });
      expect(flag.status).toBe(201);
      const resolve = await request(app)
        .put(`/api/disputes/${flag.body.dispute_id}/resolve`)
        .set(auth(reviewer))
        .send({ resolution_notes: 'Both parties met at the land office; the claim was withdrawn.' });
      expect(resolve.status).toBe(200);
      transactions.push({ officer: reviewer.user.user_id, action: 'RESOLVE_DISPUTE', parcel: parcel.parcel_id });
    }
  });

  test('every one of the 20 transactions has exactly one audit entry with officer and timestamp', async () => {
    expect(transactions).toHaveLength(20);
    for (const t of transactions) {
      const entries = await auditEntry(t.officer, t.action, t.parcel);
      expect(entries).toHaveLength(1);
      expect(entries[0].timestamp).toBeInstanceOf(Date);
      expect(entries[0].details).toBeTruthy();
    }
  });

  test('an administrator sees every officer action; an officer sees only their own', async () => {
    const admin = await createStaff('administrator');
    const all = await request(app).get('/api/audit-logs').set(auth(admin));
    const officers = new Set(all.body.map((e) => e.officer_id));
    expect(officers.has(registrar.user.user_id)).toBe(true);
    expect(officers.has(reviewer.user.user_id)).toBe(true);

    const own = await request(app).get('/api/audit-logs').set(auth(registrar));
    expect(own.body.length).toBeGreaterThan(0);
    expect(own.body.every((e) => e.officer_id === registrar.user.user_id)).toBe(true);
  });
});

describe('FR10 documents and FR14 separation of duties', () => {
  test('the officer who registered a parcel cannot approve its documents', async () => {
    const { owner, parcel } = await ownedParcel();
    const upload = await uploadDocument(owner, parcel.parcel_id);
    const res = await request(app)
      .put(`/api/documents/${upload.body.document_id}/review`)
      .set(auth(registrar))
      .send({ decision: 'verified' });
    expect(res.status).toBe(403);
  });

  test('only the owner can upload, only PDF/JPG/PNG, and at most 5 MB', async () => {
    const { owner, parcel } = await ownedParcel();
    const stranger = await createCitizen({ verifiedBy: reviewer.token });
    expect((await uploadDocument(stranger, parcel.parcel_id)).status).toBe(403);
    expect((await uploadDocument(owner, parcel.parcel_id, Buffer.from('MZ not a pdf'), 'deed.pdf')).status).toBe(400);
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await uploadDocument(owner, parcel.parcel_id, big)).status).toBe(400);
  });

  test('documents are encrypted at rest', async () => {
    const { owner, parcel } = await ownedParcel();
    const upload = await uploadDocument(owner, parcel.parcel_id);
    const { rows } = await pool.query('SELECT file_url FROM document WHERE document_id = $1', [upload.body.document_id]);
    const fs = require('fs');
    const path = require('path');
    const stored = fs.readdirSync(process.env.UPLOAD_DIR).map((f) => fs.readFileSync(path.join(process.env.UPLOAD_DIR, f)));
    expect(rows[0].file_url).toBeTruthy();
    expect(stored.some((blob) => blob.includes(PDF))).toBe(false);
  });

  test('the public record shows document status but never the file', async () => {
    const { owner, parcel } = await ownedParcel();
    await uploadDocument(owner, parcel.parcel_id);
    const record = await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`);
    expect(record.body.documents[0].verification_status).toBe('pending');
    expect(record.body.documents[0].file_url).toBeUndefined();
  });
});

describe('FR12 disputes', () => {
  test('a flagged parcel shows as disputed to everyone and is active again once resolved', async () => {
    const citizen = await createCitizen();
    const parcel = await createParcel(registrar.token);
    const flag = await request(app)
      .post('/api/disputes')
      .set(auth(citizen))
      .send({ parcel_id: parcel.parcel_id, dispute_type: 'boundary', description: 'The fence is on my side of the plot.' });
    const guest = await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`);
    expect(guest.body.parcel.status).toBe('disputed');
    expect(guest.body.disputes[0].dispute_type).toBe('boundary');

    await request(app)
      .put(`/api/disputes/${flag.body.dispute_id}/resolve`)
      .set(auth(reviewer))
      .send({ resolution_notes: 'Boundary re-measured with both neighbours.' })
      .expect(200);
    const after = await request(app).get(`/api/parcels/${parcel.parcel_id}/verify`);
    expect(after.body.parcel.status).toBe('active');
  });

  test('one open dispute per parcel per person, and at most 3 open per account', async () => {
    const citizen = await createCitizen();
    const flag = (parcelId) => request(app)
      .post('/api/disputes')
      .set(auth(citizen))
      .send({ parcel_id: parcelId, dispute_type: 'ownership', description: 'Someone else is claiming this plot.' });

    const parcels = [];
    for (let i = 0; i < 4; i++) parcels.push(await createParcel(registrar.token));
    expect((await flag(parcels[0].parcel_id)).status).toBe(201);
    expect((await flag(parcels[0].parcel_id)).status).toBe(409); // same parcel again
    expect((await flag(parcels[1].parcel_id)).status).toBe(201);
    const third = await flag(parcels[2].parcel_id);
    expect(third.status).toBe(201);
    expect((await flag(parcels[3].parcel_id)).status).toBe(429); // a fourth open one

    // once an officer resolves one, the account can flag again
    await request(app)
      .put(`/api/disputes/${third.body.dispute_id}/resolve`)
      .set(auth(reviewer))
      .send({ resolution_notes: 'Checked with both parties; no competing claim.' })
      .expect(200);
    expect((await flag(parcels[3].parcel_id)).status).toBe(201);
  });

  test('officers are notified of new disputes', async () => {
    const citizen = await createCitizen();
    const parcel = await createParcel(registrar.token);
    await request(app)
      .post('/api/disputes')
      .set(auth(citizen))
      .send({ parcel_id: parcel.parcel_id, dispute_type: 'ownership', description: 'A broker is selling this plot.' })
      .expect(201);
    expect(await hasNotification(reviewer.token, (n) => n.message.includes(`#${parcel.parcel_id}`))).toBe(true);
  });
});
