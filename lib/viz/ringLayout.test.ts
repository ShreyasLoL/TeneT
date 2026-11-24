import { describe, expect, it } from 'vitest';
import type { ApiSealedDay } from '@/lib/api/types';
import { labelFor, ringLayout } from './ringLayout';

function makeSealed(day: string, score: number | null, streak = 1): ApiSealedDay {
  return {
    day,
    sealedAt: `${day}T17:30:00.000Z`,
    score,
    reflection: null,
    streak,
    results: [
      { key: 'a', version: 1, status: 'required', satisfied: true, weight: 2, scored: true },
      { key: 'b', version: 1, status: 'required', satisfied: false, weight: 1, scored: true },
      { key: 'c', version: 1, status: 'off', satisfied: false, weight: 1, scored: true },
    ],
  };
}

describe('ringLayout', () => {
  it('orders newest innermost with strictly increasing radius and fills unsealed past gaps as voids', () => {
    const days: ApiSealedDay[] = [
      makeSealed('2026-11-20', 80, 1),
      makeSealed('2026-11-21', 90, 2),
      // 2026-11-22 intentionally omitted -> void
      makeSealed('2026-11-23', null, 1),
      makeSealed('2026-11-24', 100, 2),
    ];

    const nodes = ringLayout(days, { from: '2026-11-20', to: '2026-11-24' });
    expect(nodes.map((n) => n.day)).toEqual([
      '2026-11-24',
      '2026-11-23',
      '2026-11-22',
      '2026-11-21',
      '2026-11-20',
    ]);

    for (let k = 1; k < nodes.length; k++) {
      expect(nodes[k].radius).toBeGreaterThan(nodes[k - 1].radius);
    }

    const voidNode = nodes.find((n) => n.day === '2026-11-22');
    expect(voidNode?.isVoid).toBe(true);
    expect(voidNode?.inStreak).toBe(false);
    expect(voidNode?.segments).toHaveLength(0);

    const streakNode = nodes.find((n) => n.day === '2026-11-24');
    expect(streakNode?.inStreak).toBe(true);
    expect(streakNode?.segments).toHaveLength(3);
    expect(streakNode?.segments[2].end).toBeCloseTo(Math.PI * 2, 5);
  });

  it('returns empty array when no sealed days exist', () => {
    expect(ringLayout([], { from: '2026-11-01', to: '2026-11-24' })).toEqual([]);
  });

  it('falls back to key in labelFor when a historical trackable is archived', () => {
    expect(
      labelFor('archived-key', {
        trackables: [{ key: 'active-key', label: 'Active Label' }],
      }),
    ).toBe('archived-key');
    expect(
      labelFor('active-key', {
        trackables: [{ key: 'active-key', label: 'Active Label' }],
      }),
    ).toBe('Active Label');
  });
});
