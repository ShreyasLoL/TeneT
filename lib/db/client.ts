import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
type DbGlobals = typeof globalThis & {
  __tenetPools?: Map<string, Pool>;
  __tenetDbs?: Map<string, Database>;
};

const dbGlobals = globalThis as DbGlobals;
const databaseContext = new AsyncLocalStorage<Database>();

function requireConnectionString(connectionString: string | undefined, variable: string): string {
  if (!connectionString) {
    throw new Error(`${variable} is required to connect to Postgres.`);
  }
  return connectionString;
}

export function getPool(connectionString = requireConnectionString(process.env.DATABASE_URL, 'DATABASE_URL')): Pool {
  const pools = (dbGlobals.__tenetPools ??= new Map());
  const existing = pools.get(connectionString);
  if (existing) return existing;

  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pools.set(connectionString, pool);
  return pool;
}

export function getDb(): Database {
  return databaseContext.getStore() ?? getDbForConnection(
    requireConnectionString(process.env.DATABASE_URL, 'DATABASE_URL'),
  );
}

export function getDbForConnection(connectionString: string): Database {
  const key = requireConnectionString(connectionString, 'connectionString');
  const databases = (dbGlobals.__tenetDbs ??= new Map());
  const existing = databases.get(key);
  if (existing) return existing;

  const db = drizzle(getPool(key), { schema });
  databases.set(key, db);
  return db;
}

export async function withDatabaseTransaction<T>(connectionString: string, work: () => Promise<T>): Promise<T> {
  const db = getDbForConnection(connectionString);
  return db.transaction((tx) => databaseContext.run(tx as unknown as Database, work));
}

export async function closeDb(): Promise<void> {
  const pools = dbGlobals.__tenetPools;
  if (!pools) return;
  await Promise.all([...pools.values()].map((pool) => pool.end()));
  delete dbGlobals.__tenetPools;
  delete dbGlobals.__tenetDbs;
}
