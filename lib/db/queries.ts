import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { activeTrackables, dayKey } from '@/lib/domain';
import type { DayKey } from '@/lib/domain/types';
import { getDb } from './client';
import { getUserId } from './config';
import { areas, days, entries, goals, trackables } from './schema';
import { toTrackable } from './trackables';

export async function getDefinitions(userId = getUserId(), now = new Date()) {
  const db = getDb();
  const [areaRows, goalRows, trackableRows] = await Promise.all([
    db
      .select({
        id: areas.id,
        slug: areas.slug,
        name: areas.name,
        look: areas.look,
        position: areas.position,
        archivedAt: areas.archivedAt,
      })
      .from(areas)
      .where(eq(areas.userId, userId))
      .orderBy(asc(areas.position)),
    db
      .select({
        id: goals.id,
        areaId: goals.areaId,
        kind: goals.kind,
        title: goals.title,
        config: goals.config,
        deadline: goals.deadline,
        createdAt: goals.createdAt,
      })
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(asc(goals.createdAt)),
    db.select().from(trackables).where(eq(trackables.userId, userId)),
  ]);

  const currentDay = dayKey(now);
  return {
    areas: areaRows,
    goals: goalRows,
    trackables: activeTrackables(trackableRows.map(toTrackable), currentDay),
  };
}

export async function getStateRange(
  from: DayKey,
  to: DayKey,
  userId = getUserId(),
  now = new Date(),
) {
  const db = getDb();
  const [definitions, entryRows, sealedRows] = await Promise.all([
    getDefinitions(userId, now),
    db
      .select({
        day: entries.day,
        key: entries.trackableKey,
        version: entries.trackableVersion,
        value: entries.value,
      })
      .from(entries)
      .where(and(eq(entries.userId, userId), gte(entries.day, from), lte(entries.day, to)))
      .orderBy(asc(entries.day), asc(entries.trackableKey)),
    db
      .select({
        day: days.day,
        sealedAt: days.sealedAt,
        score: days.score,
        results: days.results,
        reflection: days.reflection,
        streak: days.streak,
      })
      .from(days)
      .where(and(eq(days.userId, userId), gte(days.day, from), lte(days.day, to)))
      .orderBy(asc(days.day)),
  ]);

  return {
    definitions,
    entries: entryRows,
    days: sealedRows,
  };
}
