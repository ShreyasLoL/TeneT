import { describe, expect, it } from 'vitest';
import { buildCohortMap, MAX_COHORT_SLOTS, OVERFLOW_COHORT_SLOT } from './cohorts';

describe('buildCohortMap', () => {
  it('sorts by area position then key and assigns shares proportional to weight', () => {
    const areas = [
      { id: '1', slug: 'a0', name: 'A0', look: {}, position: 0, archivedAt: null },
      { id: '2', slug: 'a1', name: 'A1', look: {}, position: 1, archivedAt: null },
    ];
    const trackables = [
      { key: 'z', areaSlug: 'a1', weight: 1 },
      { key: 'b', areaSlug: 'a0', weight: 3 },
      { key: 'a', areaSlug: 'a0', weight: 1 },
    ];

    const map = buildCohortMap(areas, trackables);
    expect(map.slots.map((s) => s.key)).toEqual(['a', 'b', 'z']);
    expect(map.slots[1].share).toBeCloseTo(0.6, 5);
  });

  it('routes overflow trackables beyond 15 into slot 15', () => {
    const areas = [{ id: '1', slug: 'a0', name: 'A0', look: {}, position: 0, archivedAt: null }];
    const trackables = Array.from({ length: 20 }, (_, i) => ({
      key: `k-${String(i).padStart(2, '0')}`,
      areaSlug: 'a0',
      weight: 1,
    }));

    const map = buildCohortMap(areas, trackables);
    expect(map.slots).toHaveLength(MAX_COHORT_SLOTS);
    expect(map.slotOfKey.get('k-18')).toBe(OVERFLOW_COHORT_SLOT);
  });
});
