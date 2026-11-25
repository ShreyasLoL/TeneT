import { describe, expect, it } from 'vitest';
import { SharedClock } from './clock';

describe('SharedClock', () => {
  it('clamps dt across long pauses, auto-removes subscribers returning false, and pauses when hidden', () => {
    const clock = new SharedClock();
    const gsapTimes: number[] = [];
    let removedDefaultTicker = false;

    clock.bindGsap({
      ticker: {
        remove: () => {
          removedDefaultTicker = true;
        },
        lagSmoothing: () => undefined,
      },
      updateRoot: (t) => {
        gsapTimes.push(t);
      },
    });
    expect(removedDefaultTicker).toBe(true);

    const order: string[] = [];
    const dts: number[] = [];
    let ticks = 0;
    clock.subscribe((_now, dt) => {
      order.push('physics');
      dts.push(dt);
      ticks++;
      return ticks < 3;
    });
    clock.subscribeRender(() => {
      order.push('render');
      return ticks < 3;
    });

    clock.stepManual(1000);
    expect(order).toEqual(['physics', 'render']);

    // Simulate 10-second background gap -> must clamp dtSec <= 0.05
    clock.stepManual(11_000);
    expect(dts[1]).toBeLessThanOrEqual(0.05);

    // Hidden tab does zero work
    clock.setHidden(true);
    clock.stepManual(11_016);
    expect(ticks).toBe(2);

    // Resume and complete final tick -> auto-unsubscribe both phases
    clock.setHidden(false);
    clock.stepManual(11_032);
    expect(ticks).toBe(3);
    expect(clock.subscriberCount()).toBe(0);
    expect(gsapTimes).toHaveLength(3);
  });
});
