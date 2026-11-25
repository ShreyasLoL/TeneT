import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { buildWordmarkTargets } from '@/lib/stage/wordmark';
import type { buildCohortMap } from '@/lib/viz/cohorts';

export const MAX_PARTICLES = 200_000;
const WORDMARK_COUNT = 6_000;

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

export function buildStaticParticleBuffers(): {
  positions: Float32Array;
  seeds: Float32Array;
  targets: Float32Array;
} {
  const rng = mulberry32(99173);
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const seeds = new Float32Array(MAX_PARTICLES * 4);
  const targets = new Float32Array(MAX_PARTICLES * 3);
  const wordmark = buildWordmarkTargets(WORDMARK_COUNT, 7);

  for (let i = 0; i < MAX_PARTICLES; i++) {
    seeds[i * 4] = rng();
    seeds[i * 4 + 1] = rng();
    seeds[i * 4 + 2] = rng();
    seeds[i * 4 + 3] = rng();

    if (i < WORDMARK_COUNT) {
      targets[i * 3] = wordmark[i * 3];
      targets[i * 3 + 1] = wordmark[i * 3 + 1];
      targets[i * 3 + 2] = wordmark[i * 3 + 2];
    }
  }

  return { positions, seeds, targets };
}

export function buildCohortParticleBuffers(cohortMap: CohortMap | null): {
  cohorts: Float32Array;
  areas: Float32Array;
} {
  const cohorts = new Float32Array(MAX_PARTICLES);
  const areas = new Float32Array(MAX_PARTICLES);
  const slotCount = cohortMap?.slots.length || 3;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const slot = cohortMap?.slots[i % slotCount];
    cohorts[i] = slot ? slot.slotIndex : i % 3;
    areas[i] = slot ? slot.areaIndex % 3 : i % 3;
  }
  return { cohorts, areas };
}
