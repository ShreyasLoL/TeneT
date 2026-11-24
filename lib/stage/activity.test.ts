import { describe, expect, it } from 'vitest';
import { DESKTOP_IDLE_MS, StageActivity, TOUCH_IDLE_MS } from './activity';

describe('StageActivity', () => {
  it('transitions burst -> ambient -> still after grace periods and pauses when hidden', () => {
    const act = new StageActivity(0);
    expect(act.getLevel(1_000)).toBe('ambient');
    expect(act.getLevel(DESKTOP_IDLE_MS + 1)).toBe('still');

    const release = act.acquire('recap');
    expect(act.getLevel(DESKTOP_IDLE_MS + 100)).toBe('burst');

    act.configure({ hidden: true });
    expect(act.getLevel(DESKTOP_IDLE_MS + 100)).toBe('still');

    act.configure({ hidden: false });
    expect(act.getLevel(DESKTOP_IDLE_MS + 100)).toBe('burst');

    release();
    release(); // idempotent
    expect(act.leaseCount()).toBe(0);
    expect(act.getLevel(DESKTOP_IDLE_MS + 100)).toBe('still');

    act.notifyInput(50_000);
    expect(act.getLevel(51_000)).toBe('ambient');
  });

  it('caps touch ambient window to 10s and enforces still under lowPower', () => {
    const act = new StageActivity(0);
    act.configure({ touch: true });
    expect(act.getLevel(TOUCH_IDLE_MS - 100)).toBe('ambient');
    expect(act.getLevel(TOUCH_IDLE_MS + 1)).toBe('still');

    act.configure({ touch: false, lowPower: true });
    expect(act.getLevel(100)).toBe('still');
  });
});
