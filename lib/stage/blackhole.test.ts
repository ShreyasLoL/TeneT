import { describe, expect, it } from 'vitest';
import {
  ANALYTIC_B_START,
  CAMERA_DISTANCE_DEFAULT,
  DISK_OUTER_R,
  ISCO_R,
  PHOTON_SPHERE_R,
  SHADOW_RADIUS_BC,
  gravity,
  impactParameterFromAngle,
  traceGeodesicCpu,
} from '@/components/stage/blackhole/constants';
import { blackHoleDiskGlsl } from '@/components/stage/shaders/blackholeDisk.glsl';

describe('Schwarzschild constants & null geodesic integrator', () => {
  it('defines exact relativistic radii in G=c=rs=1 units', () => {
    expect(SHADOW_RADIUS_BC).toBeCloseTo((3 * Math.sqrt(3)) / 2, 10);
    expect(SHADOW_RADIUS_BC).toBeCloseTo(2.59807621135, 8);
    expect(PHOTON_SPHERE_R).toBe(1.5);
    expect(ISCO_R).toBe(3.0);
  });

  it('maintains r^1.5 Keplerian period ratio and exact Schwarzschild time dilation', () => {
    const gInner = gravity(ISCO_R);
    const gOuter = gravity(DISK_OUTER_R);
    const periodRatio = gInner.omega / gOuter.omega;
    expect(periodRatio).toBeCloseTo((DISK_OUTER_R / ISCO_R) ** 1.5, 6);
    expect(periodRatio).toBeGreaterThan(9.5);

    const gPhoton = gravity(PHOTON_SPHERE_R);
    expect(gPhoton.timeDilation).toBeCloseTo(Math.sqrt(1 / 3), 8);
  });

  it('captures b < b_c and escapes b > b_c tightly around 2.598 rs', () => {
    const r0 = CAMERA_DISTANCE_DEFAULT;
    const lapse0 = Math.sqrt(1 - 1 / r0);

    const alphaForB = (b: number) => Math.asin((b * lapse0) / r0);

    const inside = traceGeodesicCpu(r0, alphaForB(2.58));
    const outside = traceGeodesicCpu(r0, alphaForB(2.62));
    expect(inside.b).toBeCloseTo(2.58, 6);
    expect(outside.b).toBeCloseTo(2.62, 6);
    expect(inside.captured).toBe(true);
    expect(outside.captured).toBe(false);

    // Binary search critical threshold from RK4 at default 64 steps
    let lo = 2.54;
    let hi = 2.66;
    for (let i = 0; i < 24; i++) {
      const mid = 0.5 * (lo + hi);
      const res = traceGeodesicCpu(r0, alphaForB(mid));
      if (res.captured) lo = mid;
      else hi = mid;
    }
    const critB = 0.5 * (lo + hi);
    expect(Math.abs(critB - SHADOW_RADIUS_BC)).toBeLessThan(0.015);
  });

  it('matches weak-field analytic deflection smoothly across handoff zone', () => {
    const r0 = CAMERA_DISTANCE_DEFAULT;
    const lapse0 = Math.sqrt(1 - 1 / r0);
    const alpha = Math.asin((ANALYTIC_B_START * lapse0) / r0);
    const rk = traceGeodesicCpu(r0, alpha);
    const analyticPhi =
      Math.PI -
      alpha +
      (1 + Math.cos(alpha)) / ANALYTIC_B_START +
      ((15 / 32) * (1 + Math.cos(alpha)) * (Math.PI - alpha)) / (ANALYTIC_B_START * ANALYTIC_B_START);
    expect(rk.captured).toBe(false);
    expect(impactParameterFromAngle(r0, Math.sin(alpha))).toBeCloseTo(ANALYTIC_B_START, 6);
    expect(Math.abs(rk.phiEsc - analyticPhi)).toBeLessThan(0.005);
  });

  it('uses C1-continuous variance-preserving two-phase flow weights and integrated uDiskTime', () => {
    expect(blackHoleDiskGlsl).toContain('0.5 + 0.5 * cos(phaseA * 6.2831853)');
    expect(blackHoleDiskGlsl).not.toContain('0.5 - 0.5 * cos(phaseA * 6.2831853)');
    expect(blackHoleDiskGlsl).toContain('inversesqrt(wA * wA + wB * wB)');
    expect(blackHoleDiskGlsl).toContain('sampleDiskStructure(rCross, phiDisk, uDiskTime, isTopFace)');
    expect(blackHoleDiskGlsl).not.toContain('uTime * dirSign');

    for (const phaseA of [0, 0.25, 0.5, 0.75, 1]) {
      const wB = 0.5 + 0.5 * Math.cos(phaseA * 2 * Math.PI);
      const wA = 1 - wB;
      const invNorm = 1 / Math.sqrt(wA * wA + wB * wB);
      if (phaseA === 0 || phaseA === 1) expect(wA).toBeCloseTo(0, 10);
      if (phaseA === 0.5) expect(wB).toBeCloseTo(0, 10);
      expect((wA * invNorm) ** 2 + (wB * invNorm) ** 2).toBeCloseTo(1, 10);
    }
  });
});
