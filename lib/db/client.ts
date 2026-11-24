import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

type Database = NodePgDatabase<typeof schema>;
type DbGlobals = typeof globalThis & {
  __tenetPool?: Pool;
  __tenetDb?: Database;
};

const dbGlobals = globalThis as DbGlobals;

export function getPool(): Pool {
  if (dbGlobals.__tenetPool) return dbGlobals.__tenetPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to connect to Postgres.');
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  dbGlobals.__tenetPool = pool;
  return pool;
}

export function getDb(): Database {
  if (!dbGlobals.__tenetDb) {
    dbGlobals.__tenetDb = drizzle(getPool(), { schema });
  }
  return dbGlobals.__tenetDb;
}

export async function closeDb(): Promise<void> {
  const pool = dbGlobals.__tenetPool;
  if (pool) {
    await pool.end();
    delete dbGlobals.__tenetPool;
    delete dbGlobals.__tenetDb;
  }
}
