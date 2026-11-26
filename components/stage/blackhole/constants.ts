/**
 * Single source of truth for Schwarzschild metric, camera, disk, and quality constants.
 * Geometrised units: G = c = 1, Schwarzschild radius r_s = 1 (mass M = 0.5).
 */

export const RS = 1.0;
export const MASS_M = 0.5;
export const PHOTON_SPHERE_R = 1.5;
export const PHOTON_SPHERE_U = 1.0 / PHOTON_SPHERE_R;
export const SHADOW_RADIUS_BC = (3.0 * Math.sqrt(3.0)) / 2.0; // ~2.598076211353316 rs
export const ISCO_R = 3.0;
export const DISK_INNER_R = ISCO_R;
export const DISK_OUTER_R = 15.5;

export const CAMERA_DISTANCE_DEFAULT = 42.0; // 40..60 rs
export const CAMERA_INCLINATION_DEG = 85.0; // 80..88 deg from pole (near edge-on)
export const CAMERA_INCLINATION_RAD = (CAMERA_INCLINATION_DEG * Math.PI) / 180.0;
export const CAMERA_AZIMUTH_RAD = 0.0;
export const CAMERA_ROLL_RAD = -0.39; // -22.3 deg diagonal composition
export const CAMERA_FOV_DEG = 34.0;
export const DOPPLER_STRENGTH_DEFAULT = 0.72;

export const INTEGRATOR_STEPS_LOW = 24;
export const INTEGRATOR_STEPS_MID = 48;
export const INTEGRATOR_STEPS_FULL = 64;
export const INTEGRATOR_STEPS_HIGH = 96;

export const ANALYTIC_B_START = 16.5;
export const ANALYTIC_B_END = 19.5;

export type GravitySample = {
  omega: number;
  vOrb: number;
  timeDilation: number;
  tidal: number;
  weakDeflection: number;
};

/** Physical Schwarzschild + Keplerian quantities at radius r (in units of r_s). */
export function gravity(r: number): GravitySample {
  const safeR = Math.max(r, RS * 1.0001);
  const omega = Math.sqrt(MASS_M / (safeR * safeR * safeR));
  const vOrb = Math.sqrt(MASS_M / safeR);
  const timeDilation = Math.sqrt(Math.max(0, 1.0 - RS / safeR));
  const tidal = MASS_M / (safeR * safeR * safeR);
  const weakDeflection = 2.0 / Math.max(safeR, 0.5);
  return { omega, vOrb, timeDilation, tidal, weakDeflection };
}

/** Relativistic impact parameter b seen by a static observer at r0 and local ray angle alpha. */
export function impactParameterFromAngle(r0: number, sinAlpha: number): number {
  const lapse0 = Math.sqrt(Math.max(1.0 - RS / r0, 1e-6));
  return (r0 * sinAlpha) / lapse0;
}

function duDeriv(u: number): number {
  return 1.5 * u * u - u;
}

/**
 * Pure TypeScript mirror of the fragment shader's adaptive-step RK4 null geodesic solver
 * on u'' + u = 1.5 * u^2 (u = 1 / r), blending into finite-r0 weak-field deflection for large b.
 */
export function traceGeodesicCpu(
  r0: number,
  alphaRad: number,
  maxSteps: number = INTEGRATOR_STEPS_FULL,
): { captured: boolean; phiEsc: number; b: number; stepsUsed: number } {
  const cosAlpha = Math.max(-1, Math.min(1, Math.cos(alphaRad)));
  const sinAlpha = Math.max(0, Math.sin(alphaRad));
  const b = impactParameterFromAngle(r0, sinAlpha);

  const phiFlat = Math.PI - alphaRad;
  const deltaPhiWeak =
    (1.0 + cosAlpha) / Math.max(b, 0.5) +
    ((15.0 / 32.0) * (1.0 + cosAlpha) * phiFlat) / Math.max(b * b, 0.5);
  const phiWeak = phiFlat + deltaPhiWeak;

  if (cosAlpha > 0 && b < SHADOW_RADIUS_BC * 0.96) {
    return { captured: true, phiEsc: Math.PI, b, stepsUsed: 0 };
  }
  if (b >= ANALYTIC_B_END || cosAlpha <= -0.25) {
    return { captured: false, phiEsc: phiWeak, b, stepsUsed: 0 };
  }

  let u = 1.0 / r0;
  let du = cosAlpha / Math.max(b, 1e-5);
  let phi = 0.0;
  let captured = false;
  let escaped = false;
  let stepsUsed = 0;

  const stepScale = 64.0 / Math.max(maxSteps, 1);
  for (let step = 0; step < 96; step++) {
    if (step >= maxSteps) break;
    stepsUsed = step + 1;

    const nearPhoton = Math.max(0, Math.min(1, (u - 0.18) / (0.64 - 0.18)));
    const smoothNear = nearPhoton * nearPhoton * (3 - 2 * nearPhoton);
    const h = (0.28 + (0.088 - 0.28) * smoothNear) * stepScale;

    const k1u = du;
    const k1du = duDeriv(u);

    const u2 = u + 0.5 * h * k1u;
    const du2 = du + 0.5 * h * k1du;
    const k2u = du2;
    const k2du = duDeriv(u2);

    const u3 = u + 0.5 * h * k2u;
    const du3 = du + 0.5 * h * k2du;
    const k3u = du3;
    const k3du = duDeriv(u3);

    const u4 = u + h * k3u;
    const du4 = du + h * k3du;
    const k4u = du4;
    const k4du = duDeriv(u4);

    const uNext = u + (h / 6.0) * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    const duNext = du + (h / 6.0) * (k1du + 2.0 * k2du + 2.0 * k3du + k4du);

    if (uNext >= 1.0) {
      captured = true;
      phi += h;
      break;
    }
    if (uNext <= 0.0 && duNext < 0.0) {
      const frac = Math.max(0, Math.min(1, u / Math.max(u - uNext, 1e-6)));
      phi += h * frac;
      escaped = true;
      break;
    }

    u = uNext;
    du = duNext;
    phi += h;
  }

  if (!captured && !escaped && du < -1e-5) {
    phi += Math.max(0, Math.min(0.8, u / -du));
  }

  const tWeak = Math.max(0, Math.min(1, (b - ANALYTIC_B_START) / (ANALYTIC_B_END - ANALYTIC_B_START)));
  const sWeak = tWeak * tWeak * (3 - 2 * tWeak);
  const phiEsc = phi + (phiWeak - phi) * sWeak;

  return { captured, phiEsc, b, stepsUsed };
}
