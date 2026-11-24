import {
  DEFAULT_CUTOFF_HOUR,
  DEFAULT_TZ,
  dayKey,
  diffDays,
  isDayKey,
} from './day';
import type { Command, DecideContext, DomainError, DomainEvent, Result, State } from './events';
import { valueSchema } from './primitives';
import { evaluateDay, nightScore } from './score';
import { activeTrackables } from './schedule';
import { currentStreak } from './stats';
import type { DayKey } from './types';

const fail = (code: DomainError['code'], message: string): Result<never> => ({
  ok: false,
  error: { code, message },
});

/** Is `day` open for writes right now? Returns an error result if not. */
function checkOpen(state: State, day: DayKey, ctx: DecideContext): Result<never> | null {
  if (!isDayKey(day)) return fail('invalid_day', `"${day}" is not a valid YYYY-MM-DD day`);
  const today = dayKey(ctx.now, ctx.tz ?? DEFAULT_TZ, ctx.cutoffHour ?? DEFAULT_CUTOFF_HOUR);
  const age = diffDays(today, day);
  if (age < 0) return fail('future_day', `${day} is in the future`);
  if (age > (ctx.backfillDays ?? 0)) return fail('day_not_open', `${day} is no longer open`);
  if (state.sealed[day]) return fail('day_sealed', `${day} is sealed and final`);
  return null;
}

/**
 * Validate a command against current state and produce events (never mutates).
 * All business rules live here so every caller (API, tests, future CLI) agrees.
 */
export function decide(state: State, command: Command, ctx: DecideContext): Result<DomainEvent[]> {
  const blocked = checkOpen(state, command.day, ctx);
  if (blocked) return blocked;

  const at = ctx.now.toISOString();
  const active = activeTrackables(ctx.trackables, command.day);

  if (command.type === 'log_entry') {
    const t = active.find((x) => x.key === command.key);
    if (!t) return fail('unknown_trackable', `"${command.key}" is not active on ${command.day}`);
    const parsed = valueSchema(t).safeParse(command.value);
    if (!parsed.success) {
      return fail('invalid_value', parsed.error.issues.map((i) => i.message).join('; '));
    }
    return {
      ok: true,
      value: [
        {
          type: 'entry_logged',
          at,
          day: command.day,
          key: t.key,
          version: t.version,
          value: parsed.data,
        },
      ],
    };
  }

  // seal_day
  const reflection = command.reflection?.trim();
  if (reflection !== undefined && reflection.length > 500) {
    return fail('invalid_reflection', 'reflection is limited to 500 characters');
  }
  const entries = Object.fromEntries(
    Object.entries(state.entries[command.day] ?? {}).map(([k, r]) => [k, r.value]),
  );
  const satisfiedOn = (key: string, d: DayKey) =>
    state.sealed[d]?.results.find((r) => r.key === key)?.satisfied ?? false;
  const results = evaluateDay(command.day, active, entries, satisfiedOn);
  const streak = currentStreak([...Object.keys(state.sealed), command.day], command.day);

  return {
    ok: true,
    value: [
      {
        type: 'day_sealed',
        at,
        day: command.day,
        score: nightScore(results),
        results,
        reflection: reflection || undefined,
        streak,
      },
    ],
  };
}
