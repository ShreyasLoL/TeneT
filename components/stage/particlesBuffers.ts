import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import type { buildCohortMap } from '@/lib/viz/cohorts';
import {
  BH_DISK_H_OVER_R_MAX,
  BH_DISK_H_OVER_R_MIN,
  BH_DISK_R_IN,
  BH_DISK_R_OUT,
  BH_PARTICLE_COUNTS,
} from '@/stage/blackhole/constants';

export const MAX_PARTICLES = BH_PARTICLE_COUNTS.T2; // 262,144 GPGPU capacity

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
 * Builds instanced particle initial attributes up to `MAX_PARTICLES`:
 * `(r0, phi0, z0, packedSeed)` matching baked `particles_init.bin`.
 */
export function buildParticleInitBuffer(
  bakedInit: Float32Array | null,
  capacity = MAX_PARTICLES,
): Float32Array {
  const count = Math.min(MAX_PARTICLES, Math.max(1, capacity));
  const out = new Float32Array(count * 4);

  if (bakedInit && bakedInit.length >= 4) {
    const baseCount = Math.floor(bakedInit.length / 4);
    for (let i = 0; i < count; i++) {
      const s = (i % baseCount) * 4;
      const tile = i >>> 15;
      out[i * 4] = bakedInit[s];
      out[i * 4 + 1] = bakedInit[s + 1] + tile * 0.785398;
      out[i * 4 + 2] = bakedInit[s + 2];
      out[i * 4 + 3] = bakedInit[s + 3] + tile * 0.137;
    }
    return out;
  }

  const rng = mulberry32(9917342);
  const logIn = Math.log(BH_DISK_R_IN);
  const logOut = Math.log(BH_DISK_R_OUT);
  for (let i = 0; i < count; i++) {
    const r = Math.exp(logIn + rng() * (logOut - logIn));
    const phi = rng() * Math.PI * 2;
    const rt = Math.min(1, Math.max(0, (r - BH_DISK_R_IN) / (BH_DISK_R_OUT - BH_DISK_R_IN)));
    const hOverR = BH_DISK_H_OVER_R_MIN + (BH_DISK_H_OVER_R_MAX - BH_DISK_H_OVER_R_MIN) * Math.sqrt(rt);
    const z = (rng() + rng() - 1) * r * hOverR;
    out[i * 4] = r;
    out[i * 4 + 1] = phi;
    out[i * 4 + 2] = z;
    out[i * 4 + 3] = rng();
  }
  return out;
}

export function buildCohortParticleBuffers(
  cohortMap: CohortMap | null,
  capacity = MAX_PARTICLES,
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
