import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql, type SQL } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dayKey } from '@/lib/domain/day';

const environment = process.env as Record<string, string | undefined>;
const originalNodeEnv = environment.NODE_ENV;
environment.NODE_ENV = 'development';
loadEnvConfig(process.cwd(), true, console, true);
if (originalNodeEnv === undefined) delete environment.NODE_ENV;
else environment.NODE_ENV = originalNodeEnv;

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const applicationDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL_TEST is required to run Postgres integration tests.');
}
if (!applicationDatabaseUrl) {
  throw new Error('DATABASE_URL is required to verify test database isolation.');
}
if (databaseTarget(applicationDatabaseUrl) === databaseTarget(testDatabaseUrl)) {
  throw new Error('DATABASE_URL_TEST must point to a different database or Neon branch than DATABASE_URL.');
}

const fixedNow = new Date();
const fixedDay = dayKey(fixedNow);
const databaseTestTimeout = 30_000;

type Fixture = { userId: string; key: string };

async function createFixture(): Promise<Fixture> {
  const { getDb } = await import('./client');
  const schema = await import('./schema');
  const userId = randomUUID();
  const key = randomUUID();
  const db = getDb();

  await db.insert(schema.users).values({ id: userId });
  const [area] = await db
    .insert(schema.areas)
    .values({ userId, slug: randomUUID(), name: '', position: 0, look: {} })
    .returning({ id: schema.areas.id });
  await db.insert(schema.trackables).values({
    userId,
    key,
    version: 1,
    areaId: area.id,
    kind: 'check',
    label: key,
    config: {},
    schedule: { type: 'daily' },
    rule: null,
    weight: 1,
    scored: true,
    effectiveFrom: '2000-01-01',
  });

  return { userId, key };
}

async function withTestTransaction<T>(work: () => Promise<T>): Promise<T> {
  const { withDatabaseTransaction } = await import('./client');
  return withDatabaseTransaction(testDatabaseUrl!, work);
}

async function command(fixture: Fixture, type: 'log_entry' | 'seal_day', value?: unknown) {
  const { runCommand } = await import('./repository');
  return type === 'log_entry'
    ? runCommand(fixture.userId, { type, day: fixedDay, key: fixture.key, value }, fixedNow)
    : runCommand(fixture.userId, { type, day: fixedDay }, fixedNow);
}

async function expectRejectedSql(statement: SQL, pattern: RegExp) {
  const { getDb } = await import('./client');
  const failure = await getDb()
    .transaction((tx) => tx.execute(statement))
    .then(() => null, (error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  const error = failure as Error & { cause?: unknown };
  const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? '');
  expect(`${error.message}\n${cause}`).toMatch(pattern);
}

function databaseTarget(connectionString: string) {
  const url = new URL(connectionString);
  return `${url.hostname.replace('-pooler', '')}${url.pathname}`;
}

describe('Postgres repository integration', () => {
  beforeAll(async () => {
    const client = new Client({ connectionString: testDatabaseUrl!, connectionTimeoutMillis: 10_000 });
    try {
      await client.connect();
      const migration = await readFile(join(process.cwd(), 'lib', 'db', 'migrations', '0001_backend.sql'), 'utf8');
      await client.query(migration);
    } finally {
      await client.end();
    }
  });

  afterAll(async () => {
    const { closeDb } = await import('./client');
    await closeDb();
  });

  it('logs and seals a day with the domain score and both events', async () => withTestTransaction(async () => {
    const fixture = await createFixture();
    const logged = await command(fixture, 'log_entry', true);
    const sealed = await command(fixture, 'seal_day');
    const { getDb } = await import('./client');
    const db = getDb();
    const schema = await import('./schema');

    expect(logged.ok).toBe(true);
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;
    expect(sealed.events[0]).toMatchObject({ type: 'day_sealed', score: 100 });
    const dayRows = await db
      .select({ score: schema.days.score })
      .from(schema.days)
      .where(sql`${schema.days.userId} = ${fixture.userId} AND ${schema.days.day} = ${fixedDay}`);
    const eventRows = await db
      .select({ type: schema.events.type })
      .from(schema.events)
      .where(sql`${schema.events.userId} = ${fixture.userId} AND ${schema.events.day} = ${fixedDay}`)
      .orderBy(schema.events.seq);
    expect(dayRows).toEqual([{ score: 100 }]);
    expect(eventRows).toHaveLength(2);
    if (sealed.events[0]?.type !== 'day_sealed') return;
    const { nightScore } = await import('@/lib/domain/score');
    expect(dayRows[0].score).toBe(nightScore(sealed.events[0].results));
    expect(eventRows.map((row) => row.type)).toEqual(['entry_logged', 'day_sealed']);
  }), databaseTestTimeout);

  it('rejects any subsequent domain write to a sealed day', async () => withTestTransaction(async () => {
    const fixture = await createFixture();
    await command(fixture, 'log_entry', true);
    await command(fixture, 'seal_day');
    const repeatedLog = await command(fixture, 'log_entry', false);
    const repeatedSeal = await command(fixture, 'seal_day');
    const { getDb } = await import('./client');
    const counts = await getDb().execute(sql`
      SELECT
        (SELECT count(*) FROM events WHERE user_id = ${fixture.userId}) AS events,
        (SELECT count(*) FROM entries WHERE user_id = ${fixture.userId}) AS entries,
        (SELECT count(*) FROM days WHERE user_id = ${fixture.userId}) AS days
    `);

    expect(repeatedLog).toMatchObject({ ok: false, error: { code: 'day_sealed' } });
    expect(repeatedSeal).toMatchObject({ ok: false, error: { code: 'day_sealed' } });
    expect(counts.rows[0]).toEqual({ events: '2', entries: '1', days: '1' });
  }), databaseTestTimeout);

  it('rejects raw SQL mutations to sealed entries, days, and events', async () => withTestTransaction(async () => {
    const fixture = await createFixture();
    await command(fixture, 'log_entry', true);
    await command(fixture, 'seal_day');
    await expectRejectedSql(sql`
      INSERT INTO entries(user_id, day, trackable_key, trackable_version, value)
      VALUES (${fixture.userId}, ${fixedDay}, ${fixture.key}, 1, 'true'::jsonb)
    `, /day is sealed/);
    await expectRejectedSql(sql`
      UPDATE entries SET value = 'false'::jsonb
      WHERE user_id = ${fixture.userId} AND day = ${fixedDay} AND trackable_key = ${fixture.key}
    `, /day is sealed/);
    await expectRejectedSql(sql`
      DELETE FROM entries WHERE user_id = ${fixture.userId} AND day = ${fixedDay} AND trackable_key = ${fixture.key}
    `, /day is sealed/);
    await expectRejectedSql(sql`
      UPDATE days SET streak = streak + 1 WHERE user_id = ${fixture.userId} AND day = ${fixedDay}
    `, /sealed days are immutable/);
    await expectRejectedSql(sql`
      DELETE FROM days WHERE user_id = ${fixture.userId} AND day = ${fixedDay}
    `, /sealed days are immutable/);
    await expectRejectedSql(sql`
      UPDATE events SET at = now() WHERE user_id = ${fixture.userId} AND day = ${fixedDay}
    `, /events are append-only/);
    await expectRejectedSql(sql`
      DELETE FROM events WHERE user_id = ${fixture.userId} AND day = ${fixedDay}
    `, /events are append-only/);
    await expectRejectedSql(sql`
      INSERT INTO events(user_id, day, type, payload, at)
      VALUES (${fixture.userId}, ${fixedDay}, 'entry_logged', ${JSON.stringify({ type: 'entry_logged', day: fixedDay })}::jsonb, now())
    `, /day is sealed/);
  }), databaseTestTimeout);

  it('waits for an in-flight user write lock without persisting test data', async () => {
    const userId = randomUUID();
    const lockClient = new Client({ connectionString: testDatabaseUrl!, connectionTimeoutMillis: 10_000 });
    let transactionOpen = false;
    let commandPromise: Promise<unknown> | undefined;

    try {
      await lockClient.connect();
      await lockClient.query('BEGIN');
      transactionOpen = true;
      await lockClient.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);

      const [{ runCommand }, { getDbForConnection }] = await Promise.all([
        import('./repository'),
        import('./client'),
      ]);
      let commandFinished = false;
      commandPromise = runCommand(
        userId,
        { type: 'log_entry', day: fixedDay, key: randomUUID(), value: true },
        fixedNow,
        getDbForConnection(testDatabaseUrl!),
      ).then((result) => {
        commandFinished = true;
        return result;
      });

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(commandFinished).toBe(false);

      await lockClient.query('ROLLBACK');
      transactionOpen = false;
      await expect(commandPromise).resolves.toMatchObject({ ok: false, error: { code: 'unknown_trackable' } });
    } finally {
      if (transactionOpen) await lockClient.query('ROLLBACK').catch(() => undefined);
      await commandPromise?.catch(() => undefined);
      await lockClient.end();
    }
  }, databaseTestTimeout);

  it('rolls back a rejected command without writing an event or projection', async () => withTestTransaction(async () => {
    const fixture = await createFixture();
    const { runCommand } = await import('./repository');
    const rejected = await runCommand(
      fixture.userId,
      { type: 'log_entry', day: fixedDay, key: randomUUID(), value: true },
      fixedNow,
    );
    const { getDb } = await import('./client');
    const counts = await getDb().execute(sql`
      SELECT
        (SELECT count(*) FROM events WHERE user_id = ${fixture.userId}) AS events,
        (SELECT count(*) FROM entries WHERE user_id = ${fixture.userId}) AS entries
    `);

    expect(rejected).toMatchObject({ ok: false, error: { code: 'unknown_trackable' } });
    expect(counts.rows[0]).toEqual({ events: '0', entries: '0' });
  }), databaseTestTimeout);

  it('serves definitions, commands, sealing, and state through the API routes', async () => withTestTransaction(async () => {
    const fixture = await createFixture();
    const previousUserId = process.env.TENET_USER_ID;
    process.env.TENET_USER_ID = fixture.userId;
    try {
      const { GET: getDefinitions } = await import('../../app/api/definitions/route');
      const { POST: postCommand } = await import('../../app/api/commands/route');
      const { POST: postSeal } = await import('../../app/api/seal/route');
      const { GET: getState } = await import('../../app/api/state/route');
      const definitionsResponse = await getDefinitions();
      const definitions = await definitionsResponse.json();
      const trackable = definitions.trackables.find((item: { kind: string }) => item.kind === 'check');

      expect(definitionsResponse.status).toBe(200);
      expect(definitions.ok).toBe(true);
      expect(trackable).toBeDefined();
      if (!trackable) throw new Error('Test fixture definition is missing.');

      const commandResponse = await postCommand(
        new Request('http://localhost/api/commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'log_entry', day: fixedDay, key: trackable.key, value: true }),
        }),
      );
      const commandBody = await commandResponse.json();
      const stateResponse = await getState(
        new Request(`http://localhost/api/state?from=${fixedDay}&to=${fixedDay}`),
      );
      const stateBody = await stateResponse.json();
      const sealResponse = await postSeal(
        new Request('http://localhost/api/seal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day: fixedDay }),
        }),
      );
      const sealBody = await sealResponse.json();
      const sealedStateResponse = await getState(
        new Request(`http://localhost/api/state?from=${fixedDay}&to=${fixedDay}`),
      );
      const sealedState = await sealedStateResponse.json();

      expect(commandResponse.status).toBe(200);
      expect(commandBody.events[0].type).toBe('entry_logged');
      expect(stateBody.entries).toHaveLength(1);
      expect(sealResponse.status).toBe(200);
      expect(sealBody.events[0].type).toBe('day_sealed');
      expect(sealedStateResponse.status).toBe(200);
      expect(sealedState.days[0]).toMatchObject({ day: fixedDay });
      expect(sealedState.days[0].results).toHaveLength(1);
    } finally {
      if (previousUserId === undefined) delete process.env.TENET_USER_ID;
      else process.env.TENET_USER_ID = previousUserId;
    }
  }), databaseTestTimeout);
});
