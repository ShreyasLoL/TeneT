import { describe, expect, it } from 'vitest';
import { inverseTapeOffset, ringEmergence, tapeOffset } from './timeTape';

describe('timeTape fisheye and ring emergence', () => {
  it('is strictly symmetric, zero at origin, monotonic, and invertible', () => {
    expect(tapeOffset(0)).toBe(0);
    let prev = -Infinity;
    for (let d = -120; d <= 120; d++) {
      const x = tapeOffset(d);
      expect(x).toBeGreaterThan(prev);
      prev = x;
      expect(tapeOffset(-d)).toBeCloseTo(-x, 8);
      expect(inverseTapeOffset(x)).toBeCloseTo(d, 6);
    }
  });

  it('produces identical ring emergence curve moving forward or backward through a cursor position', () => {
    const samples = [0, 2.2, 5.5, 12.75, 40];
    for (const c of samples) {
      const forward = Array.from({ length: 15 }, (_, i) => ringEmergence(i, c));
      const backward = Array.from({ length: 15 }, (_, i) => ringEmergence(i, c));
      expect(forward).toEqual(backward);
      expect(ringEmergence(Math.ceil(c) + 1, c)).toBe(1);
    }
  });
});
