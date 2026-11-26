import {
  ClampToEdgeWrapping,
  CubeTexture,
  Data3DTexture,
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  RepeatWrapping,
  RGBAFormat,
  RGFormat,
  UnsignedByteType,
} from 'three';
import {
  BH_LUT_DIMS,
  BH_M,
  BH_SHADOW_RADIUS_BC,
  lutUToB,
} from './constants';

export type BhAssetBundle = {
  deflectionLut: DataTexture;
  transferLut: Data3DTexture;
  blackbodyLut: DataTexture;
  diskTurbulence: DataTexture;
  skyCube: CubeTexture | DataTexture;
  blueNoise: DataTexture;
  brightStars: Float32Array;
  particlesInit: Float32Array;
  kerrLut: Data3DTexture | null;
  isBootstrap: boolean;
  skyTier: 'bootstrap' | 'low' | 'mid' | 'high';
};

export function floatToHalfBits(val: number): number {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = val;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  let exp = ((x >>> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (((x >>> 23) & 0xff) === 0xff) return sign | 0x7c00 | (mant ? 1 : 0);
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >>> (1 - exp);
    return sign | ((mant + 0x1000) >>> 13);
  }
  if (exp >= 31) return sign | 0x7bff;
  const rounded = mant + 0x1000;
  if (rounded & 0x800000) {
    exp += 1;
    if (exp >= 31) return sign | 0x7bff;
    return sign | (exp << 10);
  }
  return sign | (exp << 10) | (rounded >>> 13);
}

/**
 * Generates instant (<2ms) CPU fallback textures so Frame 1 renders
 * the lensed black hole + Doppler disk at T0 fidelity within ~150ms.
 */
export function createBootstrapAssets(): BhAssetBundle {
  // 1. 128-texel analytic deflection LUT
  const defW = 128;
  const defData = new Uint16Array(defW * 4);
  const bc = BH_SHADOW_RADIUS_BC;
  for (let i = 0; i < defW; i++) {
    const s = (i + 0.5) / defW;
    const b = lutUToB(s);
    const esc = b >= bc ? 1.0 : 0.0;
    const alpha = esc > 0.5 ? (4.0 * BH_M) / Math.max(bc + 0.02, b) + 0.35 * Math.exp(-(b - bc) * 1.4) : 0.0;
    const phiInf = Math.PI + alpha;
    const ringW = Math.exp(-Math.abs(b - bc) * 20.0);
    defData[i * 4 + 0] = floatToHalfBits(phiInf);
    defData[i * 4 + 1] = floatToHalfBits(alpha);
    defData[i * 4 + 2] = floatToHalfBits(esc);
    defData[i * 4 + 3] = floatToHalfBits(ringW);
  }
  const deflectionLut = new DataTexture(defData, defW, 1, RGBAFormat, HalfFloatType);
  deflectionLut.minFilter = LinearFilter;
  deflectionLut.magFilter = LinearFilter;
  deflectionLut.wrapS = ClampToEdgeWrapping;
  deflectionLut.wrapT = ClampToEdgeWrapping;
  deflectionLut.needsUpdate = true;

  // 2. Tiny 4x4x1 placeholder transfer 3D LUT (replaced before T1 renders)
  const trData = new Uint16Array(4 * 4 * 1 * 2);
  const transferLut = new Data3DTexture(trData, 4, 4, 1);
  transferLut.format = RGFormat;
  transferLut.type = HalfFloatType;
  transferLut.minFilter = LinearFilter;
  transferLut.magFilter = LinearFilter;
  transferLut.needsUpdate = true;

  // 3. 128-texel blackbody color LUT
  const bbW = 128;
  const bbData = new Uint16Array(bbW * 4);
  for (let i = 0; i < bbW; i++) {
    const t = i / (bbW - 1);
    const temp = BH_LUT_DIMS.tempMinK * Math.pow(BH_LUT_DIMS.tempMaxK / BH_LUT_DIMS.tempMinK, t);
    const rel = temp / 6500.0;
    const lum = Math.pow(rel, 1.85);
    const r = Math.min(1.8, Math.max(0.05, 1.45 - 0.55 * t)) * lum;
    const g = Math.min(1.6, Math.max(0.02, 0.25 + 1.05 * Math.sin(t * Math.PI * 0.72))) * lum;
    const b = Math.min(2.2, Math.max(0.0, Math.pow(t, 1.35) * 1.9)) * lum;
    bbData[i * 4 + 0] = floatToHalfBits(r);
    bbData[i * 4 + 1] = floatToHalfBits(g);
    bbData[i * 4 + 2] = floatToHalfBits(b);
    bbData[i * 4 + 3] = floatToHalfBits(temp / 10000.0);
  }
  const blackbodyLut = new DataTexture(bbData, bbW, 1, RGBAFormat, HalfFloatType);
  blackbodyLut.minFilter = LinearFilter;
  blackbodyLut.magFilter = LinearFilter;
  blackbodyLut.wrapS = ClampToEdgeWrapping;
  blackbodyLut.wrapT = ClampToEdgeWrapping;
  blackbodyLut.needsUpdate = true;

  // 4. 128x64 procedural polar disk turbulence bootstrap
  const tw = 128;
  const th = 64;
  const tData = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const v = (y + 0.5) / th;
    for (let x = 0; x < tw; x++) {
      const phi = ((x + 0.5) / tw) * Math.PI * 2;
      const w1 = 0.5 + 0.35 * Math.sin(phi * 3.0 + v * 14.0) + 0.15 * Math.cos(phi * 7.0 - v * 22.0);
      const w2 = 0.5 + 0.4 * Math.sin(phi * 8.0 + v * 28.0);
      const idx = (y * tw + x) * 4;
      tData[idx + 0] = Math.round(Math.min(1, Math.max(0, w1)) * 255);
      tData[idx + 1] = Math.round(Math.min(1, Math.max(0, w2)) * 255);
      tData[idx + 2] = Math.round(Math.min(1, Math.max(0, 0.55 + 0.35 * Math.sin(phi * 2.0 + v * 10.0))) * 255);
      tData[idx + 3] = 255;
    }
  }
  const diskTurbulence = new DataTexture(tData, tw, th, RGBAFormat, UnsignedByteType);
  diskTurbulence.wrapS = RepeatWrapping;
  diskTurbulence.wrapT = ClampToEdgeWrapping;
  diskTurbulence.minFilter = LinearMipmapLinearFilter;
  diskTurbulence.magFilter = LinearFilter;
  diskTurbulence.generateMipmaps = true;
  diskTurbulence.needsUpdate = true;

  // 5. 16x16x6 dark-void + faint star bootstrap CubeTexture
  const skyCube = new CubeTexture();
  for (let f = 0; f < 6; f++) {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (c) {
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#030206';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#5f4b78';
        ctx.fillRect((f * 5 + 3) % 14, (f * 7 + 2) % 14, 1, 1);
      }
      skyCube.images[f] = c;
    }
  }
  skyCube.minFilter = LinearFilter;
  skyCube.magFilter = LinearFilter;
  skyCube.needsUpdate = true;

  // 6. 64x64 quasi-random R2 blue-noise bootstrap
  const bnN = 64;
  const bnData = new Uint8Array(bnN * bnN * 2);
  for (let y = 0; y < bnN; y++) {
    for (let x = 0; x < bnN; x++) {
      const n0 = (x * 0.7548776662466927 + y * 0.5698402909980532) % 1;
      const n1 = (x * 0.5698402909980532 + y * 0.3819660112501051) % 1;
      const idx = (y * bnN + x) * 2;
      bnData[idx] = Math.round(n0 * 255);
      bnData[idx + 1] = Math.round(n1 * 255);
    }
  }
  const blueNoise = new DataTexture(bnData, bnN, bnN, RGFormat, UnsignedByteType);
  blueNoise.wrapS = RepeatWrapping;
  blueNoise.wrapT = RepeatWrapping;
  blueNoise.minFilter = NearestFilter;
  blueNoise.magFilter = NearestFilter;
  blueNoise.needsUpdate = true;

  // 7. Minimal bootstrap brightStars & particlesInit (replaced immediately on fetch)
  const brightStars = new Float32Array(2048 * 5);
  const particlesInit = new Float32Array(8192 * 4);
  for (let i = 0; i < 8192; i++) {
    const t = (i * 0.61803398875) % 1;
    const r = 3.0 + Math.pow(t, 1.4) * 12.0;
    const phi = ((i * 2.3999632297) % (Math.PI * 2));
    const z = (((i * 0.75487766) % 1) - 0.5) * r * 0.05;
    particlesInit[i * 4 + 0] = r;
    particlesInit[i * 4 + 1] = phi;
    particlesInit[i * 4 + 2] = z;
    particlesInit[i * 4 + 3] = (i * 0.381966) % 1;
  }

  return {
    deflectionLut,
    transferLut,
    blackbodyLut,
    diskTurbulence,
    skyCube,
    blueNoise,
    brightStars,
    particlesInit,
    kerrLut: null,
    isBootstrap: true,
    skyTier: 'bootstrap',
  };
}

export function disposeBootstrapTexture(tex: { dispose?: () => void } | null | undefined) {
  tex?.dispose?.();
}
