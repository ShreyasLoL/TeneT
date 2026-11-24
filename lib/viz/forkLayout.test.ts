import { describe, expect, it } from 'vitest';
import { forkLayout } from './forkLayout';

describe('forkLayout', () => {
  it('places left and right doors strictly symmetric around axis x=0 with opposite flow handedness', () => {
    const { axisX, left, right } = forkLayout();
    expect(axisX).toBe(0);
    expect(left.x).toBe(-right.x);
    expect(left.y).toBe(right.y);
    expect(left.width).toBe(right.width);
    expect(left.height).toBe(right.height);
    expect(left.flowDir).toBe(-right.flowDir);
    expect(left.flowDir).toBe(-1);
    expect(right.flowDir).toBe(1);
  });
});
