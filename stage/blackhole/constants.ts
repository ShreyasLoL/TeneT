/**
 * Single source of truth for all relativistic black-hole constants,
 * units (G = c = 1, rs = 1, M = 0.5), LUT dimensions, and gravity(r).
 * Imported by shaders (via glslBhConstantsHeader), particles, camera spline,
 * and mirrored into tools/bh-bake/bh_constants_gen.hpp during build.
 */

export const BH_G = 1.0;
export const BH_C = 1.0;
export const BH_RS = 1.0;
export const BH_M = 0.5 * BH_RS;

export const BH_PHOTON_SPHERE_R = 3.0 * BH_M; // 1.5 rs
export const BH_SHADOW_RADIUS_BC = 3.0 * Math.sqrt(3.0) * BH_M; // 3*sqrt(3)/2 rs ≈ 2.59807621135
export const BH_ISCO_R = 6.0 * BH_M; // 3.0 rs

export const BH_DISK_R_IN = BH_ISCO_R; // 3.0 rs
export const BH_DISK_R_OUT = 15.0 * BH_RS; // (15/3)^1.5 = 11.1803x slower than ISCO
export const BH_DISK_R_TAPER = 16.5 * BH_RS;
export const BH_NT_PEAK_R = (49.0 / 36.0) * BH_DISK_R_IN; // ≈ 1.3611 * r_in

// Inner ISCO period on screen = 8.0s (within 6-10s), outer (15 rs) = ~89.44s (~11.18x slower)
export const BH_ISCO_SCREEN_PERIOD_SEC = 8.0;
const GEOM_OMEGA_ISCO = Math.sqrt(BH_M / (BH_ISCO_R * BH_ISCO_R * BH_ISCO_R));
const GEOM_PERIOD_ISCO = (2.0 * Math.PI) / GEOM_OMEGA_ISCO;
export const BH_SCREEN_TIME_SCALE = GEOM_PERIOD_ISCO / BH_ISCO_SCREEN_PERIOD_SEC;

export const BH_DISK_H_OVER_R_MIN = 0.022;
export const BH_DISK_H_OVER_R_MAX = 0.056;

// Camera poses in Schwarzschild radii (rs = 1)
export const BH_CAMERA_START_R = 54.0; // within 40-60 rs
export const BH_CAMERA_ZOOM_MIN_R = 16.2;
export const BH_CAMERA_REST_R = 28.0;
export const BH_CAMERA_RITUAL_R = 52.0; // calm distant ember on /log data entry
export const BH_CAMERA_ORBIT_R = 32.0; // elevated for /dashboard ring reading
export const BH_CAMERA_INCLINATION_EDGE_RAD = (83.5 * Math.PI) / 180.0; // 80-85 deg from pole
export const BH_CAMERA_INCLINATION_REST_RAD = (82.0 * Math.PI) / 180.0;
export const BH_CAMERA_TILT_ROLL_RAD = -0.22; // subtle cinematic roll

// Kerr Ultra (T3 optional toggle): dimensionless spin a* = 0.9 -> a = 0.9 * M
export const BH_KERR_SPIN_STAR = 0.9;
export const BH_KERR_SPIN_A = BH_KERR_SPIN_STAR * BH_M; // 0.45
export const BH_KERR_ISCO_R = 1.16044 * BH_RS; // Boyer-Lindquist prograde ISCO for a*=0.9

export const BH_BRIGHT_STAR_COUNT = 2048;

export const BH_PARTICLE_COUNTS = {
  T0: 8192,
  T1: 40960,
  T2: 262144, // 512 x 512 GPGPU FBO
  T3: 262144,
} as const;

export const BH_LUT_DIMS = {
  deflectionWidth: 2048,
  transferB: 256,
  transferPhi: 256,
  transferSlices: 5,
  observerRadii: [8.0, 14.0, 24.0, 40.0, 64.0] as const,
  phiMax: 3.15 * Math.PI,
  bMin: 0.0,
  bMax: 64.0,
  // Piece-wise non-uniform b(s) mapping in [0, 1]: resolves b_c photon ring + full disk [bc..17rs]
  bSplitCapture: 0.30,
  bSplitStrong: 0.85,
  bStrongSpan: 14.5,
  bStrongEps: 0.015,
  blackbodyWidth: 512,
  tempMinK: 1000.0,
  tempMaxK: 40000.0,
  tempDiskPeakK: 14500.0,
  turbWidth: 2048,
  turbHeight: 512,
  blueNoiseSize: 64,
  kerrB: 128,
  kerrPhi: 128,
  kerrSlices: 2,
  cubemapSizes: {
    low: 512,
    mid: 1024,
    high: 2048,
  },
  skyHdrScale: 6.0,
} as const;

// Maps existing Tenet sealed-night RingLayout radii (2.15..9.2) cleanly outside the ISCO crest
export const BH_RING_WORLD_SCALE = 3.1;

export type GravitySample = {
  r: number;
  omega: number;
  screenOmega: number;
  orbitalPeriodScreenSec: number;
  vOrb: number;
  timeDilation: number;
  circularRedshift: number;
  tidal: number;
  deflection: number;
};

/**
 * Single gravity(r) function used across particles, disk shear, lensing, and tests.
 * r is in Schwarzschild radii (rs = 1, M = 0.5).
 */
export function gravity(r: number): GravitySample {
  const safeR = Math.max(BH_RS + 1e-6, r);
  const r2 = safeR * safeR;
  const r3 = r2 * safeR;
  const omega = Math.sqrt(BH_M / r3);
  const screenOmega = omega * BH_SCREEN_TIME_SCALE;
  const orbitalPeriodScreenSec = (2.0 * Math.PI) / screenOmega;
  const vOrb = Math.sqrt(BH_M / (safeR - BH_RS));
  const timeDilation = Math.sqrt(Math.max(0.0, 1.0 - BH_RS / safeR));
  const circularRedshift =
    safeR > BH_PHOTON_SPHERE_R ? Math.sqrt(1.0 - (3.0 * BH_M) / safeR) : 0.0;
  const tidal = (2.0 * BH_M) / r3;
  const deflection = (4.0 * BH_M) / safeR + (15.0 * Math.PI * BH_M * BH_M) / (4.0 * r2);

  return {
    r: safeR,
    omega,
    screenOmega,
    orbitalPeriodScreenSec,
    vOrb,
    timeDilation,
    circularRedshift,
    tidal,
    deflection,
  };
}

/**
 * Computes photon impact parameter b = r * sin(theta) / sqrt(1 - rs / r)
 * from local observer emission angle theta and observer distance rObs.
 */
export function impactParameterFromLocalAngle(sinTheta: number, rObs: number): number {
  const lapse = Math.sqrt(Math.max(1e-6, 1.0 - BH_RS / Math.max(BH_RS + 1e-4, rObs)));
  return (rObs * Math.abs(sinTheta)) / lapse;
}

/**
 * Relativistic frequency shift factor g = nu_obs / nu_em for a thin Keplerian disk:
 * g = sqrt(1 - 3M/r) / (1 + spinSense * Omega * b * sin(theta0) * sin(psi))
 * With spinSense = +1 and image-plane sin(psi) = x / b:
 *   x < 0 (left side, orbiting toward observer) => g > sqrt(1-3M/r) => brighter & blueshifted
 *   x > 0 (right side, orbiting away)          => g < sqrt(1-3M/r) => dimmer & redshifted
 */
export function observedFrequencyShiftG(
  r: number,
  b: number,
  sinTheta0: number,
  sinPsi: number,
  spinSense: number = 1,
  rObs: number = Infinity,
): number {
  const safeR = Math.max(BH_PHOTON_SPHERE_R + 1e-4, r);
  const gGrav = Math.sqrt(Math.max(1e-5, 1.0 - (3.0 * BH_M) / safeR));
  const omega = Math.sqrt(BH_M / (safeR * safeR * safeR));
  const obsLapse =
    Number.isFinite(rObs) && rObs > BH_RS
      ? Math.sqrt(1.0 - BH_RS / rObs)
      : 1.0;
  const denom = Math.max(0.22, 1.0 + spinSense * omega * b * sinTheta0 * sinPsi);
  return (gGrav / obsLapse) / denom;
}

/**
 * Non-uniform b -> u in [0, 1] matching the baked deflection & transfer LUT grid.
 * Inverse of lutUToB(u).
 */
export function bToLutU(b: number): number {
  const { bSplitCapture, bSplitStrong, bStrongSpan, bStrongEps, bMax } = BH_LUT_DIMS;
  const bc = BH_SHADOW_RADIUS_BC;
  const clampedB = Math.max(0.0, Math.min(bMax, b));
  if (clampedB <= bc) {
    return bSplitCapture * (clampedB / bc);
  }
  const db = clampedB - bc;
  if (db <= bStrongSpan) {
    const t =
      Math.log((db + bStrongEps) / bStrongEps) /
      Math.log((bStrongSpan + bStrongEps) / bStrongEps);
    return bSplitCapture + (bSplitStrong - bSplitCapture) * t;
  }
  const t = Math.sqrt((clampedB - (bc + bStrongSpan)) / (bMax - (bc + bStrongSpan)));
  return bSplitStrong + (1.0 - bSplitStrong) * t;
}

export function lutUToB(u: number): number {
  const { bSplitCapture, bSplitStrong, bStrongSpan, bStrongEps, bMax } = BH_LUT_DIMS;
  const bc = BH_SHADOW_RADIUS_BC;
  const s = Math.max(0.0, Math.min(1.0, u));
  if (s <= bSplitCapture) {
    return bc * (s / bSplitCapture);
  }
  if (s <= bSplitStrong) {
    const t = (s - bSplitCapture) / (bSplitStrong - bSplitCapture);
    return bc + bStrongEps * (Math.pow((bStrongSpan + bStrongEps) / bStrongEps, t) - 1.0);
  }
  const t = (s - bSplitStrong) / (1.0 - bSplitStrong);
  return bc + bStrongSpan + (bMax - (bc + bStrongSpan)) * t * t;
}

/**
 * Novikov-Thorne normalized temperature factor T(r) / T_peak in [0, 1].
 * T(r) proportional to [ r^-3 * (1 - sqrt(r_in / r)) ]^(1/4), peaking at (49/36) * r_in.
 */
export function novikovThorneTempNorm(r: number, rIn: number = BH_DISK_R_IN): number {
  if (r <= rIn) return 0.0;
  const f = (rad: number) => {
    const q = Math.sqrt(rIn / rad);
    return Math.pow(Math.max(0.0, (1.0 - q) / (rad * rad * rad)), 0.25);
  };
  const peak = f((49.0 / 36.0) * rIn);
  return peak > 0 ? f(r) / peak : 0.0;
}

export function flaredDiskHalfHeight(r: number): number {
  const t = Math.max(0.0, Math.min(1.0, (r - BH_DISK_R_IN) / (BH_DISK_R_OUT - BH_DISK_R_IN)));
  const hOverR = BH_DISK_H_OVER_R_MIN + (BH_DISK_H_OVER_R_MAX - BH_DISK_H_OVER_R_MIN) * Math.sqrt(t);
  return r * hOverR;
}

export const glslBhConstantsHeader = /* glsl */ `
#define BH_RS ${BH_RS.toFixed(6)}
#define BH_M ${BH_M.toFixed(6)}
#define BH_PHOTON_R ${BH_PHOTON_SPHERE_R.toFixed(8)}
#define BH_BC ${BH_SHADOW_RADIUS_BC.toFixed(8)}
#define BH_ISCO_R ${BH_ISCO_R.toFixed(6)}
#define BH_DISK_R_IN ${BH_DISK_R_IN.toFixed(6)}
#define BH_DISK_R_OUT ${BH_DISK_R_OUT.toFixed(6)}
#define BH_DISK_R_TAPER ${BH_DISK_R_TAPER.toFixed(6)}
#define BH_SCREEN_TIME_SCALE ${BH_SCREEN_TIME_SCALE.toFixed(8)}
#define BH_H_MIN ${BH_DISK_H_OVER_R_MIN.toFixed(6)}
#define BH_H_MAX ${BH_DISK_H_OVER_R_MAX.toFixed(6)}
#define BH_KERR_A ${BH_KERR_SPIN_A.toFixed(6)}
#define BH_KERR_ISCO_R ${BH_KERR_ISCO_R.toFixed(6)}
#define BH_LUT_PHI_MAX ${BH_LUT_DIMS.phiMax.toFixed(8)}
#define BH_LUT_B_MAX ${BH_LUT_DIMS.bMax.toFixed(6)}
#define BH_LUT_SPLIT_CAP ${BH_LUT_DIMS.bSplitCapture.toFixed(6)}
#define BH_LUT_SPLIT_STRONG ${BH_LUT_DIMS.bSplitStrong.toFixed(6)}
#define BH_LUT_STRONG_SPAN ${BH_LUT_DIMS.bStrongSpan.toFixed(6)}
#define BH_LUT_STRONG_EPS ${BH_LUT_DIMS.bStrongEps.toExponential(6)}
#define BH_LUT_TEMP_MIN ${BH_LUT_DIMS.tempMinK.toFixed(2)}
#define BH_LUT_TEMP_MAX ${BH_LUT_DIMS.tempMaxK.toFixed(2)}
#define BH_LUT_TEMP_PEAK ${BH_LUT_DIMS.tempDiskPeakK.toFixed(2)}
#define BH_SKY_HDR_SCALE ${BH_LUT_DIMS.skyHdrScale.toFixed(4)}
`;
