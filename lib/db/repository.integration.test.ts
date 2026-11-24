import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

async function command(fixture: Fixture, type: 'log_entry' | 'seal_day', value?: unknown) {
  const { runCommand } = await import('./repository');
  return type === 'log_entry'
    ? runCommand(fixture.userId, { type, day: fixedDay, key: fixture.key, value }, fixedNow)
    : runCommand(fixture.userId, { type, day: fixedDay }, fixedNow);
}

function databaseTarget(connectionString: string) {
  const url = new URL(connectionString);
  return `${url.hostname.replace('-pooler', '')}${url.pathname}`;
}

describe.skipIf(!testDatabaseUrl)('Postgres repository integration', () => {
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    const applicationUrl = process.env.DATABASE_URL;
    if (
      applicationUrl &&
      databaseTarget(applicationUrl) === databaseTarget(testDatabaseUrl as string)
    ) {
      throw new Error('DATABASE_URL_TEST must point to an isolated test database or Neon branch.');
    }
    process.env.DATABASE_URL = testDatabaseUrl;

    const client = new Client({ connectionString: testDatabaseUrl });
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

  it('logs and seals a day with the domain score and both events', async () => {
    const fixture = await createFixture();
    const logged = await command(fixture, 'log_entry', true);
    const sealed = await command(fixture, 'seal_day');
    const { getPool } = await import('./client');
    const pool = getPool();

    expect(logged.ok).toBe(true);
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;
    expect(sealed.events[0]).toMatchObject({ type: 'day_sealed', score: 100 });
    const [dayRows, eventRows] = await Promise.all([
      pool.query('SELECT score FROM days WHERE user_id = $1 AND day = $2', [fixture.userId, fixedDay]),
      pool.query('SELECT type FROM events WHERE user_id = $1 AND day = $2 ORDER BY seq', [fixture.userId, fixedDay]),
    ]);
    expect(dayRows.rows).toEqual([{ score: 100 }]);
    expect(eventRows.rowCount).toBe(2);
    if (sealed.events[0]?.type !== 'day_sealed') return;
    const { nightScore } = await import('@/lib/domain/score');
    expect(dayRows.rows[0].score).toBe(nightScore(sealed.events[0].results));
    expect(eventRows.rows.map((row) => row.type)).toEqual(['entry_logged', 'day_sealed']);
  }, databaseTestTimeout);

  it('rejects repeat writes through the domain and leaves stored rows unchanged', async () => {
    const fixture = await createFixture();
    await command(fixture, 'log_entry', true);
    await command(fixture, 'seal_day');
    const repeatedLog = await command(fixture, 'log_entry', false);
    const repeatedSeal = await command(fixture, 'seal_day');
    const { getPool } = await import('./client');
    const counts = await getPool().query(
      'SELECT (SELECT count(*) FROM events WHERE user_id = $1) AS events, (SELECT count(*) FROM entries WHERE user_id = $1) AS entries, (SELECT count(*) FROM days WHERE user_id = $1) AS days',
      [fixture.userId],
    );

    expect(repeatedLog).toMatchObject({ ok: false, error: { code: 'day_sealed' } });
    expect(repeatedSeal).toMatchObject({ ok: false, error: { code: 'day_sealed' } });
    expect(counts.rows[0]).toEqual({ events: '2', entries: '1', days: '1' });
  }, databaseTestTimeout);

  it('rejects raw SQL mutations to sealed entries, days, and events', async () => {
    const fixture = await createFixture();
    await command(fixture, 'log_entry', true);
    await command(fixture, 'seal_day');
    const { getPool } = await import('./client');
    const pool = getPool();
    const args = [fixture.userId, fixedDay, fixture.key];
    const dayArgs = args.slice(0, 2);

    await expect(
      pool.query('INSERT INTO entries(user_id, day, trackable_key, trackable_version, value) VALUES ($1, $2, $3, 1, $4::jsonb)', [
        ...args,
        'true',
      ]),
    ).rejects.toThrow(/day is sealed/);
    await expect(
      pool.query('UPDATE entries SET value = $4::jsonb WHERE user_id = $1 AND day = $2 AND trackable_key = $3', [
        ...args,
        'false',
      ]),
    ).rejects.toThrow(/day is sealed/);
    await expect(pool.query('DELETE FROM entries WHERE user_id = $1 AND day = $2 AND trackable_key = $3', args)).rejects.toThrow(
      /day is sealed/,
    );
    await expect(pool.query('UPDATE days SET streak = streak + 1 WHERE user_id = $1 AND day = $2', dayArgs)).rejects.toThrow(
      /sealed days are immutable/,
    );
    await expect(pool.query('DELETE FROM days WHERE user_id = $1 AND day = $2', dayArgs)).rejects.toThrow(
      /sealed days are immutable/,
    );
    await expect(pool.query('UPDATE events SET at = now() WHERE user_id = $1 AND day = $2', dayArgs)).rejects.toThrow(
      /events are append-only/,
    );
    await expect(pool.query('DELETE FROM events WHERE user_id = $1 AND day = $2', dayArgs)).rejects.toThrow(
      /events are append-only/,
    );
    await expect(
      pool.query(
        'INSERT INTO events(user_id, day, type, payload, at) VALUES ($1, $2, $3, $4::jsonb, now())',
        [fixture.userId, fixedDay, 'entry_logged', JSON.stringify({ type: 'entry_logged', day: fixedDay })],
      ),
    ).rejects.toThrow(/day is sealed/);
  }, databaseTestTimeout);

  it('serializes concurrent seal commands so only one succeeds', async () => {
    const fixture = await createFixture();
    const [first, second] = await Promise.all([command(fixture, 'seal_day'), command(fixture, 'seal_day')]);
    const { getPool } = await import('./client');
    const dayRows = await getPool().query('SELECT day FROM days WHERE user_id = $1 AND day = $2', [fixture.userId, fixedDay]);

    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].filter((result) => !result.ok)).toHaveLength(1);
    expect(dayRows.rowCount).toBe(1);
  }, databaseTestTimeout);

  it('rolls back a rejected command without writing an event or projection', async () => {
    const fixture = await createFixture();
    const { runCommand } = await import('./repository');
    const rejected = await runCommand(
      fixture.userId,
      { type: 'log_entry', day: fixedDay, key: randomUUID(), value: true },
      fixedNow,
    );
    const { getPool } = await import('./client');
    const counts = await getPool().query(
      'SELECT (SELECT count(*) FROM events WHERE user_id = $1) AS events, (SELECT count(*) FROM entries WHERE user_id = $1) AS entries',
      [fixture.userId],
    );

    expect(rejected).toMatchObject({ ok: false, error: { code: 'unknown_trackable' } });
    expect(counts.rows[0]).toEqual({ events: '0', entries: '0' });
  }, databaseTestTimeout);

  it('serves definitions, commands, sealing, and state through the API routes', async () => {
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
  }, databaseTestTimeout);
});
