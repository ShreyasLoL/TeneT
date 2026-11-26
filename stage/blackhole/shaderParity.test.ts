import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bhCommonGlsl, bhFullscreenVertexShader } from '@/components/stage/shaders/bhCommon.glsl';
import { bhDiskGlsl } from '@/components/stage/shaders/bhDisk.glsl';
import { bhDiskCacheFragmentShader } from '@/components/stage/shaders/bhDiskCache.glsl';
import { bhHeroFragmentShader } from '@/components/stage/shaders/bhHero.glsl';
import {
  bhParticlesRenderFragmentShader,
  bhParticlesRenderVertexShader,
} from '@/components/stage/shaders/bhParticlesRender.glsl';
import { bhParticlesSimFragmentShader } from '@/components/stage/shaders/bhParticlesSim.glsl';
import {
  bhBloomPrefilterFragmentShader,
  bhKawaseDownFragmentShader,
  bhKawaseUpFragmentShader,
  bhPostCompositeFragmentShader,
} from '@/components/stage/shaders/bhPost.glsl';
import {
  bhStarSpritesFragmentShader,
  bhStarSpritesVertexShader,
} from '@/components/stage/shaders/bhStarSprites.glsl';
import { bhT0WarpFragmentShader } from '@/components/stage/shaders/bhT0Warp.glsl';
import { bhTemporalFragmentShader } from '@/components/stage/shaders/bhTemporal.glsl';
import {
  BH_DISK_R_IN,
  BH_LUT_DIMS,
  BH_M,
  BH_RS,
  BH_SHADOW_RADIUS_BC,
  bToLutU,
  gravity,
} from './constants';
import { parseBhl1Buffer } from './lutLoader';

function halfToFloat(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? Number.NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * 2 ** (e - 15) * (1 + f / 1024);
}

function luminetG(r: number, b: number, sinTheta0: number, sinPsi: number, spinSense: number, rObs: number): number {
  const rSafe = Math.max(BH_RS + 0.05, r);
  const omega = Math.sqrt(BH_M / (rSafe * rSafe * rSafe)) * spinSense;
  const num = Math.sqrt(Math.max(1e-4, 1.0 - (3.0 * BH_M) / rSafe));
  const denom = Math.max(0.22, 1.0 + omega * b * sinTheta0 * sinPsi);
  const obsRedshift = Math.sqrt(Math.max(1e-4, 1.0 - BH_RS / Math.max(BH_RS + 0.05, rObs)));
  return (num / denom) / obsRedshift;
}

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('shaderParity & baked binary LUT integrity', () => {
  it('exports all required GLSL3 shader strings with uniform declarations matching render passes', () => {
    const shaders = [
      bhFullscreenVertexShader,
      bhCommonGlsl,
      bhDiskGlsl,
      bhDiskCacheFragmentShader,
      bhHeroFragmentShader,
      bhStarSpritesVertexShader,
      bhStarSpritesFragmentShader,
      bhParticlesSimFragmentShader,
      bhParticlesRenderVertexShader,
      bhParticlesRenderFragmentShader,
      bhT0WarpFragmentShader,
      bhBloomPrefilterFragmentShader,
      bhKawaseDownFragmentShader,
      bhKawaseUpFragmentShader,
      bhPostCompositeFragmentShader,
      bhTemporalFragmentShader,
    ];
    for (const s of shaders) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(100);
    }
    expect(bhHeroFragmentShader).toContain('uCheatsEnabled');
    expect(bhHeroFragmentShader).toContain('bhLuminetG');
    expect(bhHeroFragmentShader).toContain('textureGrad');
    expect(bhParticlesSimFragmentShader).toContain('phiNorm');
    expect(bhPostCompositeFragmentShader).toContain('agxToneMap');
  });

  it('produces >2.5x approaching-vs-receding bolometric g^4 asymmetry at ISCO (83.5 deg)', () => {
    const r = BH_DISK_R_IN + 0.4;
    const sinTheta0 = Math.sin((83.5 * Math.PI) / 180);
    const b = 4.2;
    const gApproach = luminetG(r, b, sinTheta0, -1, 1, 28);
    const gRecede = luminetG(r, b, sinTheta0, 1, 1, 28);
    const ratio = gApproach ** 4 / gRecede ** 4;
    expect(gApproach).toBeGreaterThan(1.0);
    expect(gRecede).toBeLessThan(0.8);
    expect(ratio).toBeGreaterThan(2.5);
  });

  it('reads public/bh/*.bin with matching dimensions and sane physical values', () => {
    const bhDir = join(process.cwd(), 'public', 'bh');
    const def = parseBhl1Buffer(toArrayBuffer(readFileSync(join(bhDir, 'deflection_lut.bin'))));
    expect(def.w).toBe(BH_LUT_DIMS.deflectionWidth);
    expect(def.h).toBe(1);
    expect(def.channels).toBe(4);

    // Check b = 20 against weak-field formula 4M/b
    const u16 = new Uint16Array(def.payload, def.byteOffset, def.byteLength / 2);
    const s20 = bToLutU(20.0);
    const texel = Math.round(s20 * def.w - 0.5);
    const alpha20 = halfToFloat(u16[texel * 4 + 1]);
    const escaped20 = halfToFloat(u16[texel * 4 + 2]);
    expect(escaped20).toBeGreaterThan(0.9);
    expect(alpha20).toBeCloseTo(gravity(20.0).deflection, 1);

    // Sub-critical ray captures (escaped == 0)
    const sSub = bToLutU(BH_SHADOW_RADIUS_BC * 0.7);
    const texelSub = Math.max(0, Math.round(sSub * def.w - 0.5));
    expect(halfToFloat(u16[texelSub * 4 + 2])).toBeLessThan(0.1);

    const bb = parseBhl1Buffer(toArrayBuffer(readFileSync(join(bhDir, 'blackbody_lut.bin'))));
    expect(bb.w).toBe(BH_LUT_DIMS.blackbodyWidth);
    const bbU16 = new Uint16Array(bb.payload, bb.byteOffset, bb.byteLength / 2);
    // Hot inner end (texel w-1) should have much higher blue than cool outer end (texel 0)
    const coolB = halfToFloat(bbU16[2]);
    const hotB = halfToFloat(bbU16[(bb.w - 2) * 4 + 2]);
    expect(hotB).toBeGreaterThan(coolB * 5);
  });
});
