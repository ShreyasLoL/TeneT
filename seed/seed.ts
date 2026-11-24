import { loadEnvConfig } from '@next/env';

async function main() {
  loadEnvConfig(process.cwd());

  const [{ getDb, closeDb }, { getUserId }, schema] = await Promise.all([
    import('../lib/db/client'),
    import('../lib/db/config'),
    import('../lib/db/schema'),
  ]);
  const db = getDb();
  const userId = getUserId();

  const seedAreas = [
    { slug: 'body', name: 'Body', position: 0 },
    { slug: 'mind', name: 'Mind', position: 1 },
    { slug: 'play', name: 'Play', position: 2 },
  ] as const;

  try {
    await db.insert(schema.users).values({ id: userId }).onConflictDoNothing();

    const areaIds = new Map<string, string>();
    for (const area of seedAreas) {
      const [saved] = await db
        .insert(schema.areas)
        .values({ userId, ...area, look: {} })
        .onConflictDoUpdate({
          target: [schema.areas.userId, schema.areas.slug],
          set: { name: area.name, position: area.position, look: {}, archivedAt: null },
        })
        .returning({ id: schema.areas.id, slug: schema.areas.slug });
      areaIds.set(saved.slug, saved.id);
    }

    const seedTrackables = [
      {
        area: 'body', key: 'gym', kind: 'check', schedule: { type: 'n_per_week', n: 4 }, rule: null,
        weight: 3, scored: true,
      },
      {
        area: 'body', key: 'creatine', kind: 'check', schedule: { type: 'daily' }, rule: null,
        weight: 1, scored: true,
      },
      {
        area: 'body', key: 'bodyweight', kind: 'measure', schedule: { type: 'daily' },
        config: { unit: 'kg' }, rule: { op: 'present' }, weight: 1, scored: false,
      },
      {
        area: 'mind', key: 'leetcode', kind: 'count', schedule: { type: 'daily' },
        rule: { op: 'gte', value: 1 }, weight: 2, scored: true,
      },
      {
        area: 'mind', key: 'study', kind: 'duration', schedule: { type: 'daily' },
        rule: { op: 'gte', value: 30 }, weight: 2, scored: true,
      },
      {
        area: 'play', key: 'gaming', kind: 'duration', schedule: { type: 'daily' },
        rule: { op: 'lte', value: 120 }, weight: 1, scored: true,
      },
    ] as const;

    for (const item of seedTrackables) {
      const areaId = areaIds.get(item.area);
      if (!areaId) throw new Error(`Missing seeded area: ${item.area}`);
      const row = {
        userId,
        areaId,
        key: item.key,
        version: 1,
        kind: item.kind,
        label: item.key[0].toUpperCase() + item.key.slice(1),
        config: 'config' in item ? item.config : {},
        schedule: item.schedule,
        rule: item.rule,
        weight: item.weight,
        scored: item.scored,
        effectiveFrom: '2026-11-24',
      };

      await db
        .insert(schema.trackables)
        .values(row)
        .onConflictDoUpdate({
          target: [schema.trackables.userId, schema.trackables.key, schema.trackables.version],
          set: {
            areaId: row.areaId,
            kind: row.kind,
            label: row.label,
            config: row.config,
            schedule: row.schedule,
            rule: row.rule,
            weight: row.weight,
            scored: row.scored,
            effectiveFrom: row.effectiveFrom,
            archivedFrom: null,
          },
        });
    }

    process.stdout.write('Seeded the single user and starter definitions.\n');
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Seed failed.'}\n`);
  process.exitCode = 1;
});
