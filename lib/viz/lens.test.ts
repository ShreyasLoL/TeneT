import { describe, expect, it } from 'vitest';
import { makeTrackable } from '@/lib/domain/fixtures';
import { lensFor } from './lens';

describe('lensFor', () => {
  it('routes structured logs to workout, gte durations to study, and lte durations or others to generic', () => {
    expect(
      lensFor(
        makeTrackable({
          key: 'k1',
          kind: 'log',
          config: { fields: [{ key: 'load', type: 'number' }] },
        }),
      ),
    ).toBe('workout');

    expect(
      lensFor(
        makeTrackable({
          key: 'k2',
          kind: 'duration',
          rule: { op: 'gte', value: 30 },
        }),
      ),
    ).toBe('study');

    expect(
      lensFor(
        makeTrackable({
          key: 'k3',
          kind: 'duration',
          rule: { op: 'lte', value: 120 },
        }),
      ),
    ).toBe('generic');

    expect(lensFor(makeTrackable({ key: 'k4', kind: 'check' }))).toBe('generic');
  });
});
