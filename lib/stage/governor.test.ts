import { describe, expect, it } from 'vitest';
import { FrameGovernor } from './governor';

describe('FrameGovernor', () => {
  it('ignores warmup frames and >100ms idle gaps, then steps down after sustained >18ms p95', () => {
    const gov = new FrameGovernor(0, 0);
    let t = 0;

    // 30 warmup frames
    for (let i = 0; i < 30; i++) {
      t += 25;
      expect(gov.pushFrame(25, t).changed).toBe(false);
    }

    // Idle gaps (>100ms) never count
    for (let i = 0; i < 40; i++) {
      t += 200;
      expect(gov.pushFrame(250, t).level).toBe(0);
    }

    // Push slow frames past 10s dwell + 2s sustain
    t = 10_000;
    let steppedDown = false;
    for (let i = 0; i < 160; i++) {
      t += 24;
      const res = gov.pushFrame(24, t);
      if (res.changed) {
        steppedDown = true;
        expect(res.level).toBe(1);
        break;
      }
    }
    expect(steppedDown).toBe(true);
  });

  it('steps up only after 10s dwell and 10s sustained p95 < 13ms', () => {
    const gov = new FrameGovernor(2, 0);
    let t = 0;

    // Warmup
    for (let i = 0; i < 30; i++) {
      t += 8;
      gov.pushFrame(8, t);
    }

    // First 8 seconds: must stay at level 2
    for (let i = 0; i < 400; i++) {
      t += 16;
      const res = gov.pushFrame(8, t);
      if (t < 10_000) expect(res.level).toBe(2);
    }

    // Continue past 10s sustained low frame time
    let steppedUp = false;
    for (let i = 0; i < 800; i++) {
      t += 16;
      const res = gov.pushFrame(8, t);
      if (res.changed) {
        steppedUp = true;
        expect(res.level).toBe(1);
        break;
      }
    }
    expect(steppedUp).toBe(true);
  });
});
