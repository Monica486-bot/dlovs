import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { testDatabaseUrl, assertTestDatabase } from './testDatabase';

export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = assertTestDatabase(url);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const server = new Client({ connectionString: admin.toString() });
  await server.connect();
  const exists = await server.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (exists.rows.length === 0) await server.query(`CREATE DATABASE "${name}"`);
  await server.end();

  const db = new Client({ connectionString: url });
  await db.connect();
  await db.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  await db.end();
}
