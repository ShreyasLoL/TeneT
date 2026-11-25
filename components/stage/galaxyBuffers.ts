import { NORMAL_GALAXY_PARTICLES } from '@/lib/stage/tiers';

export const MAX_GALAXY_PARTICLES = NORMAL_GALAXY_PARTICLES; // 34,000 (+ 14,000 BH = 48,000 <= 50k)

const R_BULGE_MIN = 1.35;
const R_BULGE_MAX = 5.8;
const R_ARM_MIN = 3.1;
const R_ARM_MAX = 25.5;
const SPIRAL_WINDING = 2.65;

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

function gaussianRand(rng: () => number): number {
  const u1 = Math.max(1e-6, rng());
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
}

export type GalaxyBuffers = {
  /** Dummy/tick origin XYZ (`vec3`) */
  origins: Float32Array;
  /** `x`: radius `r`, `y`: base angle `theta0`, `z`: vertical height `yOff`, `w`: rand `[0..1]` */
  seeds: Float32Array;
  /** `x`: population kind (`0`=main arm, `1`=secondary arm, `2`=bulge, `3`=HII knot, `4`=field/fg star), `y`: starlum `[0..1]` */
  meta: Float32Array;
};

/**
 * Deterministic interleaved galaxy particle buffers so `setDrawRange(0, count / 4)` in LOW POWER
 * preserves exact spiral arms, bulge, HII knots, and foreground star ratios.
 */
export function buildGalaxyBuffers(capacity: number = MAX_GALAXY_PARTICLES): GalaxyBuffers {
  const count = Math.min(MAX_GALAXY_PARTICLES, Math.max(1, capacity));
  const rng = mulberry32(420719);

  const origins = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const meta = new Float32Array(count * 2);

  // Prebuild 20 compact HII star-forming knot anchors along the 2 main logarithmic arms
  const knots: Array<{ r: number; theta: number }> = [];
  for (let k = 0; k < 20; k++) {
    const arm = k % 2;
    const kr = 4.2 + (k / 20) * 14.5 + (rng() - 0.5) * 0.8;
    const kTheta = SPIRAL_WINDING * Math.log(kr / 2.8) + arm * Math.PI + (rng() - 0.5) * 0.12;
    knots.push({ r: kr, theta: kTheta });
  }

  for (let i = 0; i < count; i++) {
    const bucket = i % 25;
    // Interleaved populations:
    // 0..10 (44%): 2 main spiral arms
    // 11..14 (16%): 2 faint secondary spiral arms
    // 15..19 (20%): dense central bulge
    // 20..21 (8%): HII pink/orchid knots along main arms
    // 22..24 (12%): scattered star field + bright foreground stars
    let kind = 0;
    let r = 6.0;
    let theta = 0;
    let yOff = 0;
    let lum = rng();

    if (bucket <= 10) {
      kind = 0;
      const arm = i % 2;
      r = R_ARM_MIN + Math.pow(rng(), 1.16) * (R_ARM_MAX - R_ARM_MIN);
      const baseTheta = SPIRAL_WINDING * Math.log(r / 2.8) + arm * Math.PI;
      const spread = 0.16 + 0.14 * ((r - R_ARM_MIN) / (R_ARM_MAX - R_ARM_MIN));
      theta = baseTheta + gaussianRand(rng) * spread;
      yOff = gaussianRand(rng) * (0.11 + 0.018 * r);
    } else if (bucket <= 14) {
      kind = 1;
      const arm = i % 2;
      r = R_ARM_MIN + 0.8 + Math.pow(rng(), 1.25) * (R_ARM_MAX - R_ARM_MIN - 2.0);
      const baseTheta = SPIRAL_WINDING * Math.log(r / 2.8) + arm * Math.PI + Math.PI * 0.52;
      theta = baseTheta + gaussianRand(rng) * 0.24;
      yOff = gaussianRand(rng) * (0.14 + 0.02 * r);
      lum *= 0.62;
    } else if (bucket <= 19) {
      kind = 2;
      r = R_BULGE_MIN + Math.pow(rng(), 1.9) * (R_BULGE_MAX - R_BULGE_MIN);
      theta = rng() * Math.PI * 2;
      const bulgeThickness = 0.55 * Math.exp(-(r - R_BULGE_MIN) * 0.35) + 0.08;
      yOff = gaussianRand(rng) * bulgeThickness;
      lum = 0.35 + 0.65 * lum;
    } else if (bucket <= 21) {
      kind = 3;
      const knot = knots[i % knots.length];
      r = Math.max(3.2, knot.r + gaussianRand(rng) * 0.32);
      theta = knot.theta + (gaussianRand(rng) * 0.32) / Math.max(2.0, r);
      yOff = gaussianRand(rng) * 0.09;
      lum = 0.55 + 0.45 * lum;
    } else {
      kind = 4;
      const isForegroundHero = rng() > 0.955;
      r = isForegroundHero
        ? 2.2 + rng() * 16.0
        : 2.4 + Math.pow(rng(), 0.92) * (R_ARM_MAX + 2.0);
      theta = rng() * Math.PI * 2;
      yOff = gaussianRand(rng) * (isForegroundHero ? 1.85 : 0.75 + 0.05 * r);
      lum = isForegroundHero ? 0.94 + 0.06 * rng() : 0.22 + 0.55 * lum;
    }

    seeds[i * 4] = r;
    seeds[i * 4 + 1] = theta;
    seeds[i * 4 + 2] = yOff;
    seeds[i * 4 + 3] = rng();

    meta[i * 2] = kind;
    meta[i * 2 + 1] = lum;

    // Initial clock-tick spoke coordinates for smooth intro condensation (0.8-2.0s)
    const spoke = (Math.floor(rng() * 60) / 60) * Math.PI * 2;
    const spokeR = 2.6 + rng() * 4.2;
    origins[i * 3] = Math.cos(spoke) * spokeR;
    origins[i * 3 + 1] = (rng() - 0.5) * 0.25;
    origins[i * 3 + 2] = Math.sin(spoke) * spokeR;
  }

  return { origins, seeds, meta };
}
