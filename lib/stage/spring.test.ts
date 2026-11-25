import { describe, expect, it } from 'vitest';
import { rubberBand, stepCriticallyDampedSpring } from './spring';

describe('stepCriticallyDampedSpring and rubberBand', () => {
  it('converges monotonically to target with zero overshoot from rest and smoothly retargets mid-flight', () => {
    let x = 0;
    let v = 0;
    for (let i = 0; i < 240; i++) {
      const s = stepCriticallyDampedSpring(x, v, 100, 18, 1 / 60);
      expect(s.value).toBeLessThanOrEqual(100.0001);
      expect(s.value).toBeGreaterThanOrEqual(x - 1e-6);
      x = s.value;
      v = s.velocity;
      if (s.done) break;
    }
    expect(x).toBe(100);
    expect(v).toBe(0);

    // Mid-flight reversal preserves finite velocity without discontinuity
    let rx = 0;
    let rv = 0;
    for (let i = 0; i < 6; i++) {
      const s = stepCriticallyDampedSpring(rx, rv, 50, 16, 1 / 60);
      rx = s.value;
      rv = s.velocity;
    }
    expect(rv).toBeGreaterThan(0);
    const reversed = stepCriticallyDampedSpring(rx, rv, 10, 16, 1 / 60);
    expect(Number.isFinite(reversed.value)).toBe(true);
    expect(Math.abs(reversed.value - rx)).toBeLessThan(15);
  });

  it('rubberBand is odd, strictly sub-linear, and bounded by dimension', () => {
    expect(rubberBand(0, 200)).toBe(0);
    let prev = 0;
    for (const d of [10, 40, 100, 300, 1000]) {
      const r = rubberBand(d, 200);
      expect(r).toBeGreaterThan(prev);
      expect(r).toBeLessThan(d);
      expect(r).toBeLessThan(200);
      expect(rubberBand(-d, 200)).toBeCloseTo(-r, 10);
      prev = r;
    }
  });
});
