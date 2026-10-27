import { Pool, types } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Timestamp columns have no time zone, so every session writes them in UTC
// and they are read back as UTC. Otherwise a database and API in different
// time zones disagree about when an SMS code expires.
const TIMESTAMP_OID = 1114;
types.setTypeParser(TIMESTAMP_OID, (value) => new Date(`${value.replace(' ', 'T')}Z`));

const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' });

export default pool;
