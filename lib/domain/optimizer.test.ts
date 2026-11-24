import { describe, expect, it } from 'vitest';
import { addDays } from './day';
import {
  cheapestPathToTarget,
  marginalValues,
  paretoFrontier,
  satisfyingValue,
  selfMatchDelta,
  streakRisk,
  weeklyPressure,
} from './optimizer';
import { effectiveRule, evaluate } from './rules';
import { evaluateDay, nightScore } from './score';
import type { DayKey, Kind, Rule, SatisfiedOn, Schedule, Trackable } from './types';

function makeTrackable(
  key: string,
  kind: Kind,
  overrides: Partial<Trackable> = {},
): Trackable {
  return {
    key,
    version: 1,
    kind,
    label: key,
    config: kind === 'choice' ? { options: ['alpha', 'beta'] } : {},
    schedule: { type: 'daily' },
    weight: 10,
    scored: true,
    effectiveFrom: '2026-01-01',
    ...overrides,
  };
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

describe('satisfyingValue', () => {
  it('produces valid values for every kind and rule operator', () => {
    const kinds: Kind[] = [
      'check',
      'count',
      'measure',
      'duration',
      'rating',
      'choice',
      'note',
      'log',
      'queue',
    ];
    for (const kind of kinds) {
      const t = makeTrackable(`k-${kind}`, kind);
      const val = satisfyingValue(effectiveRule(t), kind, t.config);
      expect(evaluate(effectiveRule(t), val)).toBe(true);
    }

    const explicitRules: Rule[] = [
      { op: 'eq', value: 'beta' },
      { op: 'gte', value: 45 },
      { op: 'lte', value: 2 },
      { op: 'between', min: 7, max: 9 },
      { op: 'present' },
    ];
    for (const rule of explicitRules) {
      const val = satisfyingValue(rule, 'measure', {});
      expect(evaluate(rule, val)).toBe(true);
    }
  });
});

describe('marginalValues, cheapestPathToTarget, paretoFrontier property checks', () => {
  it('matches brute-force nightScore evaluation across seeded histories', () => {
    const rand = lcg(42);
    const day: DayKey = '2026-06-18';
    const satisfiedNone: SatisfiedOn = () => false;

    for (let trial = 0; trial < 25; trial++) {
      const count = 4 + Math.floor(rand() * 4); // 4..7 items
      const active: Trackable[] = [];
      const effortMap: Record<string, number> = {};
      const entries: Record<string, unknown> = {};

      for (let i = 0; i < count; i++) {
        const weight = 1 + Math.floor(rand() * 20);
        const schedule: Schedule =
          i % 4 === 1
            ? { type: 'n_per_week', n: 3 }
            : i % 4 === 2
              ? { type: 'weekdays', days: [1, 3, 5, 7] }
              : { type: 'daily' };
        const scored = i % 5 !== 4;
        const key = `t-${i}`;
        active.push(makeTrackable(key, 'check', { weight, scored, schedule }));
        effortMap[key] = 1 + Math.floor(rand() * 5);
        if (rand() < 0.25) entries[key] = true;
      }

      const marginals = marginalValues(day, active, entries, satisfiedNone);
      const baseScore = nightScore(evaluateDay(day, active, entries, satisfiedNone));

      for (const m of marginals) {
        const t = active.find((x) => x.key === m.key)!;
        const sim = {
          ...entries,
          [m.key]: satisfyingValue(effectiveRule(t), t.kind, t.config),
        };
        const expectedNext = nightScore(evaluateDay(day, active, sim, satisfiedNone));
        expect(m.nextScore).toBe(expectedNext);
        const expectedDelta =
          expectedNext === null ? 0 : baseScore === null ? expectedNext : expectedNext - baseScore;
        expect(m.delta).toBe(expectedDelta);
      }

      // Brute-force cheapest subset reaching 70
      const remaining = active.filter((t) => {
        const r = evaluateDay(day, [t], entries, satisfiedNone)[0];
        return r.scored && r.status !== 'off' && !r.satisfied;
      });

      let bruteBestEffort = Infinity;
      let bruteBestScore = -1;
      for (let mask = 0; mask < 1 << remaining.length; mask++) {
        let effort = 0;
        const sim: Record<string, unknown> = { ...entries };
        for (let i = 0; i < remaining.length; i++) {
          if ((mask & (1 << i)) === 0) continue;
          effort += effortMap[remaining[i].key];
          sim[remaining[i].key] = true;
        }
        const s = nightScore(evaluateDay(day, active, sim, satisfiedNone));
        if (s !== null && s >= 70) {
          if (effort < bruteBestEffort || (effort === bruteBestEffort && s > bruteBestScore)) {
            bruteBestEffort = effort;
            bruteBestScore = s;
          }
        }
      }

      const plan = cheapestPathToTarget(day, active, entries, satisfiedNone, effortMap, 70);
      if (bruteBestEffort === Infinity) {
        expect(plan).toBeNull();
      } else {
        expect(plan).not.toBeNull();
        expect(plan!.effort).toBe(bruteBestEffort);
        expect(plan!.score).toBe(bruteBestScore);
      }

      const frontier = paretoFrontier(day, active, entries, satisfiedNone, effortMap);
      for (let i = 1; i < frontier.length; i++) {
        expect(frontier[i].effort).toBeGreaterThan(frontier[i - 1].effort);
        expect(frontier[i].score).toBeGreaterThan(frontier[i - 1].score);
      }
    }
  });

  it('handles unreachable targets and large sets cleanly', () => {
    const day: DayKey = '2026-06-18';
    const active = [
      makeTrackable('a', 'check', { weight: 10 }),
      makeTrackable('unscored', 'note', { weight: 100, scored: false }),
    ];
    const entries = { a: false };
    expect(cheapestPathToTarget(day, active, entries, () => false, { a: 2 }, 150)).toBeNull();
    expect(cheapestPathToTarget(day, active, { a: true }, () => false, { a: 2 }, 90)).toEqual({
      keys: [],
      effort: 0,
      score: 100,
      delta: 0,
    });
  });
});

describe('weeklyPressure, streakRisk, selfMatchDelta', () => {
  it('computes quota urgency, streak risk, and trailing 14-night comparison', () => {
    // 2026-06-20 is Saturday (ISO 6 => 2 days left: Sat, Sun)
    const sat: DayKey = '2026-06-20';
    const active = [
      makeTrackable('q-urgent', 'check', { schedule: { type: 'n_per_week', n: 3 } }),
      makeTrackable('q-slack', 'check', { schedule: { type: 'n_per_week', n: 2 } }),
      makeTrackable('daily-item', 'check', { schedule: { type: 'daily' } }),
    ];

    const satisfiedOn: SatisfiedOn = (key, d) => {
      if (key === 'q-urgent' && d === '2026-06-15') return true; // 1 done, 2 needed, 2 days left -> urgent
      if (key === 'q-slack' && d === '2026-06-15') return true; // 1 done, 1 needed, 2 days left -> slack 1
      return false;
    };

    const pressure = weeklyPressure(sat, active, satisfiedOn, { 'q-urgent': false, 'q-slack': false });
    expect(pressure).toHaveLength(2);
    expect(pressure[0]).toMatchObject({
      key: 'q-urgent',
      quota: 3,
      done: 1,
      needed: 2,
      daysLeft: 2,
      slack: 0,
      urgent: true,
    });
    expect(pressure[1]).toMatchObject({
      key: 'q-slack',
      quota: 2,
      done: 1,
      needed: 1,
      daysLeft: 2,
      slack: 1,
      urgent: false,
    });

    const sealed = ['2026-06-17', '2026-06-18', '2026-06-19'];
    const risk = streakRisk(sealed, sat);
    expect(risk.current).toBe(3);
    expect(risk.sealedToday).toBe(false);
    expect(risk.atRisk).toBe(true);
    expect(risk.ifSealedTonight).toBe(4);
    expect(risk.rate30IfSealed).toBeGreaterThan(risk.rate30Now);

    const history = Array.from({ length: 16 }, (_, idx) => ({
      day: addDays(sat, -(idx + 1)),
      score: idx < 14 ? 80 : 10, // trailing 14 should exclude older 10s
    }));
    const match = selfMatchDelta(92, history, sat);
    expect(match).toEqual({ trailingMean: 80, delta: 12, sampleSize: 14 });
  });
});
