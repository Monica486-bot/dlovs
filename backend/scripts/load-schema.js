// Creates the DLOVS tables in an empty database, for setups without psql:
//   $env:DATABASE_URL="<External Database URL>"; npm run load-schema
// Only for a new database: schema.sql fails if the tables already exist.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL first.');
  // hosted databases (Render) require SSL; a local one doesn't
  const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
  const client = new Client({ connectionString: url, ssl });
  await client.connect();
  await client.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log(`Schema loaded: ${rows[0].n} tables.`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
