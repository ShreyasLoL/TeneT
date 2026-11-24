import { describe, expect, it } from 'vitest';
import { resolveAreaLook } from './areaLook';

describe('resolveAreaLook', () => {
  it('assigns mass, precession, and comet archetypes by position and merges JSONB overrides', () => {
    const a0 = resolveAreaLook({ slug: 'alpha', position: 0, look: {} });
    const a1 = resolveAreaLook({ slug: 'beta', position: 1, look: {} });
    const a2 = resolveAreaLook({ slug: 'gamma', position: 2, look: {} });

    expect(a0.archetype).toBe('mass');
    expect(a1.archetype).toBe('precession');
    expect(a2.archetype).toBe('comet');
    expect(a2.eccentricity).toBeGreaterThan(a1.eccentricity);
    expect(a1.eccentricity).toBeGreaterThan(a0.eccentricity);

    const overridden = resolveAreaLook({
      slug: 'alpha',
      position: 0,
      look: { shimmer: 0.9 },
    });
    expect(overridden.shimmer).toBe(0.9);
    expect(overridden.archetype).toBe('mass');
  });

  it('produces deterministic fallback looks for unknown or unpositioned slugs', () => {
    const first = resolveAreaLook({ slug: 'unassigned', position: 7, look: {} });
    const second = resolveAreaLook({ slug: 'unassigned', position: 7, look: {} });
    expect(first).toEqual(second);
    expect(resolveAreaLook(undefined).archetype).toBe('mass');
  });
});
