export type QualityLevel = 0 | 1 | 2 | 3 | 4;

export type LadderProfile = {
  level: QualityLevel;
  particles: number;
  dprMax: number;
  bloom: boolean;
  mirror: boolean;
  grain: boolean;
  lensMode: 'full' | 'quad' | 'none';
  simplifiedDisk: boolean;
};

export const NORMAL_PARTICLES = 45_000;
export const LOW_POWER_PARTICLES = 11_250;

export const LADDER_PROFILES: Record<QualityLevel, LadderProfile> = {
  0: {
    level: 0,
    particles: NORMAL_PARTICLES,
    dprMax: 1.5,
    bloom: true,
    mirror: true,
    grain: true,
    lensMode: 'full',
    simplifiedDisk: false,
  },
  1: {
    level: 1,
    particles: NORMAL_PARTICLES,
    dprMax: 1.5,
    bloom: true,
    mirror: false,
    grain: true,
    lensMode: 'full',
    simplifiedDisk: false,
  },
  2: {
    level: 2,
    particles: 30_000,
    dprMax: 1.25,
    bloom: false,
    mirror: false,
    grain: false,
    lensMode: 'full',
    simplifiedDisk: false,
  },
  3: {
    level: 3,
    particles: LOW_POWER_PARTICLES,
    dprMax: 1.15,
    bloom: false,
    mirror: false,
    grain: false,
    lensMode: 'full',
    simplifiedDisk: true,
  },
  4: {
    level: 4,
    particles: LOW_POWER_PARTICLES,
    dprMax: 1.15,
    bloom: false,
    mirror: false,
    grain: false,
    lensMode: 'full',
    simplifiedDisk: false,
  },
};

const TOUCH_LEVEL_0_PROFILE: LadderProfile = {
  ...LADDER_PROFILES[0],
  particles: 32_000,
};

const LOW_POWER_PROFILE: LadderProfile = {
  level: 4,
  particles: LOW_POWER_PARTICLES,
  dprMax: 1.25,
  bloom: false,
  mirror: false,
  grain: false,
  lensMode: 'full',
  simplifiedDisk: false,
};

export function profileForLevel(
  level: QualityLevel,
  isTouch: boolean,
  lowPower: boolean = false,
): LadderProfile {
  if (lowPower) return LOW_POWER_PROFILE;
  if (isTouch && level === 0) return TOUCH_LEVEL_0_PROFILE;
  return LADDER_PROFILES[level];
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

export function isReducedDataPreferred(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return true;
  return window.matchMedia?.('(prefers-reduced-data: reduce)').matches ?? false;
}

let cachedWebGL2: boolean | null = null;

/**
 * Checks WebGL2 availability without allocating throwaway GPU contexts when WebGL2RenderingContext exists;
 * StageCanvas handles actual single-context creation and context-loss fallback.
 */
export function detectWebGL2Support(): boolean {
  if (typeof window === 'undefined') return true;
  if (cachedWebGL2 !== null) return cachedWebGL2;
  cachedWebGL2 = typeof WebGL2RenderingContext !== 'undefined';
  return cachedWebGL2;
}

/**
 * Offline hardware heuristic replacing external detect-gpu CDN fetches.
 * Starts conservatively on low-core/touch/data-saver devices and lets the frame governor adapt.
 */
export function detectInitialLevel(): QualityLevel {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 1;
  if (!detectWebGL2Support()) return 4;
  if (isReducedDataPreferred()) return 3;

  const touch = isTouchDevice();
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

  if (touch) return cores <= 4 || mem <= 4 ? 2 : 1;
  if (cores <= 2 || mem <= 2) return 2;
  return 1;
}

const SOFTWARE_RENDERER_RE = /swiftshader|llvmpipe|softpipe|microsoft basic render/i;

export function inspectRenderer(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): { renderer: string; isSoftware: boolean } {
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? 'unknown');
      return { renderer, isSoftware: SOFTWARE_RENDERER_RE.test(renderer) };
    }
    const fallback = String(gl.getParameter(gl.RENDERER) ?? 'unknown');
    return { renderer: fallback, isSoftware: SOFTWARE_RENDERER_RE.test(fallback) };
  } catch {
    return { renderer: 'unknown', isSoftware: false };
  }
}
