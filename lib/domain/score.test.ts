import { describe, expect, it } from 'vitest';
import { makeTrackable } from './fixtures';
import { activeTrackables, dueStatus } from './schedule';
import { evaluateDay, nightScore } from './score';
import type { SatisfiedOn } from './types';

const never: SatisfiedOn = () => false;

describe('activeTrackables', () => {
  it('picks the latest version effective on the day', () => {
    const all = [
      makeTrackable({ key: 'k', version: 1, effectiveFrom: '2026-01-01', weight: 1 }),
      makeTrackable({ key: 'k', version: 2, effectiveFrom: '2026-06-01', weight: 3 }),
    ];
    expect(activeTrackables(all, '2026-05-31')[0].weight).toBe(1);
    expect(activeTrackables(all, '2026-06-01')[0].weight).toBe(3);
  });

  it('drops trackables not yet effective or already archived', () => {
    const all = [
      makeTrackable({ key: 'future', effectiveFrom: '2026-12-01' }),
      makeTrackable({ key: 'gone', archivedFrom: '2026-11-01' }),
      makeTrackable({ key: 'live' }),
    ];
    expect(activeTrackables(all, '2026-11-24').map((t) => t.key)).toEqual(['live']);
  });
});

describe('dueStatus', () => {
  it('weekdays: required on listed days, off otherwise', () => {
    const t = makeTrackable({ key: 'k', schedule: { type: 'weekdays', days: [1, 3, 5] } });
    expect(dueStatus(t, '2026-11-23', never)).toBe('required'); // Mon
    expect(dueStatus(t, '2026-11-24', never)).toBe('off'); // Tue
  });

  it('n_per_week: optional while there is slack, required when forced', () => {
    const t = makeTrackable({ key: 'k', schedule: { type: 'n_per_week', n: 4 } });
    expect(dueStatus(t, '2026-11-23', never)).toBe('optional'); // Mon, 7 days left
    expect(dueStatus(t, '2026-11-25', never)).toBe('optional'); // Wed, needs 4, 5 left
    expect(dueStatus(t, '2026-11-26', never)).toBe('required'); // Thu, needs 4, 4 left
    expect(dueStatus(t, '2026-11-29', never)).toBe('required'); // Sun
  });

  it('n_per_week: earlier hits relax later days; met quota is optional', () => {
    const t = makeTrackable({ key: 'k', schedule: { type: 'n_per_week', n: 4 } });
    const hit = new Set(['2026-11-23', '2026-11-24', '2026-11-25']);
    const sat: SatisfiedOn = (_k, d) => hit.has(d);
    expect(dueStatus(t, '2026-11-26', sat)).toBe('optional'); // needs 1, 4 left
    expect(dueStatus(t, '2026-11-29', sat)).toBe('required'); // Sun, still needs 1
    hit.add('2026-11-27');
    expect(dueStatus(t, '2026-11-29', sat)).toBe('optional'); // quota met
  });
});

describe('nightScore', () => {
  const day = '2026-11-23'; // Monday
  const a = makeTrackable({ key: 'a', weight: 1 });
  const b = makeTrackable({ key: 'b', weight: 3 });

  it('is a weighted percentage of required trackables', () => {
    const results = evaluateDay(day, [a, b], { a: true, b: false }, never);
    expect(nightScore(results)).toBe(25);
    expect(nightScore(evaluateDay(day, [a, b], { a: true, b: true }, never))).toBe(100);
  });

  it('missing entries count as misses', () => {
    expect(nightScore(evaluateDay(day, [a, b], {}, never))).toBe(0);
  });

  it('excludes unscored trackables', () => {
    const c = makeTrackable({ key: 'c', scored: false });
    expect(nightScore(evaluateDay(day, [a, c], { a: true }, never))).toBe(100);
  });

  it('off days do not count', () => {
    const tue = makeTrackable({ key: 't', schedule: { type: 'weekdays', days: [2] } });
    expect(nightScore(evaluateDay(day, [a, tue], { a: true }, never))).toBe(100);
  });

  it('optional trackables are a bonus when done, free when skipped', () => {
    const opt = makeTrackable({ key: 'o', schedule: { type: 'n_per_week', n: 3 } });
    // Monday: optional. Skipped -> not counted.
    expect(nightScore(evaluateDay(day, [a, opt], { a: true }, never))).toBe(100);
    // Done and satisfied -> counted, still 100 here
    expect(nightScore(evaluateDay(day, [a, opt], { a: true, o: true }, never))).toBe(100);
    // Required miss + optional done lifts the score
    expect(nightScore(evaluateDay(day, [a, opt], { o: true }, never))).toBe(50);
  });

  it('returns null when nothing is due', () => {
    const tue = makeTrackable({ key: 't', schedule: { type: 'weekdays', days: [2] } });
    expect(nightScore(evaluateDay(day, [tue], {}, never))).toBeNull();
  });
});
