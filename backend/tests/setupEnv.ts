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
process.env.AT_API_KEY = '';
process.env.CLOUDINARY_URL = '';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `dlovs-test-uploads-${process.pid}`);
