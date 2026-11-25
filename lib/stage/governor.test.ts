import { describe, expect, it } from 'vitest';
import { FrameGovernor } from './governor';

describe('FrameGovernor', () => {
  it('ignores warmup frames and >100ms idle gaps, then steps down after sustained >18ms p95', () => {
    const gov = new FrameGovernor(0, 0);
    let t = 0;

    for (let i = 0; i < 30; i++) {
      t += 25;
      expect(gov.pushFrame(25, t).changed).toBe(false);
    }

    for (let i = 0; i < 40; i++) {
      t += 200;
      expect(gov.pushFrame(250, t).level).toBe(0);
    }

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

    for (let i = 0; i < 30; i++) {
      t += 8;
      gov.pushFrame(8, t);
    }

    for (let i = 0; i < 400; i++) {
      t += 16;
      const res = gov.pushFrame(8, t);
      if (t < 10_000) expect(res.level).toBe(2);
    }

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

  it('enforces hysteresis deadband (13ms..18ms) and 10s minimum dwell with zero oscillation', () => {
    const gov = new FrameGovernor(1, 0);
    let t = 0;
    let changes = 0;

    // Alternating 14ms / 17.5ms inside hysteresis deadband for 60s -> zero tier changes
    for (let i = 0; i < 3600; i++) {
      t += 16;
      const sample = i % 2 === 0 ? 14.2 : 17.6;
      const res = gov.pushFrame(sample, t);
      if (res.changed) changes++;
    }
    expect(changes).toBe(0);
    expect(gov.getLevel()).toBe(1);

    // Even under extreme load (30ms/frame), never steps below L3 and never changes twice within 10s
    let lastChangeTime = -Infinity;
    for (let i = 0; i < 3000; i++) {
      t += 30;
      const res = gov.pushFrame(30, t);
      if (res.changed) {
        expect(t - lastChangeTime).toBeGreaterThanOrEqual(10_000);
        lastChangeTime = t;
      }
    }
    expect(gov.getLevel()).toBe(3);
  });
});
