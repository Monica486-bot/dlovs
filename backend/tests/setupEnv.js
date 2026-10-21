// Runs in every test file before any app code loads. Variables set here win
// over backend/.env, because dotenv never overwrites an existing variable.
const os = require('os');
const path = require('path');
const { testDatabaseUrl, assertTestDatabase } = require('./testDatabase');

const url = testDatabaseUrl();
assertTestDatabase(url);

process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.QR_SIGNING_SECRET = 'test-qr-secret';
process.env.PUBLIC_WEB_URL = 'https://dlovs.test';
// no SMS provider: the API returns the code in dev_code instead
process.env.AT_API_KEY = '';
// documents go to a temporary folder, never Cloudinary
process.env.CLOUDINARY_URL = '';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `dlovs-test-uploads-${process.pid}`);
