import { describe, expect, it } from 'vitest';
import {
  BH_CAMERA_INCLINATION_EDGE_RAD,
  BH_CAMERA_REST_R,
  BH_CAMERA_START_R,
} from './constants';
import { evalIntroCameraSpline } from './cameraSpline';

describe('5-phase C1 continuous intro camera spline', () => {
  it('starts at 40-60 rs and reaches near edge-on inclination (80-85 deg) before settling', () => {
    const sample = { x: 0, y: 0, z: 0, fov: 0, r: 0, theta: 0, phi: 0 };
    evalIntroCameraSpline(0, sample);
    expect(sample.r).toBeCloseTo(BH_CAMERA_START_R, 4);
    expect(sample.r).toBeGreaterThanOrEqual(40);
    expect(sample.r).toBeLessThanOrEqual(60);

    evalIntroCameraSpline(0.86, sample);
    const deg = (sample.theta * 180) / Math.PI;
    expect(deg).toBeGreaterThanOrEqual(80);
    expect(deg).toBeLessThanOrEqual(85);
    expect(sample.theta).toBeCloseTo(BH_CAMERA_INCLINATION_EDGE_RAD, 4);

    evalIntroCameraSpline(1, sample);
    expect(sample.r).toBeCloseTo(BH_CAMERA_REST_R, 4);
  });

  it('maintains C1 velocity continuity across all phase knot boundaries', () => {
    const a = { x: 0, y: 0, z: 0, fov: 0, r: 0, theta: 0, phi: 0 };
    const b = { x: 0, y: 0, z: 0, fov: 0, r: 0, theta: 0, phi: 0 };
    const c = { x: 0, y: 0, z: 0, fov: 0, r: 0, theta: 0, phi: 0 };
    const eps = 1e-4;
    for (const knotS of [0.18, 0.42, 0.68, 0.86]) {
      evalIntroCameraSpline(knotS - eps, a);
      evalIntroCameraSpline(knotS, b);
      evalIntroCameraSpline(knotS + eps, c);
      const vLeft = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / eps;
      const vRight = Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) / eps;
      expect(Math.abs(vLeft - vRight) / Math.max(1, vLeft)).toBeLessThan(0.02);
    }
  });
});
