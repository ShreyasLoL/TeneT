import { describe, expect, it } from 'vitest';
import { valueSchema } from './primitives';
import { KINDS, type FieldDef, type Kind, type Trackable } from './types';
import { validateTrackableValue } from './validateValue';

function makeTrackable(kind: Kind, overrides: Partial<Trackable['config']> = {}): Trackable {
  return {
    key: `k_${kind}`,
    version: 1,
    kind,
    label: `Label ${kind}`,
    config: overrides,
    schedule: { type: 'daily' },
    weight: 1,
    scored: true,
    effectiveFrom: '2026-01-01',
  };
}

function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('validateTrackableValue parity with valueSchema', () => {
  it('matches boundary cases across all 9 kinds', () => {
    const configs: Array<{ kind: Kind; config?: Trackable['config'] }> = [
      { kind: 'check' },
      { kind: 'count' },
      { kind: 'queue' },
      { kind: 'measure' },
      { kind: 'duration' },
      { kind: 'rating' },
      { kind: 'choice', config: { options: ['alpha', 'beta'] } },
      { kind: 'choice', config: {} },
      { kind: 'note' },
      {
        kind: 'log',
        config: {
          fields: [
            { key: 'mass', type: 'number' },
            { key: 'reps', type: 'number' },
            { key: 'note', type: 'text', optional: true },
            { key: 'warm', type: 'bool', optional: true },
          ],
        },
      },
      { kind: 'log', config: {} },
    ];

    const candidates: unknown[] = [
      true,
      false,
      0,
      -0,
      1,
      5,
      6,
      -1,
      1.5,
      1440,
      1441,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '',
      'alpha',
      'gamma',
      'x'.repeat(200),
      'x'.repeat(201),
      'x'.repeat(500),
      'x'.repeat(501),
      'x'.repeat(2000),
      'x'.repeat(2001),
      null,
      undefined,
      [],
      [{ mass: 80, reps: 5 }],
      [{ mass: 80, reps: 5, note: undefined, warm: true }],
      [{ mass: 80, reps: 5, extra: 1 }],
      [{ mass: Number.NaN, reps: 5 }],
      [{ reps: 5 }],
      [{ anyNum: 10, anyStr: 'ok', anyBool: false }],
      [{ bad: null }],
      Array.from({ length: 200 }, () => ({ mass: 20, reps: 8 })),
      Array.from({ length: 201 }, () => ({ mass: 20, reps: 8 })),
      { notAnArray: true },
    ];

    for (const cfg of configs) {
      const t = makeTrackable(cfg.kind, cfg.config);
      const schema = valueSchema(t);
      for (const candidate of candidates) {
        const expected = schema.safeParse(candidate).success;
        const actual = validateTrackableValue(t, candidate).ok;
        expect(actual).toBe(expected);
      }
    }
  });

  it('holds exact parity across 1,200 randomized trackable definitions and inputs', () => {
    const rng = createRng(424242);
    const fieldPool: FieldDef[][] = [
      [],
      [{ key: 'a', type: 'number' }],
      [
        { key: 'a', type: 'number' },
        { key: 'b', type: 'bool', optional: true },
        { key: 'c', type: 'text', optional: true },
      ],
    ];

    for (let i = 0; i < 1200; i++) {
      const kind = KINDS[Math.floor(rng() * KINDS.length)];
      const config: Trackable['config'] =
        kind === 'choice'
          ? rng() > 0.4
            ? { options: ['one', 'two', 'three'] }
            : {}
          : kind === 'log'
            ? { fields: fieldPool[Math.floor(rng() * fieldPool.length)] }
            : {};

      const t = makeTrackable(kind, config);
      const bucket = Math.floor(rng() * 8);
      let val: unknown;
      switch (bucket) {
        case 0:
          val = rng() > 0.5;
          break;
        case 1:
          val = Math.floor(rng() * 1600) - 50;
          break;
        case 2:
          val = (rng() - 0.5) * 200;
          break;
        case 3:
          val = rng() > 0.5 ? Number.NaN : Number.POSITIVE_INFINITY;
          break;
        case 4: {
          const opts = ['one', 'two', 'four', '', 'z'.repeat(Math.floor(rng() * 2200))];
          val = opts[Math.floor(rng() * opts.length)];
          break;
        }
        case 5:
          val = [
            rng() > 0.3
              ? { a: Math.floor(rng() * 100), ...(rng() > 0.5 ? { b: true } : {}) }
              : { a: 'wrong', unknownKey: 1 },
          ];
          break;
        case 6:
          val = [];
          break;
        default:
          val = rng() > 0.5 ? null : undefined;
          break;
      }

      const zodRes = valueSchema(t).safeParse(val).success;
      const pureRes = validateTrackableValue(t, val).ok;
      expect(pureRes).toBe(zodRes);
    }
  });
});
