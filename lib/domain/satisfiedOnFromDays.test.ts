import { describe, expect, it } from 'vitest';
import { decide } from './commands';
import { addDays } from './day';
import type { DecideContext, State } from './events';
import { makeTrackable } from './fixtures';
import { apply, emptyState } from './reducer';
import { satisfiedOnFromDays } from './satisfiedOnFromDays';
import { activeTrackables } from './schedule';
import { evaluateDay, nightScore } from './score';
import type { DayKey, Trackable } from './types';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('satisfiedOnFromDays', () => {
  it('produces identical evaluateDay and nightScore results to server seal decide() across randomized histories', () => {
    const rng = mulberry32(1337);
    const startDay: DayKey = '2026-10-05';

    const trackables: Trackable[] = [
      makeTrackable({ key: 't-daily', kind: 'check', schedule: { type: 'daily' }, weight: 2 }),
      makeTrackable({ key: 't-quota', kind: 'check', schedule: { type: 'n_per_week', n: 4 }, weight: 3 }),
      makeTrackable({ key: 't-weekdays', kind: 'check', schedule: { type: 'weekdays', days: [1, 3, 5] }, weight: 2 }),
      makeTrackable({ key: 't-cap', kind: 'duration', schedule: { type: 'daily' }, rule: { op: 'lte', value: 120 }, weight: 1 }),
      makeTrackable({ key: 't-unscored', kind: 'measure', schedule: { type: 'daily' }, rule: { op: 'present' }, weight: 1, scored: false }),
    ];

    let state: State = emptyState;

    for (let i = 0; i < 30; i++) {
      const day = addDays(startDay, i);
      const now = new Date(`${day}T21:30:00+05:30`);
      const ctx: DecideContext = { trackables, now };

      const entriesForDay: Record<string, unknown> = {};
      if (rng() > 0.15) entriesForDay['t-daily'] = rng() > 0.25;
      if (rng() > 0.35) entriesForDay['t-quota'] = rng() > 0.2;
      if (rng() > 0.25) entriesForDay['t-weekdays'] = true;
      if (rng() > 0.3) entriesForDay['t-cap'] = rng() > 0.4 ? 60 : 180;
      if (rng() > 0.4) entriesForDay['t-unscored'] = 72.5;

      for (const [key, value] of Object.entries(entriesForDay)) {
        const res = decide(state, { type: 'log_entry', day, key, value }, ctx);
        expect(res.ok).toBe(true);
        if (res.ok) {
          for (const ev of res.value) state = apply(state, ev);
        }
      }

      const previewActive = activeTrackables(trackables, day);
      const previewSat = satisfiedOnFromDays(Object.values(state.sealed));
      const previewResults = evaluateDay(day, previewActive, entriesForDay, previewSat);
      const previewScore = nightScore(previewResults);

      const sealRes = decide(state, { type: 'seal_day', day }, ctx);
      expect(sealRes.ok).toBe(true);
      if (sealRes.ok) {
        const sealedEvent = sealRes.value[0];
        expect(sealedEvent.type).toBe('day_sealed');
        if (sealedEvent.type === 'day_sealed') {
          expect(previewResults).toEqual(sealedEvent.results);
          expect(previewScore).toBe(sealedEvent.score);
        }
        if (rng() > 0.12) {
          for (const ev of sealRes.value) state = apply(state, ev);
        }
      }
    }
  });

  it('returns false for unknown days or keys', () => {
    const sat = satisfiedOnFromDays([
      { day: '2026-11-20', results: [{ key: 'a', satisfied: true }] },
    ]);
    expect(sat('a', '2026-11-20')).toBe(true);
    expect(sat('b', '2026-11-20')).toBe(false);
    expect(sat('a', '2026-11-19')).toBe(false);
  });
});
