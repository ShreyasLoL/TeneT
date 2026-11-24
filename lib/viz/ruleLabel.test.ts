import { describe, expect, it } from 'vitest';
import { makeTrackable } from '@/lib/domain/fixtures';
import { ruleLabel } from './ruleLabel';

describe('ruleLabel', () => {
  it('formats rules concisely with units', () => {
    expect(ruleLabel(makeTrackable({ key: 'a', kind: 'check' }))).toBe('yes');
    expect(
      ruleLabel(
        makeTrackable({ key: 'b', kind: 'duration', rule: { op: 'gte', value: 30 } }),
      ),
    ).toBe('≥ 30 min');
    expect(
      ruleLabel(
        makeTrackable({ key: 'c', kind: 'duration', rule: { op: 'lte', value: 120 } }),
      ),
    ).toBe('≤ 120 min');
    expect(
      ruleLabel(
        makeTrackable({
          key: 'd',
          kind: 'measure',
          config: { unit: 'kg' },
          rule: { op: 'present' },
        }),
      ),
    ).toBe('logged');
  });
});
