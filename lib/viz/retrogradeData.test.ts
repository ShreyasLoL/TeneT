import { describe, expect, it } from 'vitest';
import { generateFixtureState } from '@/lib/api/fixtures';
import {
  buildCalendarMatrix,
  buildTimelineWindow,
  computeAreaMomentum,
} from './retrogradeData';

describe('retrogradeData helpers', () => {
  const fx = generateFixtureState({ days: 45, seed: 7, today: '2026-11-27' });

  it('builds contiguous timeline window marking missing days as void', () => {
    const window = buildTimelineWindow(fx.days, '2026-11-27', 30);
    expect(window).toHaveLength(30);
    expect(window[0].day).toBe('2026-10-29');
    expect(window[29].day).toBe('2026-11-27');

    // Fixtures skip voidOffsets [14, 15, 42] before today
    const voids = window.filter((d) => d.isVoid);
    expect(voids.length).toBeGreaterThanOrEqual(2);
    for (const v of voids) {
      expect(v.sealed).toBeNull();
      expect(v.score).toBeNull();
    }
  });

  it('builds aligned 12-week calendar matrix ending on current week', () => {
    const matrix = buildCalendarMatrix(fx.days, '2026-11-27', 12);
    expect(matrix).toHaveLength(84);
    expect(matrix[0].weekday).toBe(0); // Always starts on Monday
    const todayNode = matrix.find((d) => d.day === '2026-11-27');
    expect(todayNode?.future).toBe(false);
    // 2026-11-27 is Friday (weekday 4), so Sat & Sun are future placeholders
    const futureNodes = matrix.filter((d) => d.future);
    expect(futureNodes).toHaveLength(2);
  });

  it('computes per-area momentum rates, deltas, and 14-day series strictly from data', () => {
    const momentum = computeAreaMomentum(fx.days, fx.areas, fx.allTrackables, '2026-11-27');
    expect(momentum).toHaveLength(fx.areas.length);
    for (const item of momentum) {
      expect(item.series).toHaveLength(14);
      expect(item.rate).not.toBeNull();
      expect(item.rate!).toBeGreaterThanOrEqual(0);
      expect(item.rate!).toBeLessThanOrEqual(1);
    }
  });
});
