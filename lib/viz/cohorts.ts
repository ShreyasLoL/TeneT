import type { ApiArea, ApiTrackable } from '@/lib/api/types';
import type { TrackableResult } from '@/lib/domain/score';

export const MAX_COHORT_SLOTS = 16;
export const OVERFLOW_COHORT_SLOT = 15;

export type CohortSlot = {
  slotIndex: number;
  key: string;
  areaIndex: number;
  weight: number;
  share: number;
};

export type CohortMap = {
  slots: CohortSlot[];
  slotOfKey: Map<string, number>;
};

/**
 * Stable 16-slot cohort assignment from the union of loaded trackable keys,
 * sorted by `(area.position, key)` so particle assignments stay deterministic.
 */
export function buildCohortMap(
  areas: ReadonlyArray<ApiArea>,
  trackables: ReadonlyArray<Pick<ApiTrackable, 'key' | 'areaSlug' | 'weight'>>,
  historicalResults: ReadonlyArray<ReadonlyArray<Pick<TrackableResult, 'key' | 'weight'>>> = [],
): CohortMap {
  const areaPos = new Map(areas.map((a, idx) => [a.slug, { pos: a.position, idx }]));
  const meta = new Map<string, { areaPos: number; areaIndex: number; weight: number }>();

  for (const t of trackables) {
    const areaInfo = areaPos.get(t.areaSlug);
    meta.set(t.key, {
      areaPos: areaInfo?.pos ?? 999,
      areaIndex: areaInfo?.idx ?? 0,
      weight: Math.max(0.25, t.weight),
    });
  }

  for (const list of historicalResults) {
    for (const r of list) {
      if (!meta.has(r.key)) {
        meta.set(r.key, {
          areaPos: 999,
          areaIndex: 0,
          weight: Math.max(0.25, r.weight),
        });
      }
    }
  }

  const ordered = [...meta.entries()].sort((a, b) => {
    if (a[1].areaPos !== b[1].areaPos) return a[1].areaPos - b[1].areaPos;
    return a[0].localeCompare(b[0]);
  });

  const slotOfKey = new Map<string, number>();
  const slots: CohortSlot[] = [];

  const capped = ordered.slice(0, OVERFLOW_COHORT_SLOT);
  const overflow = ordered.slice(OVERFLOW_COHORT_SLOT);

  for (let i = 0; i < capped.length; i++) {
    const [key, info] = capped[i];
    slotOfKey.set(key, i);
    slots.push({
      slotIndex: i,
      key,
      areaIndex: info.areaIndex,
      weight: info.weight,
      share: 0,
    });
  }

  if (overflow.length > 0) {
    let overflowWeight = 0;
    for (const [key, info] of overflow) {
      slotOfKey.set(key, OVERFLOW_COHORT_SLOT);
      overflowWeight += info.weight;
    }
    slots.push({
      slotIndex: OVERFLOW_COHORT_SLOT,
      key: '__other__',
      areaIndex: overflow[0][1].areaIndex,
      weight: overflowWeight,
      share: 0,
    });
  }

  const totalWeight = slots.reduce((sum, s) => sum + s.weight, 0) || 1;
  for (const slot of slots) {
    slot.share = slot.weight / totalWeight;
  }

  return { slots, slotOfKey };
}
