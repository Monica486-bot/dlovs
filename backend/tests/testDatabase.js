const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// TEST_DATABASE_URL, or dlovs_test. The name must end in "_test".
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const envFile = path.join(__dirname, '..', '.env');
  const env = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
  const base = process.env.DATABASE_URL || env.DATABASE_URL;
  if (!base) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL in backend/.env) to run the tests');
  const url = new URL(base);
  url.pathname = '/dlovs_test';
  return url.toString();
}

function assertTestDatabase(url) {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${name}": the test database name must end in "_test"`);
  }
  return name;
}

module.exports = { testDatabaseUrl, assertTestDatabase };
