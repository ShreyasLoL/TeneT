import { describe, expect, it } from 'vitest';
import {
  BH_DISK_R_IN,
  BH_DISK_R_OUT,
  BH_ISCO_R,
  BH_ISCO_SCREEN_PERIOD_SEC,
  BH_M,
  BH_PHOTON_SPHERE_R,
  BH_RS,
  BH_SHADOW_RADIUS_BC,
  bToLutU,
  gravity,
  lutUToB,
  novikovThorneTempNorm,
  observedFrequencyShiftG,
} from './constants';

describe('black hole single-source-of-truth constants & gravity(r)', () => {
  it('matches exact Schwarzschild geometric ratios (G=c=1, rs=1, M=0.5)', () => {
    expect(BH_RS).toBe(1.0);
    expect(BH_M).toBe(0.5);
    expect(BH_PHOTON_SPHERE_R).toBeCloseTo(1.5, 10);
    expect(BH_SHADOW_RADIUS_BC).toBeCloseTo((3 * Math.sqrt(3)) / 2, 10);
    expect(BH_ISCO_R).toBeCloseTo(3.0, 10);
  });

  it('scales orbital period as r^1.5 with ISCO period = 8s and ~11.18x outer ratio', () => {
    const inner = gravity(BH_DISK_R_IN);
    const outer = gravity(BH_DISK_R_OUT);
    expect(inner.orbitalPeriodScreenSec).toBeCloseTo(BH_ISCO_SCREEN_PERIOD_SEC, 6);
    const ratio = outer.orbitalPeriodScreenSec / inner.orbitalPeriodScreenSec;
    expect(ratio).toBeCloseTo(Math.pow(BH_DISK_R_OUT / BH_DISK_R_IN, 1.5), 6);
    expect(ratio).toBeGreaterThan(10.5);
    expect(ratio).toBeLessThan(12.0);
  });

  it('exhibits strong near-vs-far gravity gradients (dilation, tidal M/r^3, deflection)', () => {
    const near = gravity(BH_ISCO_R);
    const far = gravity(BH_DISK_R_OUT);
    expect(near.timeDilation).toBeCloseTo(Math.sqrt(1 - 1 / 3), 8);
    expect(near.timeDilation).toBeLessThan(far.timeDilation);
    expect(near.tidal / far.tidal).toBeCloseTo(Math.pow(BH_DISK_R_OUT / BH_ISCO_R, 3), 6);
    expect(near.vOrb).toBeGreaterThan(far.vOrb);
    const m = BH_M;
    expect(gravity(1000).deflection).toBeCloseTo((4 * m) / 1000, 5);
    expect(gravity(1000).deflection).toBeCloseTo(
      (4 * m) / 1000 + (15 * Math.PI * m * m) / (4 * 1000 * 1000),
      10,
    );
  });

  it('peaks Novikov-Thorne temperature at 49/36 * r_in', () => {
    const rPeak = (49 / 36) * BH_DISK_R_IN;
    expect(novikovThorneTempNorm(rPeak)).toBeCloseTo(1.0, 6);
    expect(novikovThorneTempNorm(BH_DISK_R_IN)).toBe(0);
    expect(novikovThorneTempNorm(rPeak * 0.9)).toBeLessThan(1.0);
    expect(novikovThorneTempNorm(rPeak * 1.3)).toBeLessThan(1.0);
  });

  it('gives strong Doppler asymmetry between approaching and receding sides', () => {
    const r = 4.0;
    const b = 4.0;
    const sinTheta0 = Math.sin((83.5 * Math.PI) / 180);
    const gApproach = observedFrequencyShiftG(r, b, sinTheta0, -1, 1);
    const gRecede = observedFrequencyShiftG(r, b, sinTheta0, +1, 1);
    expect(gApproach).toBeGreaterThan(1.0);
    expect(gRecede).toBeLessThan(0.75);
    expect(Math.pow(gApproach / gRecede, 4)).toBeGreaterThan(4.5);
  });

  it('inverts non-uniform b <-> LUT coordinate cleanly across all regimes', () => {
    for (const b of [0.0, 1.2, BH_SHADOW_RADIUS_BC, BH_SHADOW_RADIUS_BC + 0.001, 4.5, 12.0, 60.0]) {
      const u = bToLutU(b);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(lutUToB(u)).toBeCloseTo(b, 5);
    }
  });
});
