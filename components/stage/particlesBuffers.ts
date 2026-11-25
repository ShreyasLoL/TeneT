import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { NORMAL_PARTICLES } from '@/lib/stage/tiers';
import type { buildCohortMap } from '@/lib/viz/cohorts';

export const MAX_PARTICLES = NORMAL_PARTICLES; // 45,000 max per perf budget
const DISK_FRACTION = 0.9;
const R_DISK_IN = 1.02;
const R_DISK_OUT = 7.8;
const R_SHELL_IN = 1.08;
const R_SHELL_OUT = 2.85;

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
 * Builds static particle attributes up to `MAX_PARTICLES` (45,000):
 * - `spawn` (`position` vec3): scattered outer 3D cloud for `uIntro = 0`, spiraling inward on GPU.
 * - `seeds` (`aSeed` vec4): x = orbital semi-major axis `aBase`, y = eccRand, z = phase, w = inclRand.
 */
export function buildStaticParticleBuffers(capacity: number): {
  spawn: Float32Array;
  seeds: Float32Array;
} {
  const count = Math.min(MAX_PARTICLES, Math.max(1, capacity));
  const rng = mulberry32(99173);
  const spawn = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const diskLimit = Math.floor(count * DISK_FRACTION);

  for (let i = 0; i < count; i++) {
    // Interleave disk & dust-shell particles evenly so `setDrawRange(0, count/4)` in LOW POWER
    // preserves the exact 82% Keplerian disk / 18% dust shell visual ratio!
    const isShell = i % 10 === 9 || i >= diskLimit + Math.floor(count * 0.1);
    const rRand = rng();
    const aBase = isShell
      ? R_SHELL_IN + (R_SHELL_OUT - R_SHELL_IN) * Math.pow(rRand, 1.35)
      : R_DISK_IN + (R_DISK_OUT - R_DISK_IN) * Math.pow(rRand, 2.05);

    seeds[i * 4] = aBase;
    seeds[i * 4 + 1] = rng();
    seeds[i * 4 + 2] = rng();
    // Encode shell flag in sign of w (+2 offset for shell) or separate channel; keep w in [0,1] and encode shell in spawn/meta
    seeds[i * 4 + 3] = rng();

    // Scattered outer dark nebula coordinates for uIntro = 0
    const theta0 = rng() * Math.PI * 2;
    const cosPhi = rng() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const spawnR = 8.5 + Math.pow(rng(), 0.85) * 14.5;
    spawn[i * 3] = spawnR * sinPhi * Math.cos(theta0);
    spawn[i * 3 + 1] = spawnR * cosPhi * 0.68;
    spawn[i * 3 + 2] = spawnR * sinPhi * Math.sin(theta0);
  }

  return { spawn, seeds };
}

/**
 * Packs `(cohortSlot, encodedLayerAndArea)` into `aMeta` (`vec2`):
 * `aMeta.x` = cohort slot `0..15`
 * `aMeta.y` = `areaArchetype (0..2)` for disk particles, or `10.0 + areaArchetype` for outer dust-shell particles.
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
    const areaIdx = slot ? slot.areaIndex % 3 : i % 3;
    const isShell = i % 10 === 9; // 10% faint volumetric lensing dust, zero outer screen haze
    meta[i * 2] = slot ? slot.slotIndex : i % 3;
    meta[i * 2 + 1] = isShell ? 10 + areaIdx : areaIdx;
  }
  return meta;
}
