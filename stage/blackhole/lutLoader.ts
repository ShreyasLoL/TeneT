import {
  ClampToEdgeWrapping,
  Data3DTexture,
  DataTexture,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RepeatWrapping,
  RGBAFormat,
  RGFormat,
  type Texture,
  UnsignedByteType,
  type WebGLRenderer,
} from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { BhAssetBundle } from './bootstrapAssets';

const BHL1_MAGIC = 0x314c4842; // 'BHL1'

export type ParsedBhl1 = {
  w: number;
  h: number;
  d: number;
  channels: number;
  payload: ArrayBuffer;
  byteOffset: number;
  byteLength: number;
};

export function parseBhl1Buffer(buf: ArrayBuffer): ParsedBhl1 {
  if (buf.byteLength < 16) throw new Error('Invalid BHL1 buffer (too short)');
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  if (magic !== BHL1_MAGIC) {
    throw new Error(`Invalid BHL1 magic: 0x${magic.toString(16)}`);
  }
  const w = dv.getUint32(4, true);
  const h = dv.getUint32(8, true);
  const meta = dv.getUint32(12, true);
  const d = meta >> 8 > 0 ? meta >> 8 : 1;
  const channels = meta & 0xff || 4;
  return {
    w,
    h,
    d,
    channels,
    payload: buf,
    byteOffset: 16,
    byteLength: buf.byteLength - 16,
  };
}

async function fetchBhl1(url: string): Promise<ParsedBhl1> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  return parseBhl1Buffer(buf);
}

function makeHalfDataTexture(p: ParsedBhl1): DataTexture {
  const u16 = new Uint16Array(p.payload, p.byteOffset, p.byteLength / 2);
  const format = p.channels === 2 ? RGFormat : RGBAFormat;
  const tex = new DataTexture(u16, p.w, p.h, format, HalfFloatType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeHalfData3DTexture(p: ParsedBhl1): Data3DTexture {
  const u16 = new Uint16Array(p.payload, p.byteOffset, p.byteLength / 2);
  const tex = new Data3DTexture(u16, p.w, p.h, p.d);
  tex.format = p.channels === 2 ? RGFormat : RGBAFormat;
  tex.type = HalfFloatType;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.wrapR = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeBlueNoiseTexture(p: ParsedBhl1): DataTexture {
  const u8 = new Uint8Array(p.payload, p.byteOffset, p.byteLength);
  const tex = new DataTexture(u8, p.w, p.h, RGFormat, UnsignedByteType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

let sharedKtx2Loader: KTX2Loader | null = null;

function getKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  if (!sharedKtx2Loader) {
    sharedKtx2Loader = new KTX2Loader();
    sharedKtx2Loader.setTranscoderPath('/bh/basis/');
    sharedKtx2Loader.setWorkerLimit(2);
  }
  sharedKtx2Loader.detectSupport(renderer);
  return sharedKtx2Loader;
}

function initTex(renderer: WebGLRenderer, tex: Texture) {
  if (typeof renderer.initTexture === 'function') {
    renderer.initTexture(tex);
  }
}

export async function loadCoreBhAssets(renderer: WebGLRenderer): Promise<BhAssetBundle> {
  const ktx2 = getKtx2Loader(renderer);
  const [defRaw, trRaw, bbRaw, bnRaw, starsRaw, partRaw, turbTex, skyLow] = await Promise.all([
    fetchBhl1('/bh/deflection_lut.bin'),
    fetchBhl1('/bh/transfer_lut.bin'),
    fetchBhl1('/bh/blackbody_lut.bin'),
    fetchBhl1('/bh/blue_noise_64.bin'),
    fetchBhl1('/bh/bright_stars.bin'),
    fetchBhl1('/bh/particles_init.bin'),
    ktx2.loadAsync('/bh/disk_turbulence.ktx2'),
    ktx2.loadAsync('/bh/sky_low.ktx2'),
  ]);

  const deflectionLut = makeHalfDataTexture(defRaw);
  const transferLut = makeHalfData3DTexture(trRaw);
  const blackbodyLut = makeHalfDataTexture(bbRaw);
  const blueNoise = makeBlueNoiseTexture(bnRaw);
  const brightStars = new Float32Array(
    starsRaw.payload,
    starsRaw.byteOffset,
    starsRaw.byteLength / 4,
  );
  const particlesInit = new Float32Array(
    partRaw.payload,
    partRaw.byteOffset,
    partRaw.byteLength / 4,
  );

  turbTex.wrapS = RepeatWrapping;
  turbTex.wrapT = ClampToEdgeWrapping;
  turbTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  turbTex.needsUpdate = true;

  skyLow.needsUpdate = true;

  initTex(renderer, deflectionLut);
  initTex(renderer, transferLut);
  initTex(renderer, blackbodyLut);
  initTex(renderer, blueNoise);
  initTex(renderer, turbTex);
  initTex(renderer, skyLow);

  return {
    deflectionLut,
    transferLut,
    blackbodyLut,
    diskTurbulence: turbTex as unknown as DataTexture,
    skyCube: skyLow as unknown as BhAssetBundle['skyCube'],
    blueNoise,
    brightStars,
    particlesInit,
    kerrLut: null,
    isBootstrap: false,
    skyTier: 'low',
  };
}

export async function loadSkyTier(
  renderer: WebGLRenderer,
  tier: 'mid' | 'high',
): Promise<Texture> {
  const ktx2 = getKtx2Loader(renderer);
  const url = tier === 'high' ? '/bh/sky_high.ktx2' : '/bh/sky_mid.ktx2';
  const tex = await ktx2.loadAsync(url);
  tex.needsUpdate = true;
  initTex(renderer, tex);
  return tex;
}

export async function loadKerrLut(renderer: WebGLRenderer): Promise<Data3DTexture> {
  const raw = await fetchBhl1('/bh/kerr_lut.bin');
  const tex = makeHalfData3DTexture(raw);
  initTex(renderer, tex);
  return tex;
}
