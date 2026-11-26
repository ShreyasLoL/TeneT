import { describe, expect, it } from 'vitest';
import {
  BootCalibrator,
  CameraMotionTracker,
  QualityController,
} from './qualityController';

describe('qualityController', () => {
  it('calibrates boot tier accurately after 3 warmup frames and 300ms window', () => {
    const fast = new BootCalibrator(2);
    for (let i = 0; i < 45; i++) fast.pushFrame(8.5);
    expect(fast.isSettled).toBe(true);
    expect(fast.resultTier).toBe(2);

    const mid = new BootCalibrator(2);
    for (let i = 0; i < 30; i++) mid.pushFrame(15.2);
    expect(mid.isSettled).toBe(true);
    expect(mid.resultTier).toBe(1);

    const slow = new BootCalibrator(2);
    for (let i = 0; i < 16; i++) slow.pushFrame(32.0);
    expect(slow.isSettled).toBe(true);
    expect(slow.resultTier).toBe(0);
  });

  it('tracks camera angular and zoom motion with asymmetric hysteresis', () => {
    const tracker = new CameraMotionTracker();
    tracker.update(0, 3, 28, 1 / 60);
    // Fast camera swing
    let m = 0;
    for (let i = 1; i <= 6; i++) {
      m = tracker.update(i * 1.4, 3, 28 - i * 1.1, 1 / 60);
    }
    expect(m).toBeGreaterThan(0.5);

    // Camera stops: slow ease-out tail release
    const afterOne = tracker.update(8.4, 3, 21.4, 1 / 60);
    expect(afterOne).toBeGreaterThan(m * 0.85);
    let afterMany = afterOne;
    for (let i = 0; i < 90; i++) {
      afterMany = tracker.update(8.4, 3, 21.4, 1 / 60);
    }
    expect(afterMany).toBeLessThan(0.05);
  });

  it('drops renderScale then steps down tier under sustained overload without oscillation', () => {
    const qc = new QualityController(null, false, 2, 1.5);
    // Fast boot settles at T2
    for (let i = 0; i < 45; i++) {
      qc.step({
        cpuFrameMs: 8.0,
        dtSec: 1 / 60,
        camX: 0,
        camY: 3.9,
        camZ: 27.7,
        lowPower: false,
        manualTierOverride: false,
      });
    }

    // Sustained 42ms overload (~6x CPU throttle): should step down to T1 then T0 cleanly
    let lastTier = 2;
    let res = qc.step({
      cpuFrameMs: 42.0,
      dtSec: 0.033,
      camX: 0,
      camY: 3.9,
      camZ: 27.7,
      lowPower: false,
      manualTierOverride: false,
    });
    for (let i = 0; i < 25; i++) {
      res = qc.step({
        cpuFrameMs: 42.0,
        dtSec: 0.033,
        camX: 0,
        camY: 3.9,
        camZ: 27.7,
        lowPower: false,
        manualTierOverride: false,
      });
      expect(res.tier).toBeLessThanOrEqual(lastTier);
      lastTier = res.tier;
    }
    expect(res.tier).toBe(0);
    expect(res.renderScale).toBeCloseTo(0.5, 2);
    expect(res.recommendedDpr).toBe(1.0);
  });
});
