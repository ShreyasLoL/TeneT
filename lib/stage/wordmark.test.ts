import { describe, expect, it } from 'vitest';
import { buildWordmarkTargets } from './wordmark';

describe('buildWordmarkTargets', () => {
  it('generates strictly symmetric wordmark targets mirrored across x = 0', () => {
    const count = 6000;
    const half = count / 2;
    const pts = buildWordmarkTargets(count);
    expect(pts.length).toBe(count * 3);

    for (let i = 0; i < half; i++) {
      const li = i * 3;
      const ri = (half + i) * 3;
      expect(pts[li]).toBeCloseTo(-pts[ri], 6);
      expect(pts[li + 1]).toBeCloseTo(pts[ri + 1], 6);
      expect(pts[li + 2]).toBeCloseTo(pts[ri + 2], 6);
    }
  });
});
