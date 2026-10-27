import os from 'os';
import path from 'path';
import { testDatabaseUrl, assertTestDatabase } from './testDatabase';

const url = testDatabaseUrl();
assertTestDatabase(url);

process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.QR_SIGNING_SECRET = 'test-qr-secret';
process.env.PUBLIC_WEB_URL = 'https://dlovs.test';
// never send real SMS from the tests
process.env.TWILIO_ACCOUNT_SID = '';
process.env.TWILIO_AUTH_TOKEN = '';
process.env.TWILIO_FROM_NUMBER = '';
process.env.CLOUDINARY_URL = '';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `dlovs-test-uploads-${process.pid}`);
