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

export const LADDER_PROFILES: Record<QualityLevel, LadderProfile> = {
  0: {
    level: 0,
    particles: 200_000,
    dprMax: 1.5,
    bloom: true,
    mirror: true,
    grain: true,
    lensMode: 'full',
    simplifiedDisk: false,
  },
  1: {
    level: 1,
    particles: 60_000,
    dprMax: 1.5,
    bloom: true,
    mirror: false,
    grain: true,
    lensMode: 'full',
    simplifiedDisk: false,
  },
  2: {
    level: 2,
    particles: 60_000,
    dprMax: 1.25,
    bloom: false,
    mirror: false,
    grain: false,
    lensMode: 'full',
    simplifiedDisk: false,
  },
  3: {
    level: 3,
    particles: 15_000,
    dprMax: 1.0,
    bloom: false,
    mirror: false,
    grain: false,
    lensMode: 'quad',
    simplifiedDisk: true,
  },
  4: {
    level: 4,
    particles: 0,
    dprMax: 1.0,
    bloom: false,
    mirror: false,
    grain: false,
    lensMode: 'none',
    simplifiedDisk: true,
  },
};

export function profileForLevel(level: QualityLevel, isTouch: boolean): LadderProfile {
  const base = LADDER_PROFILES[level];
  if (isTouch && level === 0) {
    return { ...base, particles: 60_000 };
  }
  return base;
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

export function detectWebGL2Support(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * Offline hardware heuristic replacing external detect-gpu CDN fetches (Gap 12).
 * Starts conservatively on low-core/touch devices and lets the frame governor adapt.
 */
export function detectInitialLevel(): QualityLevel {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 1;
  if (!detectWebGL2Support()) return 4;

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
