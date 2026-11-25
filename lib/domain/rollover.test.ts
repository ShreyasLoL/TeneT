import { describe, expect, it, vi } from 'vitest';
import { dayKey } from './day';
import { didRollOver, msUntilNextLogicalDay } from './rollover';

describe('logical day rollover', () => {
  it('detects rollover across 04:00 IST cutoff', () => {
    const before = new Date('2026-11-25T03:59:30+05:30');
    const after = new Date('2026-11-25T04:00:05+05:30');

    const prev = dayKey(before);
    expect(prev).toBe('2026-11-24');
    expect(didRollOver(prev, before)).toEqual({ rolled: false, nextDay: '2026-11-24' });
    expect(didRollOver(prev, after)).toEqual({ rolled: true, nextDay: '2026-11-25' });
  });

  it('computes milliseconds until next logical day boundary within 1s accuracy', () => {
    const now = new Date('2026-11-25T03:55:00+05:30');
    const ms = msUntilNextLogicalDay(now);
    expect(ms).toBeGreaterThanOrEqual(299_000);
    expect(ms).toBeLessThanOrEqual(301_000);
    expect(dayKey(new Date(now.getTime() + ms))).toBe('2026-11-25');
  });

  it('transitions cleanly across 04:00 IST with fake timers without drift', () => {
    vi.useFakeTimers();
    try {
      const start = new Date('2026-11-25T03:59:50+05:30');
      vi.setSystemTime(start);

      let activeDay = dayKey(new Date());
      const observedRollovers: string[] = [];

      const waitMs = msUntilNextLogicalDay(new Date());
      const timer = setTimeout(() => {
        const check = didRollOver(activeDay, new Date());
        if (check.rolled) {
          activeDay = check.nextDay;
          observedRollovers.push(activeDay);
        }
      }, waitMs);

      // At 03:59:59 IST -> still 2026-11-24
      vi.advanceTimersByTime(9_000);
      expect(activeDay).toBe('2026-11-24');
      expect(observedRollovers).toHaveLength(0);

      // Cross 04:00:00 IST -> rolls over to 2026-11-25 cleanly
      vi.advanceTimersByTime(2_000);
      expect(activeDay).toBe('2026-11-25');
      expect(observedRollovers).toEqual(['2026-11-25']);
      clearTimeout(timer);
    } finally {
      vi.useRealTimers();
    }
  });
});
