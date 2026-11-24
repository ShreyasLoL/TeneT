import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/domain/day';
import { inverseRingIndex, pickRingPolar } from './pickRing';
import { ringLayout, ringRadiusAt } from './ringLayout';

describe('pickRing', () => {
  it('round-trips ringRadiusAt -> inverseRingIndex for all i in 0..399', () => {
    for (let i = 0; i < 400; i++) {
      const r = ringRadiusAt(i);
      const back = inverseRingIndex(r);
      expect(back).not.toBeNull();
      expect(Math.round(back!)).toBe(i);
    }
  });

  it('picks the matching ring and segment by polar coordinates', () => {
    const days = Array.from({ length: 10 }, (_, idx) => {
      const day = addDays('2026-11-01', idx);
      return {
        day,
        sealedAt: `${day}T18:00:00.000Z`,
        score: 85,
        reflection: null,
        streak: idx + 1,
        results: [
          { key: 'first', version: 1, status: 'required' as const, satisfied: true, weight: 1, scored: true },
          { key: 'second', version: 1, status: 'required' as const, satisfied: true, weight: 1, scored: true },
        ],
      };
    });
    const layout = ringLayout(days, { from: '2026-11-01', to: '2026-11-10' });
    const target = layout[3];
    const picked = pickRingPolar(target.radius, Math.PI * 1.5, layout);

    expect(picked?.ring.day).toBe(target.day);
    expect(picked?.segment?.key).toBe('second');
  });
});
