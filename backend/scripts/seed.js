// Loads demo data for the solution demonstration: an administrator, two land
// officers, a citizen, and parcels in Munuki and Gudele covering every state
// (active, transferred, disputed, resolved dispute, deactivated).
// Refuses to run on a database that already has users.
//
// Usage: npm run seed

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { buildQrPayload } = require('../utils/qr');

const PASSWORD = 'pass1234';

const USERS = [
  { key: 'admin', full_name: 'Ayen Garang', phone: '+211900000009', role: 'administrator', platform: 'web' },
  { key: 'deng', full_name: 'Officer Deng Majok', phone: '+211900000001', role: 'land_officer', platform: 'web' },
  { key: 'lado', full_name: 'Officer Lado Wani', phone: '+211900000003', role: 'land_officer', platform: 'web' },
  { key: 'akoi', full_name: 'Akoi Deng', phone: '+211900000002', role: 'citizen', platform: 'mobile', national_id: 'SS-0001' },
  { key: 'nyandeng', full_name: 'Nyandeng Kuol', phone: '+211900000004', role: 'citizen', platform: 'mobile', national_id: 'SS-0004' },
];

// owner = [full_name, national_id, contact, document_type]
const PARCELS = [
  { hood: 'Munuki', lat: 4.8621, lng: 31.5734, area: 450, by: 'deng', owner: ['Akoi Deng', 'SS-0001', '+211900000002', 'Allocation Letter'] },
  { hood: 'Munuki', lat: 4.8643, lng: 31.5761, area: 600, by: 'deng', owner: ['Akoi Deng', 'SS-0001', '+211900000002', 'Customary Certificate'] },
  {
    hood: 'Gudele', lat: 4.8752, lng: 31.5498, area: 500, by: 'lado', owner: ['Mading Aguer', 'SS-0102', null, 'Sale Agreement'],
    transferTo: ['Nyandeng Kuol', 'SS-0004', '+211900000004', 'Sale Agreement'],
  },
  {
    hood: 'Gudele', lat: 4.8768, lng: 31.5521, area: 375, by: 'lado', owner: ['Peter Lomoro', 'SS-0233', '+211900000021', 'Witness Agreement'],
    dispute: { by: 'nyandeng', type: 'ownership', description: 'A broker is offering this plot for sale while the owner is in Kakuma. The owner has not agreed to sell.' },
  },
  {
    hood: 'Munuki', lat: 4.8605, lng: 31.5712, area: 420, by: 'deng', owner: ['Rebecca Achol', 'SS-0310', null, 'Allocation Letter'],
    dispute: { by: 'akoi', type: 'boundary', description: 'The fence on the east side was moved two metres onto the neighbouring plot.', resolvedBy: 'lado', notes: 'Boundary re-measured with both neighbours present; fence restored.' },
  },
  {
    hood: 'Gudele', lat: 4.8731, lng: 31.5476, area: 550, by: 'deng', owner: ['James Taban', 'SS-0999', null, 'Allocation Letter'],
    deactivate: 'Allocation letter found to be forged during document review',
  },
];

async function main() {
  const existing = await pool.query('SELECT COUNT(*)::int AS n FROM "user"');
  if (existing.rows[0].n > 0) {
    console.error('This database already has users. Seed only an empty database (run db/schema.sql first).');
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(PASSWORD, 10);
    const ids = {};
    for (const u of USERS) {
      const r = await client.query(
        `INSERT INTO "user" (full_name, phone_number, password_hash, role, platform, national_id, phone_verified)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING user_id`,
        [u.full_name, u.phone, hash, u.role, u.platform, u.national_id || null]
      );
      ids[u.key] = r.rows[0].user_id;
    }
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, details, timestamp) VALUES ($1, 'CREATE_USER', 'Created land officer accounts for Deng Majok and Lado Wani', now() - interval '61 days')`,
      [ids.admin]
    );
    // the demo citizens have already shown their ID cards at the land office
    await client.query(
      `UPDATE "user" SET national_id_verified_at = now() - interval '50 days', national_id_verified_by = $1
       WHERE role = 'citizen' AND national_id IS NOT NULL`,
      [ids.deng]
    );
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, details, timestamp)
       VALUES ($1, 'VERIFY_NATIONAL_ID', 'Checked the ID cards of Akoi Deng and Nyandeng Kuol in person', now() - interval '50 days')`,
      [ids.deng]
    );

    const addOwner = async ([full_name, national_id, contact, document_type]) =>
      (await client.query(
        `INSERT INTO owner (full_name, national_id, contact_number, document_type) VALUES ($1, $2, $3, $4) RETURNING owner_id`,
        [full_name, national_id, contact, document_type]
      )).rows[0].owner_id;

    for (const p of PARCELS) {
      const officer = ids[p.by];
      const ownerId = await addOwner(p.owner);
      const parcelId = (await client.query(
        `INSERT INTO parcel (gps_lat, gps_lng, neighbourhood, area_sqm, unique_qr_code, qr_signature, registered_by, current_owner_id, registered_date)
         VALUES ($1, $2, $3, $4, 'pending', 'pending', $5, $6, CURRENT_DATE - 60) RETURNING parcel_id`,
        [p.lat, p.lng, p.hood, p.area, officer, ownerId]
      )).rows[0].parcel_id;
      const { code, signature } = buildQrPayload(parcelId);
      await client.query('UPDATE parcel SET unique_qr_code = $1, qr_signature = $2 WHERE parcel_id = $3', [code, signature, parcelId]);
      await client.query(
        `INSERT INTO ownership_history (parcel_id, previous_owner_id, new_owner_id, processed_by, notes, transfer_date)
         VALUES ($1, NULL, $2, $3, 'Initial registration', now() - interval '60 days')`,
        [parcelId, ownerId, officer]
      );
      await client.query(
        `INSERT INTO audit_log (officer_id, action_type, parcel_id, details, timestamp) VALUES ($1, 'CREATE_PARCEL', $2, $3, now() - interval '60 days')`,
        [officer, parcelId, `Registered parcel in ${p.hood} for owner ${p.owner[0]}`]
      );

      if (p.transferTo) {
        const newOwnerId = await addOwner(p.transferTo);
        await client.query('UPDATE parcel SET current_owner_id = $1 WHERE parcel_id = $2', [newOwnerId, parcelId]);
        await client.query(
          `INSERT INTO ownership_history (parcel_id, previous_owner_id, new_owner_id, processed_by, notes, transfer_date)
           VALUES ($1, $2, $3, $4, 'Ownership transfer processed', now() - interval '12 days')`,
          [parcelId, ownerId, newOwnerId, ids.deng]
        );
        await client.query(
          `INSERT INTO audit_log (officer_id, action_type, parcel_id, details, timestamp) VALUES ($1, 'PROCESS_TRANSFER', $2, $3, now() - interval '12 days')`,
          [ids.deng, parcelId, `Transferred to ${p.transferTo[0]}`]
        );
      }

      if (p.dispute) {
        const d = p.dispute;
        const resolved = Boolean(d.resolvedBy);
        await client.query(
          `INSERT INTO dispute (parcel_id, reported_by, reported_via, dispute_type, description, status, created_at, resolved_at, resolved_by)
           VALUES ($1, $2, 'mobile', $3, $4, $5, now() - interval '5 days', $6, $7)`,
          [parcelId, ids[d.by], d.type, d.description, resolved ? 'resolved' : 'open', resolved ? new Date(Date.now() - 2 * 86400000) : null, resolved ? ids[d.resolvedBy] : null]
        );
        if (resolved) {
          await client.query(
            `INSERT INTO audit_log (officer_id, action_type, parcel_id, details, timestamp) VALUES ($1, 'RESOLVE_DISPUTE', $2, $3, now() - interval '2 days')`,
            [ids[d.resolvedBy], parcelId, d.notes]
          );
        } else {
          await client.query(`UPDATE parcel SET status = 'disputed' WHERE parcel_id = $1`, [parcelId]);
        }
      }

      if (p.deactivate) {
        await client.query(`UPDATE parcel SET status = 'deactivated' WHERE parcel_id = $1`, [parcelId]);
        await client.query(
          `INSERT INTO audit_log (officer_id, action_type, parcel_id, details, timestamp) VALUES ($1, 'DEACTIVATE_PARCEL', $2, $3, now() - interval '3 days')`,
          [ids.admin, parcelId, p.deactivate]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`Demo data loaded. Every account's password is "${PASSWORD}":`);
    for (const u of USERS) console.log(`  ${u.role.padEnd(13)} ${u.phone}  ${u.full_name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
