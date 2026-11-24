import { describe, expect, it } from 'vitest';
import { makeTrackable } from './fixtures';
import { valueSchema } from './primitives';
import { defaultRule, effectiveRule, evaluate } from './rules';

describe('evaluate', () => {
  it('eq / gte / lte / between', () => {
    expect(evaluate({ op: 'eq', value: true }, true)).toBe(true);
    expect(evaluate({ op: 'eq', value: true }, false)).toBe(false);
    expect(evaluate({ op: 'gte', value: 3 }, 3)).toBe(true);
    expect(evaluate({ op: 'gte', value: 3 }, 2)).toBe(false);
    expect(evaluate({ op: 'lte', value: 120 }, 90)).toBe(true);
    expect(evaluate({ op: 'lte', value: 120 }, 121)).toBe(false);
    expect(evaluate({ op: 'between', min: 1, max: 3 }, 2)).toBe(true);
    expect(evaluate({ op: 'between', min: 1, max: 3 }, 4)).toBe(false);
  });

  it('treats type mismatches and NaN as not satisfied', () => {
    expect(evaluate({ op: 'gte', value: 1 }, '5')).toBe(false);
    expect(evaluate({ op: 'lte', value: 5 }, Number.NaN)).toBe(false);
    expect(evaluate({ op: 'eq', value: true }, 'true')).toBe(false);
  });

  it('present handles empty values', () => {
    expect(evaluate({ op: 'present' }, '  ')).toBe(false);
    expect(evaluate({ op: 'present' }, [])).toBe(false);
    expect(evaluate({ op: 'present' }, undefined)).toBe(false);
    expect(evaluate({ op: 'present' }, 0)).toBe(true);
    expect(evaluate({ op: 'present' }, [{ a: 1 }])).toBe(true);
  });

  it('uses per-kind defaults unless a rule is set', () => {
    expect(defaultRule('check')).toEqual({ op: 'eq', value: true });
    expect(effectiveRule(makeTrackable({ key: 'k', kind: 'count' }))).toEqual({ op: 'gte', value: 1 });
    expect(
      effectiveRule(makeTrackable({ key: 'k', kind: 'duration', rule: { op: 'lte', value: 120 } })),
    ).toEqual({ op: 'lte', value: 120 });
  });
});

describe('valueSchema', () => {
  const ok = (t: Parameters<typeof makeTrackable>[0], v: unknown) =>
    valueSchema(makeTrackable(t)).safeParse(v).success;

  it('validates each primitive', () => {
    expect(ok({ key: 'k', kind: 'check' }, true)).toBe(true);
    expect(ok({ key: 'k', kind: 'check' }, 'yes')).toBe(false);
    expect(ok({ key: 'k', kind: 'count' }, 3)).toBe(true);
    expect(ok({ key: 'k', kind: 'count' }, -1)).toBe(false);
    expect(ok({ key: 'k', kind: 'count' }, 1.5)).toBe(false);
    expect(ok({ key: 'k', kind: 'measure' }, 72.5)).toBe(true);
    expect(ok({ key: 'k', kind: 'measure' }, Number.NaN)).toBe(false);
    expect(ok({ key: 'k', kind: 'duration' }, 90)).toBe(true);
    expect(ok({ key: 'k', kind: 'duration' }, 1441)).toBe(false);
    expect(ok({ key: 'k', kind: 'rating' }, 5)).toBe(true);
    expect(ok({ key: 'k', kind: 'rating' }, 6)).toBe(false);
    expect(ok({ key: 'k', kind: 'note' }, 'hello')).toBe(true);
    expect(ok({ key: 'k', kind: 'note' }, 'x'.repeat(2001))).toBe(false);
    expect(ok({ key: 'k', kind: 'queue' }, 2)).toBe(true);
  });

  it('restricts choices to configured options', () => {
    const t = { key: 'k', kind: 'choice' as const, config: { options: ['a', 'b'] } };
    expect(ok(t, 'a')).toBe(true);
    expect(ok(t, 'c')).toBe(false);
  });

  it('validates log rows against field definitions', () => {
    const t = {
      key: 'k',
      kind: 'log' as const,
      config: {
        fields: [
          { key: 'name', type: 'text' as const },
          { key: 'reps', type: 'number' as const },
          { key: 'note', type: 'text' as const, optional: true },
        ],
      },
    };
    expect(ok(t, [{ name: 'x', reps: 5 }])).toBe(true);
    expect(ok(t, [{ name: 'x' }])).toBe(false); // reps missing
    expect(ok(t, [{ name: 'x', reps: 5, extra: 1 }])).toBe(false); // strict
    expect(ok(t, 'nope')).toBe(false);
  });
});
