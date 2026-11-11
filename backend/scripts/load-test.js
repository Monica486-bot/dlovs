// NFR01 / NFR05 load test: fills a separate database with 50,000 parcels and 40,000 owners
// spread over a 13 km square around Juba, starts the API locally, and times 50 requests per
// endpoint. Results are printed and written to docs/testing/load-test-results.md.
//   npm run load-test            (needs DATABASE_URL in backend/.env; uses a database named dlovs_load)
//   LOAD_DATABASE_URL=postgres://…/dlovs_load npm run load-test
// The database name must end in "_load": the script drops and recreates every table in it.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');

const PARCELS = 50000;
const OWNERS = 40000;
const REQUESTS = 50;
const WARMUP = 5;
const CENTRE = { lat: 4.85, lng: 31.58 };
const SQUARE_DEG = 0.117; // about 13 km

function loadDatabaseUrl() {
  if (process.env.LOAD_DATABASE_URL) return process.env.LOAD_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error('Set LOAD_DATABASE_URL, or DATABASE_URL in backend/.env');
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/dlovs_load';
  return url.toString();
}

async function prepareDatabase(url) {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_load')) throw new Error(`Refusing to load test "${name}": the database name must end in "_load"`);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const server = new Client({ connectionString: admin.toString() });
  await server.connect();
  const exists = await server.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (exists.rows.length === 0) await server.query(`CREATE DATABASE "${name}"`);
  await server.end();

  const { NEIGHBOURHOODS } = require('../dist/utils/neighbourhoods');
  const db = new Client({ connectionString: url });
  await db.connect();
  await db.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  const officer = await db.query(
    `INSERT INTO "user" (full_name, phone_number, password_hash, role, platform, phone_verified)
     VALUES ('Load Test Officer Deng Majok', '+211910000000', 'not-a-real-hash', 'land_officer', 'web', true) RETURNING user_id`
  );
  // four-part names built from common South Sudanese names, so name searches match many owners
  await db.query(
    `INSERT INTO owner (full_name, national_id, document_type)
     SELECT (ARRAY['Akoi','Nyandeng','Deng','Achol','Garang','Ayen','Lado','Kiden','Majok','Abuk'])[1 + i % 10] || ' ' ||
            (ARRAY['Deng','Kuol','Wani','Ajak','Lomoro','Mayen','Taban','Chol'])[1 + (i / 10) % 8] || ' ' ||
            (ARRAY['Majok','Garang','Ladu','Akol','Mading','Jok'])[1 + (i / 80) % 6] || ' ' ||
            (ARRAY['Garang','Mayen','Wani','Kuol','Deng','Ajak','Malek'])[1 + (i / 480) % 7],
            'LOAD-' || i, 'Allocation Letter'
     FROM generate_series(1, $1::int) AS i`,
    [OWNERS]
  );
  await db.query(
    `INSERT INTO parcel (gps_lat, gps_lng, neighbourhood, area_sqm, unique_qr_code, qr_signature, registered_by, current_owner_id)
     SELECT $2::numeric + (random() - 0.5) * $4::numeric, $3::numeric + (random() - 0.5) * $4::numeric,
            ($5::text[])[1 + i % array_length($5::text[], 1)], 300 + (i % 700),
            'load-' || i, 'load-signature', $6, 1 + (i % $7::int)
     FROM generate_series(1, $1::int) AS i`,
    [PARCELS, CENTRE.lat, CENTRE.lng, SQUARE_DEG, NEIGHBOURHOODS, officer.rows[0].user_id, OWNERS]
  );
  await db.query(
    `INSERT INTO ownership_history (parcel_id, new_owner_id, processed_by, notes)
     SELECT parcel_id, current_owner_id, registered_by, 'Initial registration' FROM parcel`
  );
  await db.query('ANALYZE');
  const pg = await db.query('SHOW server_version');
  await db.end();
  return { pgVersion: pg.rows[0].server_version, neighbourhood: NEIGHBOURHOODS[0] };
}

function startApi(url) {
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test'; // no request logging, push or SMS during the run
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.QR_SIGNING_PRIVATE_KEY = crypto.generateKeyPairSync('ed25519').privateKey
    .export({ format: 'der', type: 'pkcs8' }).toString('base64');
  for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'CLOUDINARY_URL']) process.env[key] = '';
  const app = require('../dist/app').default;
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/api` }));
  });
}

const randomId = () => 1 + Math.floor(Math.random() * PARCELS);
const randomPoint = () => ({
  lat: (CENTRE.lat + (Math.random() - 0.5) * SQUARE_DEG * 0.8).toFixed(6),
  lng: (CENTRE.lng + (Math.random() - 0.5) * SQUARE_DEG * 0.8).toFixed(6),
});

async function time(base, makePath) {
  const times = [];
  let bytes = 0;
  let total = '';
  for (let i = 0; i < WARMUP + REQUESTS; i++) {
    const started = performance.now();
    const res = await fetch(base + makePath());
    const body = Buffer.from(await res.arrayBuffer());
    const ms = performance.now() - started;
    if (!res.ok) throw new Error(`${makePath()} returned ${res.status}: ${body.toString().slice(0, 200)}`);
    if (i >= WARMUP) {
      times.push(ms);
      bytes = Math.max(bytes, body.length);
      total = res.headers.get('x-total-count') || '';
    }
  }
  times.sort((a, b) => a - b);
  const pick = (q) => times[Math.min(times.length - 1, Math.ceil(q * times.length) - 1)];
  return { median: pick(0.5), p95: pick(0.95), kb: bytes / 1024, total };
}

async function main() {
  const url = loadDatabaseUrl();
  if (!fs.existsSync(path.join(__dirname, '..', 'dist', 'app.js'))) throw new Error('Run "npm run build" first');
  console.log(`Filling ${new URL(url).pathname.slice(1)} with ${PARCELS} parcels and ${OWNERS} owners…`);
  const started = Date.now();
  const { pgVersion, neighbourhood } = await prepareDatabase(url);
  console.log(`Data loaded in ${((Date.now() - started) / 1000).toFixed(1)} s. Timing ${REQUESTS} requests per endpoint…`);
  const { server, base } = await startApi(url);
  const near = (radius) => () => { const p = randomPoint(); return `/parcels/search?by=near&lat=${p.lat}&lng=${p.lng}&radius=${radius}`; };

  const cases = [
    ['Verify a parcel (full record, history, disputes, documents)', () => `/parcels/${randomId()}/verify`],
    ['Search by parcel ID', () => `/parcels/search?by=parcel_id&query=${randomId()}`],
    ['Search by owner name ("nyandeng kuol", first page)', () => '/parcels/search?by=owner_name&query=nyandeng%20kuol'],
    [`Search by neighbourhood ("${neighbourhood}", first page)`, () => `/parcels/search?by=neighbourhood&query=${encodeURIComponent(neighbourhood)}`],
    ['Search the whole city ("Juba", page 20)', () => '/parcels/search?by=neighbourhood&query=Juba&offset=950'],
    ['Near me, 500 m', near(500)],
    ['Near me, 5 km (the maximum)', near(5000)],
    ['Owner portfolio', () => `/owners/${1 + Math.floor(Math.random() * OWNERS)}`],
  ];
  const rows = [];
  for (const [label, makePath] of cases) {
    const r = await time(base, makePath);
    rows.push({ label, ...r });
    console.log(`  ${label}: median ${r.median.toFixed(0)} ms, p95 ${r.p95.toFixed(0)} ms, ${r.kb.toFixed(1)} KB${r.total ? `, ${r.total} matches` : ''}`);
  }
  server.close();
  await require('../dist/db/pool').default.end();

  const table = [
    '| Request | Median | 95th percentile | Largest response | Total matches |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.label} | ${r.median.toFixed(0)} ms | ${r.p95.toFixed(0)} ms | ${r.kb.toFixed(1)} KB | ${r.total || '-'} |`),
  ].join('\n');
  const report = `# Load test results

Generated by \`backend/scripts/load-test.js\` on ${new Date().toISOString().slice(0, 10)}.

- Data: ${PARCELS.toLocaleString('en')} parcels and ${OWNERS.toLocaleString('en')} owners, random points in a 13 km square around Juba
- Method: ${REQUESTS} timed requests per endpoint (after ${WARMUP} warm-up requests), one at a time, against the API running locally
- Machine: ${os.cpus()[0].model}, ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM, ${os.type()} ${os.release()}
- Software: Node.js ${process.version}, PostgreSQL ${pgVersion}

${table}

Times are measured on the same machine as the database, so they exclude network latency. Search returns 50 results per
page; "Total matches" is the X-Total-Count header.
`;
  const out = path.join(__dirname, '..', '..', 'docs', 'testing', 'load-test-results.md');
  fs.writeFileSync(out, report);
  console.log(`\n${table}\n\nWritten to ${path.relative(process.cwd(), out)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
