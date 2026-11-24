import { describe, expect, it } from 'vitest';
import { projectPace } from './goals';
import { currentStreak, linearFit, longestStreak, sealRate } from './stats';

describe('streaks', () => {
  const sealed = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'];

  it('counts back from today when sealed', () => {
    expect(currentStreak(sealed, '2026-11-23')).toBe(4);
  });

  it('is still alive tonight if only yesterday is sealed', () => {
    expect(currentStreak(sealed, '2026-11-24')).toBe(4);
  });

  it('breaks after a missed night', () => {
    expect(currentStreak(sealed, '2026-11-25')).toBe(0);
  });

  it('finds the longest streak across gaps', () => {
    expect(longestStreak([...sealed, '2026-11-25', '2026-11-26'])).toBe(4);
    expect(longestStreak([])).toBe(0);
  });

  it('computes seal rate over a window', () => {
    expect(sealRate(sealed, '2026-11-20', '2026-11-25')).toBeCloseTo(4 / 6);
  });
});

describe('linearFit', () => {
  it('fits a line and rejects degenerate input', () => {
    const fit = linearFit([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ]);
    expect(fit?.slope).toBeCloseTo(2);
    expect(fit?.intercept).toBeCloseTo(1);
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull();
    expect(linearFit([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toBeNull();
  });
});

describe('projectPace', () => {
  const series = (start: string, values: number[]) =>
    values.map((value, i) => ({
      day: `2026-11-${String(Number(start.slice(-2)) + i).padStart(2, '0')}`,
      value,
    }));

  it('reports achieved when the latest value passes the target', () => {
    expect(projectPace({ series: series('2026-11-01', [60, 70, 81]), target: 80, direction: 'up' }).status).toBe(
      'achieved',
    );
  });

  it('projects an ETA at the current pace (up)', () => {
    const r = projectPace({ series: series('2026-11-01', [60, 62, 64, 66]), target: 80, direction: 'up' });
    expect(r.status).toBe('on_track');
    expect(r.slopePerDay).toBeCloseTo(2);
    expect(r.etaDay).toBe('2026-11-11'); // 66 + 2/day -> 80 after 7 days from Nov 4
  });

  it('works for targets going down', () => {
    const r = projectPace({ series: series('2026-11-01', [90, 89, 88]), target: 85, direction: 'down' });
    expect(r.status).toBe('on_track');
    expect(r.etaDay).toBe('2026-11-06');
  });

  it('compares the ETA to the deadline', () => {
    const base = { series: series('2026-11-01', [60, 61, 62]), target: 80, direction: 'up' as const };
    // 1/day from Nov 3: reaches 80 on Nov 21
    expect(projectPace({ ...base, deadline: '2026-11-10' }).status).toBe('behind');
    expect(projectPace({ ...base, deadline: '2026-12-01' }).status).toBe('on_track');
  });

  it('flags stalled when flat or moving the wrong way', () => {
    expect(projectPace({ series: series('2026-11-01', [70, 70, 70]), target: 80, direction: 'up' }).status).toBe(
      'stalled',
    );
    expect(projectPace({ series: series('2026-11-01', [70, 68, 66]), target: 80, direction: 'up' }).status).toBe(
      'stalled',
    );
  });

  it('handles little or no data', () => {
    expect(projectPace({ series: [], target: 1, direction: 'up' }).status).toBe('no_data');
    expect(projectPace({ series: series('2026-11-01', [5]), target: 10, direction: 'up' }).status).toBe('no_data');
  });
});
