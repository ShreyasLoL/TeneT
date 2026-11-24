import { describe, expect, it } from 'vitest';
import { addDays, dayKey, diffDays, isDayKey, isoWeekday, weekStart } from './day';

describe('day helpers', () => {
  it('validates day keys', () => {
    expect(isDayKey('2026-11-24')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-1-4')).toBe(false);
    expect(isDayKey('nope')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-11-24', '2026-11-20')).toBe(4);
  });

  it('computes ISO weekday and week start', () => {
    expect(isoWeekday('2026-11-23')).toBe(1); // Monday
    expect(isoWeekday('2026-11-29')).toBe(7); // Sunday
    expect(weekStart('2026-11-26')).toBe('2026-11-23');
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
  });

  it('maps instants to the logical day with a 04:00 cutoff in IST', () => {
    // 03:00 IST on Nov 25 still belongs to Nov 24
    expect(dayKey(new Date('2026-11-24T21:30:00Z'))).toBe('2026-11-24');
    // 04:00 IST on Nov 25 starts Nov 25
    expect(dayKey(new Date('2026-11-24T22:30:00Z'))).toBe('2026-11-25');
    // 23:30 IST on Nov 24
    expect(dayKey(new Date('2026-11-24T18:00:00Z'))).toBe('2026-11-24');
  });

  it('respects a custom timezone and cutoff', () => {
    expect(dayKey(new Date('2026-11-24T05:00:00Z'), 'UTC', 0)).toBe('2026-11-24');
    expect(dayKey(new Date('2026-11-24T05:00:00Z'), 'UTC', 6)).toBe('2026-11-23');
  });
});
