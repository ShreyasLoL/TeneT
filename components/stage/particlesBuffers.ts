import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { buildWordmarkTargets } from '@/lib/stage/wordmark';
import type { buildCohortMap } from '@/lib/viz/cohorts';

export const MAX_PARTICLES = 200_000;
const WORDMARK_COUNT = 6_000;
const R_IN = 2.05;
const R_OUT = 9.4;

type CohortMap = ReturnType<typeof buildCohortMap>;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCohortTexture(): DataTexture {
  const arr = new Float32Array(16 * 4);
  for (let i = 0; i < 16; i++) {
    arr[i * 4] = 1;
    arr[i * 4 + 1] = 1;
    arr[i * 4 + 2] = i % 3;
    arr[i * 4 + 3] = 0;
  }
  const tex = new DataTexture(arr, 16, 1, RGBAFormat, FloatType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds static particle attributes sized to `capacity` (avoiding 10MB 200k allocations at L1).
 * `position` stores symmetric wordmark targets directly; `aSeed.x` stores precomputed orbital `aBase`.
 */
export function buildStaticParticleBuffers(capacity: number): {
  targets: Float32Array;
  seeds: Float32Array;
} {
  const count = Math.min(MAX_PARTICLES, Math.max(1, capacity));
  const rng = mulberry32(99173);
  const targets = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const wordmark = buildWordmarkTargets(Math.min(WORDMARK_COUNT, count), 7);
  const wordLen = Math.floor(wordmark.length / 3);

  for (let i = 0; i < count; i++) {
    const r = rng();
    // Precompute Keplerian semi-major axis so the vertex shader skips `pow(r, 1.6)` per frame
    seeds[i * 4] = R_IN + (R_OUT - R_IN) * Math.pow(r, 1.6);
    seeds[i * 4 + 1] = rng();
    seeds[i * 4 + 2] = rng();
    seeds[i * 4 + 3] = rng();

    if (i < wordLen) {
      targets[i * 3] = wordmark[i * 3];
      targets[i * 3 + 1] = wordmark[i * 3 + 1];
      targets[i * 3 + 2] = wordmark[i * 3 + 2];
    }
  }

  return { targets, seeds };
}

/**
 * Packs `(cohortSlot, areaIndex)` into a single vec2 attribute `aMeta` (-25% vertex fetch bandwidth).
 */
export function buildCohortParticleBuffers(
  cohortMap: CohortMap | null,
  capacity: number,
): Float32Array {
  const count = Math.min(MAX_PARTICLES, Math.max(1, capacity));
  const meta = new Float32Array(count * 2);
  const slotCount = cohortMap?.slots.length || 3;
  for (let i = 0; i < count; i++) {
    const slot = cohortMap?.slots[i % slotCount];
    meta[i * 2] = slot ? slot.slotIndex : i % 3;
    meta[i * 2 + 1] = slot ? slot.areaIndex % 3 : i % 3;
  }
  return meta;
}
