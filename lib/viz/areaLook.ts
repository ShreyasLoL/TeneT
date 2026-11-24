import { z } from 'zod';
import type { ApiArea } from '@/lib/api/types';

export const areaLookSchema = z.object({
  archetype: z.enum(['mass', 'precession', 'comet']).default('mass'),
  eccentricity: z.number().min(0.01).max(0.6).default(0.08),
  inclination: z.number().min(0).max(1.5).default(0.12),
  omega: z.number().min(0.05).max(1.5).default(0.24),
  shimmer: z.number().min(0).max(1).default(0.25),
  luminanceBias: z.number().min(0.4).max(1.6).default(1.0),
});

export type AreaLook = z.infer<typeof areaLookSchema>;

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
  const parsed = areaLookSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}
