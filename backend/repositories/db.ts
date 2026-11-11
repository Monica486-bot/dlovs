import type { Pool, PoolClient } from 'pg';

// Repositories take either the shared pool or a client inside a transaction,
// so a controller can run several repository calls in one BEGIN … COMMIT.
export type Db = Pool | PoolClient;
