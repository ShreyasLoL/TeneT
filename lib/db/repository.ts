import { and, eq, sql } from 'drizzle-orm';
import { apply, decide, emptyState, isDayKey } from '@/lib/domain';
import type { Command, DomainError, DomainEvent, State } from '@/lib/domain/events';
import { getDb } from './client';
import { getUserId } from './config';
import { days, entries, events, trackables } from './schema';
import { toTrackable } from './trackables';

export type RunCommandResult =
  | { ok: true; events: DomainEvent[] }
  | { ok: false; error: DomainError };

class RejectedCommand extends Error {
  constructor(readonly domainError: DomainError) {
    super(domainError.message);
  }
}

export async function runCommand(
  userId: string,
  command: Command,
  now = new Date(),
): Promise<RunCommandResult> {
  const db = getDb();

  try {
    const emitted = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

      const [trackableRows, sealedRows] = await Promise.all([
        tx.select().from(trackables).where(eq(trackables.userId, userId)),
        tx.select().from(days).where(eq(days.userId, userId)),
      ]);
      const entryRows = isDayKey(command.day)
        ? await tx
            .select()
            .from(entries)
            .where(and(eq(entries.userId, userId), eq(entries.day, command.day)))
        : [];

      const state: State = {
        entries: {
          ...emptyState.entries,
          [command.day]: Object.fromEntries(
            entryRows.map((row) => [row.trackableKey, { value: row.value, version: row.trackableVersion }]),
          ),
        },
        sealed: Object.fromEntries(
          sealedRows.map((row) => [
            row.day,
            {
              day: row.day,
              sealedAt: row.sealedAt.toISOString(),
              score: row.score,
              results: row.results,
              reflection: row.reflection ?? undefined,
              streak: row.streak,
            },
          ]),
        ),
      };

      const decision = decide(state, command, {
        trackables: trackableRows.map(toTrackable),
        now,
      });
      if (!decision.ok) throw new RejectedCommand(decision.error);

      let nextState = state;
      for (const event of decision.value) {
        await tx.insert(events).values({
          userId,
          day: event.day,
          type: event.type,
          payload: event,
          at: new Date(event.at),
        });

        if (event.type === 'entry_logged') {
          await tx
            .insert(entries)
            .values({
              userId,
              day: event.day,
              trackableKey: event.key,
              trackableVersion: event.version,
              value: event.value,
            })
            .onConflictDoUpdate({
              target: [entries.userId, entries.day, entries.trackableKey],
              set: { trackableVersion: event.version, value: event.value },
            });
        } else {
          await tx.insert(days).values({
            userId,
            day: event.day,
            sealedAt: new Date(event.at),
            score: event.score,
            results: event.results,
            reflection: event.reflection ?? null,
            streak: event.streak,
          });
        }

        nextState = apply(nextState, event);
      }

      return decision.value;
    });

    return { ok: true, events: emitted };
  } catch (error) {
    if (error instanceof RejectedCommand) {
      return { ok: false, error: error.domainError };
    }
    throw error;
  }
}

export function runCurrentUserCommand(command: Command, now = new Date()) {
  return runCommand(getUserId(), command, now);
}
