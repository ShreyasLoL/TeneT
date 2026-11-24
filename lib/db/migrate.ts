import { loadEnvConfig } from '@next/env';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

loadEnvConfig(process.cwd());

async function main() {
  const migrationName = '0001_backend.sql';
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run database migrations.');
  }

  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });

  try {
    await client.connect();
    const migrationSql = await readFile(join(process.cwd(), 'lib', 'db', 'migrations', migrationName), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(migrationSql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    process.stdout.write(`Applied ${migrationName} (idempotent).\n`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Migration failed.'}\n`);
  process.exitCode = 1;
});
