import { describe, expect, it } from 'vitest';
import { decide } from './commands';
import type { Command, DecideContext, DomainEvent, State } from './events';
import { makeTrackable } from './fixtures';
import { apply, emptyState, replay } from './reducer';
import { generateReview } from './review';

const NOW = new Date('2026-11-24T16:30:00Z'); // 22:00 IST, logical day 2026-11-24 (Tuesday)
const TODAY = '2026-11-24';

const ctx = (over: Partial<DecideContext> = {}): DecideContext => ({
  trackables: [
    makeTrackable({ key: 'habit_a', weight: 1 }),
    makeTrackable({ key: 'habit_b', kind: 'count', weight: 1 }),
  ],
  now: NOW,
  ...over,
});

/** Run a command and fold the resulting events into state. */
function run(state: State, cmd: Command, c: DecideContext = ctx()): State {
  const r = decide(state, cmd, c);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value.reduce(apply, state);
}

describe('decide: log_entry', () => {
  it('accepts a valid value and emits an event', () => {
    const r = decide(emptyState, { type: 'log_entry', day: TODAY, key: 'habit_a', value: true }, ctx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value[0]).toMatchObject({ type: 'entry_logged', key: 'habit_a', version: 1, value: true });
  });

  it('rejects invalid values, unknown keys and bad days', () => {
    const bad = (cmd: Command) => {
      const r = decide(emptyState, cmd, ctx());
      return r.ok ? 'ok' : r.error.code;
    };
    expect(bad({ type: 'log_entry', day: TODAY, key: 'habit_b', value: -2 })).toBe('invalid_value');
    expect(bad({ type: 'log_entry', day: TODAY, key: 'missing', value: true })).toBe('unknown_trackable');
    expect(bad({ type: 'log_entry', day: 'garbage', key: 'habit_a', value: true })).toBe('invalid_day');
    expect(bad({ type: 'log_entry', day: '2026-11-25', key: 'habit_a', value: true })).toBe('future_day');
    expect(bad({ type: 'log_entry', day: '2026-11-23', key: 'habit_a', value: true })).toBe('day_not_open');
  });

  it('allows backfill only when configured', () => {
    const r = decide(
      emptyState,
      { type: 'log_entry', day: '2026-11-23', key: 'habit_a', value: true },
      ctx({ backfillDays: 1 }),
    );
    expect(r.ok).toBe(true);
  });

  it('lets you change a value until the day is sealed (last write wins)', () => {
    let s = run(emptyState, { type: 'log_entry', day: TODAY, key: 'habit_a', value: false });
    s = run(s, { type: 'log_entry', day: TODAY, key: 'habit_a', value: true });
    expect(s.entries[TODAY].habit_a.value).toBe(true);
  });

  it('uses the version effective on that day', () => {
    const c = ctx({
      trackables: [
        makeTrackable({ key: 'habit_b', kind: 'count', version: 1, effectiveFrom: '2026-01-01' }),
        makeTrackable({ key: 'habit_b', kind: 'count', version: 2, effectiveFrom: '2026-11-25' }),
      ],
    });
    const r = decide(emptyState, { type: 'log_entry', day: TODAY, key: 'habit_b', value: 1 }, c);
    expect(r.ok && r.value[0].type === 'entry_logged' && r.value[0].version).toBe(1);
  });
});

describe('decide: seal_day', () => {
  it('computes score, freezes the day and rejects any later write', () => {
    let s = run(emptyState, { type: 'log_entry', day: TODAY, key: 'habit_a', value: true });
    s = run(s, { type: 'log_entry', day: TODAY, key: 'habit_b', value: 0 });
    s = run(s, { type: 'seal_day', day: TODAY, reflection: '  ok day  ' });

    expect(s.sealed[TODAY].score).toBe(50);
    expect(s.sealed[TODAY].reflection).toBe('ok day');
    expect(s.sealed[TODAY].streak).toBe(1);

    const again = decide(s, { type: 'seal_day', day: TODAY }, ctx());
    expect(again.ok === false && again.error.code).toBe('day_sealed');
    const edit = decide(s, { type: 'log_entry', day: TODAY, key: 'habit_a', value: false }, ctx());
    expect(edit.ok === false && edit.error.code).toBe('day_sealed');
  });

  it('can seal an empty day honestly (score 0)', () => {
    const s = run(emptyState, { type: 'seal_day', day: TODAY });
    expect(s.sealed[TODAY].score).toBe(0);
  });

  it('rejects an over-long reflection', () => {
    const r = decide(emptyState, { type: 'seal_day', day: TODAY, reflection: 'x'.repeat(501) }, ctx());
    expect(r.ok === false && r.error.code).toBe('invalid_reflection');
  });

  it('builds streaks from earlier sealed days', () => {
    const c = ctx({ backfillDays: 5 });
    let s = emptyState;
    for (const day of ['2026-11-22', '2026-11-23']) s = run(s, { type: 'seal_day', day }, c);
    s = run(s, { type: 'seal_day', day: TODAY }, c);
    expect(s.sealed[TODAY].streak).toBe(3);
  });

  it('n_per_week relaxes using earlier sealed days from the same week', () => {
    const weekly = [makeTrackable({ key: 'habit_w', schedule: { type: 'n_per_week', n: 2 } })];
    const c = ctx({ trackables: weekly, backfillDays: 7, now: new Date('2026-11-29T16:30:00Z') }); // Sunday
    // Sun with 0 done and needs 2, 1 day left -> required miss
    let s = run(emptyState, { type: 'seal_day', day: '2026-11-29' }, c);
    expect(s.sealed['2026-11-29'].results[0].status).toBe('required');
    expect(s.sealed['2026-11-29'].score).toBe(0);

    // Same week, but Mon+Tue were done and sealed -> Sunday is only optional
    s = emptyState;
    for (const day of ['2026-11-23', '2026-11-24']) {
      s = run(s, { type: 'log_entry', day, key: 'habit_w', value: true }, c);
      s = run(s, { type: 'seal_day', day }, c);
    }
    s = run(s, { type: 'seal_day', day: '2026-11-29' }, c);
    expect(s.sealed['2026-11-29'].results[0].status).toBe('optional');
    expect(s.sealed['2026-11-29'].score).toBeNull();
  });
});

describe('reducer', () => {
  it('replays an event log to the same state', () => {
    const events: DomainEvent[] = [];
    let s = emptyState;
    for (const cmd of [
      { type: 'log_entry', day: TODAY, key: 'habit_a', value: true },
      { type: 'seal_day', day: TODAY },
    ] as Command[]) {
      const r = decide(s, cmd, ctx());
      if (!r.ok) throw new Error(r.error.message);
      events.push(...r.value);
      s = r.value.reduce(apply, s);
    }
    expect(replay(events)).toEqual(s);
  });

  it('throws on a corrupt log (entry after seal, double seal)', () => {
    const sealed = run(emptyState, { type: 'seal_day', day: TODAY });
    const entry: DomainEvent = { type: 'entry_logged', at: 'x', day: TODAY, key: 'habit_a', version: 1, value: true };
    expect(() => apply(sealed, entry)).toThrow(/sealed day/);
    const seal: DomainEvent = { type: 'day_sealed', at: 'x', day: TODAY, score: 0, results: [], streak: 1 };
    expect(() => apply(sealed, seal)).toThrow(/twice/);
  });
});

describe('generateReview', () => {
  it('produces deterministic, rule-based lines', () => {
    expect(
      generateReview({
        score: 95,
        streak: 5,
        avgScoreLast7: 70,
        missed: [],
        goals: [{ label: 'Goal A', status: 'on_track', etaDay: '2027-03-01' }],
      }),
    ).toEqual([
      'Near-perfect night.',
      "That's 25 points above your 7-night average.",
      '5 nights sealed in a row.',
      'Goal A: on pace for 2027-03-01.',
    ]);
  });

  it('handles bad nights, many misses and stalled goals', () => {
    const lines = generateReview({
      score: 20,
      streak: 1,
      missed: ['a', 'b', 'c', 'd', 'e'],
      goals: [{ label: 'Goal B', status: 'stalled' }],
    });
    expect(lines).toContain("Rough night, and it's sealed. Tomorrow starts clean.");
    expect(lines).toContain('Missed: a, b, c and 2 more.');
    expect(lines).toContain('Streak: 1 night.');
    expect(lines).toContain('Goal B has stalled.');
  });

  it('handles a night with nothing scheduled', () => {
    expect(generateReview({ score: null, streak: 3, missed: [] })[0]).toBe('Nothing was scheduled tonight.');
  });
});
