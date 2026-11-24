import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '@/lib/domain/day';
import {
  fixtureExecuteCommand,
  fixtureGetDefinitions,
  fixtureGetState,
  generateFixtureState,
  resetFixtureStore,
} from './fixtures';
import { definitionsResponseSchema, stateResponseSchema } from './schemas';

describe('dev fixtures', () => {
  beforeEach(() => {
    resetFixtureStore('2026-11-25');
  });

  it('generates schema-valid definitions and 120 days with voids, streaks, and archived trackables', () => {
    const today = '2026-11-25';
    const data = generateFixtureState({ days: 120, seed: 42, today });
    expect(data.days.length).toBeGreaterThan(100);
    expect(data.days.length).toBeLessThan(120);
    expect(data.days.some((d) => d.score === null)).toBe(true);
    expect(data.days.some((d) => d.results.some((r) => r.key === 'legacy-check'))).toBe(true);

    const defs = fixtureGetDefinitions(new Date(`${today}T20:00:00+05:30`));
    expect(definitionsResponseSchema.safeParse(defs).success).toBe(true);
    expect(defs.trackables.some((t) => t.key === 'legacy-check')).toBe(false);

    const state = fixtureGetState(addDays(today, -399), today, new Date(`${today}T20:00:00+05:30`));
    expect(stateResponseSchema.safeParse(state).success).toBe(true);
  });

  it('executes log_entry and seal_day with real domain 422 enforcement', () => {
    const now = new Date('2026-11-25T20:00:00+05:30');
    const logRes = fixtureExecuteCommand(
      { type: 'log_entry', day: '2026-11-25', key: 'protocol', value: true },
      now,
    );
    expect(logRes.status).toBe(200);

    const badVal = fixtureExecuteCommand(
      { type: 'log_entry', day: '2026-11-25', key: 'clarity', value: 9 },
      now,
    );
    expect(badVal.status).toBe(422);
    if (badVal.status === 422) expect(badVal.body.error.code).toBe('invalid_value');

    const sealRes = fixtureExecuteCommand(
      { type: 'seal_day', day: '2026-11-25', reflection: 'quiet seal.' },
      now,
    );
    expect(sealRes.status).toBe(200);

    const afterSeal = fixtureExecuteCommand(
      { type: 'log_entry', day: '2026-11-25', key: 'protocol', value: false },
      now,
    );
    expect(afterSeal.status).toBe(422);
    if (afterSeal.status === 422) expect(afterSeal.body.error.code).toBe('day_sealed');
  });
});
