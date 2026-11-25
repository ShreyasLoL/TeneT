import { describe, expect, it } from 'vitest';
import {
  deterministicScrubState,
  inverseTapeOffset,
  ringEmergence,
  tapeOffset,
} from './timeTape';

describe('timeTape fisheye, ring emergence, and palindrome scrub symmetry', () => {
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

  it('produces identical ring emergence and cohort state after scrubbing forward then backward', () => {
    const startCursor = 14;
    const t0 = 12.5;
    const initial = deterministicScrubState(startCursor, t0, 60);

    // Scrub backward 12 days step by step, then forward 12 days back to startCursor
    let cursor = startCursor;
    for (let step = 0; step < 12; step++) cursor -= 1;
    const mid = deterministicScrubState(cursor, t0, 60);
    expect(mid.emergences).not.toEqual(initial.emergences);

    for (let step = 0; step < 12; step++) cursor += 1;
    expect(cursor).toBe(startCursor);
    const restored = deterministicScrubState(cursor, t0, 60);

    expect([...restored.phases]).toEqual([...initial.phases]);
    expect([...restored.emergences]).toEqual([...initial.emergences]);
    expect(ringEmergence(Math.ceil(startCursor) + 1, startCursor)).toBe(1);
  });
});
