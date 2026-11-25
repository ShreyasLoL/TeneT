import type { ApiArea } from '@/lib/api/types';

export type AreaLook = {
  archetype: 'mass' | 'precession' | 'comet';
  eccentricity: number;
  inclination: number;
  omega: number;
  shimmer: number;
  luminanceBias: number;
};

const ARCHETYPES: Record<number, AreaLook> = {
  // position % 3 === 0: heavy, slow, near-circular, low inclination (mass)
  0: {
    archetype: 'mass',
    eccentricity: 0.06,
    inclination: 0.1,
    omega: 0.22,
    shimmer: 0.18,
    luminanceBias: 1.05,
  },
  // position % 3 === 1: tight, mid-eccentric, mid inclination, high shimmer (precession)
  1: {
    archetype: 'precession',
    eccentricity: 0.22,
    inclination: 0.42,
    omega: 0.36,
    shimmer: 0.72,
    luminanceBias: 1.0,
  },
  // position % 3 === 2: loose, high-eccentricity, near-orthogonal inclination (comet)
  2: {
    archetype: 'comet',
    eccentricity: 0.48,
    inclination: 1.15,
    omega: 0.46,
    shimmer: 0.45,
    luminanceBias: 0.92,
  },
};

function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function inRange(val: unknown, min: number, max: number): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max;
}

function parseAreaLook(merged: Record<string, unknown>): AreaLook | null {
  const arch = merged.archetype;
  if (arch !== 'mass' && arch !== 'precession' && arch !== 'comet') return null;
  if (!inRange(merged.eccentricity, 0.01, 0.6)) return null;
  if (!inRange(merged.inclination, 0, 1.5)) return null;
  if (!inRange(merged.omega, 0.05, 1.5)) return null;
  if (!inRange(merged.shimmer, 0, 1)) return null;
  if (!inRange(merged.luminanceBias, 0.4, 1.6)) return null;
  return {
    archetype: arch,
    eccentricity: merged.eccentricity,
    inclination: merged.inclination,
    omega: merged.omega,
    shimmer: merged.shimmer,
    luminanceBias: merged.luminanceBias,
  };
}

/**
 * Derive an area's orbital look deterministically without hardcoding any area names:
 * uses `area.position % 3` for the three primary archetypes, slug hash for extras,
 * and merges any optional `area.look` JSONB overrides.
 */
export function resolveAreaLook(area?: Pick<ApiArea, 'slug' | 'position' | 'look'>): AreaLook {
  if (!area) {
    return ARCHETYPES[0];
  }

  const base =
    area.position >= 0 && area.position < 3
      ? ARCHETYPES[area.position]
      : ARCHETYPES[hashSlug(area.slug) % 3];

  const merged = { ...base, ...(area.look ?? {}) };
  return parseAreaLook(merged) ?? base;
}
