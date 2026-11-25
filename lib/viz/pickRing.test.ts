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

  it('rejects out-of-bounds radii and resolves negative atan2 angles across segments', () => {
    const days = [
      {
        day: '2026-11-01',
        sealedAt: '2026-11-01T18:00:00.000Z',
        score: 90,
        reflection: null,
        streak: 1,
        results: [
          { key: 's0', version: 1, status: 'required' as const, satisfied: true, weight: 1, scored: true },
          { key: 's1', version: 1, status: 'required' as const, satisfied: false, weight: 1, scored: true },
          { key: 's2', version: 1, status: 'off' as const, satisfied: false, weight: 2, scored: true },
        ],
      },
    ];
    const layout = ringLayout(days, { from: '2026-11-01', to: '2026-11-01' });
    expect(pickRingPolar(0.2, 0, layout)).toBeNull();
    expect(pickRingPolar(25.0, 0, layout)).toBeNull();

    // Negative angle (-pi/4 -> 7pi/4) lands in the third segment ('s2')
    const hitNeg = pickRingPolar(layout[0].radius, -Math.PI / 4, layout);
    expect(hitNeg?.ring.day).toBe('2026-11-01');
    expect(hitNeg?.segment?.key).toBe('s2');
  });
});
