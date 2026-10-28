// Re-signs the stored QR code of every parcel with the current
// QR_SIGNING_PRIVATE_KEY, keeping each parcel's version. Run it after setting
// or changing the key; markers printed before then must be reprinted.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../dist/db/pool').default;
const { buildQrPayload } = require('../dist/utils/qr');

async function main() {
  const { rows } = await pool.query('SELECT parcel_id, qr_version FROM parcel ORDER BY parcel_id');
  for (const { parcel_id: id, qr_version: version } of rows) {
    const { code, signature } = buildQrPayload(id, version);
    await pool.query('UPDATE parcel SET unique_qr_code = $1, qr_signature = $2 WHERE parcel_id = $3', [code, signature, id]);
  }
  console.log(`Re-signed ${rows.length} QR codes.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
