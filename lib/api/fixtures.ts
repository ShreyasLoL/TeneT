import { decide } from '@/lib/domain/commands';
import { addDays, dayKey } from '@/lib/domain/day';
import type { Command, DecideContext, DomainEvent, State } from '@/lib/domain/events';
import { apply, emptyState } from '@/lib/domain/reducer';
import { satisfiedOnFromDays } from '@/lib/domain/satisfiedOnFromDays';
import { activeTrackables } from '@/lib/domain/schedule';
import { evaluateDay, nightScore } from '@/lib/domain/score';
import { currentStreak } from '@/lib/domain/stats';
import type { DayKey } from '@/lib/domain/types';
import type {
  ApiArea,
  ApiEntry,
  ApiGoal,
  ApiSealedDay,
  ApiTrackable,
  CommandSuccessResponse,
  DefinitionsResponse,
  StateResponse,
} from './types';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REFLECTIONS = [
  'cold air after midnight. kept the cadence even when energy dipped.',
  'pushed the third block past resistance; stopped before drift.',
  'quiet room, clean ledger.',
  'held the cap without bargaining.',
  'missed the morning window, recovered late.',
  'thin margin tonight, still on the board.',
  'let the unnecessary go and finished what mattered.',
];

export type FixtureDataset = {
  areas: ApiArea[];
  goals: ApiGoal[];
  allTrackables: ApiTrackable[];
  entries: ApiEntry[];
  days: ApiSealedDay[];
  today: DayKey;
};

export function generateFixtureState(options?: {
  days?: number;
  seed?: number;
  today?: DayKey;
}): FixtureDataset {
  const count = options?.days ?? 120;
  const seed = options?.seed ?? 42;
  const today = options?.today ?? dayKey(new Date());
  const startDay = addDays(today, -count);
  const rng = mulberry32(seed);

  const areas: ApiArea[] = [
    {
      id: '00000000-0000-4000-8000-000000000101',
      slug: 'kinetic',
      name: 'Kinetic',
      look: {},
      position: 0,
      archivedAt: null,
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      slug: 'cognitive',
      name: 'Cognitive',
      look: {},
      position: 1,
      archivedAt: null,
    },
    {
      id: '00000000-0000-4000-8000-000000000103',
      slug: 'leisure',
      name: 'Leisure',
      look: {},
      position: 2,
      archivedAt: null,
    },
  ];

  const allTrackables: ApiTrackable[] = [
    {
      key: 'session',
      version: 1,
      kind: 'check',
      label: 'Training session',
      config: {},
      schedule: { type: 'n_per_week', n: 4 },
      weight: 3,
      scored: true,
      effectiveFrom: startDay,
      areaId: areas[0].id,
      areaSlug: areas[0].slug,
      goalId: null,
    },
    {
      key: 'protocol',
      version: 1,
      kind: 'check',
      label: 'Daily protocol',
      config: {},
      schedule: { type: 'daily' },
      weight: 1,
      scored: true,
      effectiveFrom: startDay,
      areaId: areas[0].id,
      areaSlug: areas[0].slug,
      goalId: null,
    },
    {
      key: 'mass',
      version: 1,
      kind: 'measure',
      label: 'Morning mass',
      config: { unit: 'kg' },
      schedule: { type: 'daily' },
      rule: { op: 'present' },
      weight: 1,
      scored: false,
      effectiveFrom: startDay,
      areaId: areas[0].id,
      areaSlug: areas[0].slug,
      goalId: null,
    },
    {
      key: 'sets',
      version: 1,
      kind: 'log',
      label: 'Compound sets',
      config: {
        fields: [
          { key: 'movement', type: 'text' },
          { key: 'load', type: 'number' },
          { key: 'reps', type: 'number' },
          { key: 'clean', type: 'bool', optional: true },
        ],
      },
      schedule: { type: 'weekdays', days: [1, 3, 5] },
      rule: { op: 'present' },
      weight: 2,
      scored: true,
      effectiveFrom: startDay,
      areaId: areas[0].id,
      areaSlug: areas[0].slug,
      goalId: null,
    },
    {
      key: 'drills',
      version: 1,
      kind: 'count',
      label: 'Problem drills',
      config: {},
      schedule: { type: 'daily' },
      rule: { op: 'gte', value: 1 },
      weight: 2,
      scored: true,
      effectiveFrom: startDay,
      areaId: areas[1].id,
      areaSlug: areas[1].slug,
      goalId: null,
    },
    {
      key: 'deep-focus',
      version: 1,
      kind: 'duration',
      label: 'Deep study',
      config: { unit: 'min' },
      schedule: { type: 'daily' },
      rule: { op: 'gte', value: 30 },
      weight: 2,
      scored: true,
      effectiveFrom: startDay,
      areaId: areas[1].id,
      areaSlug: areas[1].slug,
      goalId: null,
    },
    {
      key: 'clarity',
      version: 1,
      kind: 'rating',
      label: 'Clarity rating',
      config: {},
      schedule: { type: 'daily' },
      rule: { op: 'gte', value: 3 },
      weight: 1,
      scored: true,
      effectiveFrom: startDay,
      areaId: areas[1].id,
      areaSlug: areas[1].slug,
      goalId: null,
    },
    {
      key: 'reading-q',
      version: 1,
      kind: 'queue',
      label: 'Reading queue',
      config: {},
      schedule: { type: 'weekdays', days: [2, 4, 6] },
      rule: { op: 'gte', value: 1 },
      weight: 1,
      scored: true,
      effectiveFrom: startDay,
      areaId: areas[1].id,
      areaSlug: areas[1].slug,
      goalId: null,
    },
    {
      key: 'leisure-cap',
      version: 1,
      kind: 'duration',
      label: 'Screen cap',
      config: { unit: 'min' },
      schedule: { type: 'daily' },
      rule: { op: 'lte', value: 120 },
      weight: 1,
      scored: true,
      effectiveFrom: startDay,
      areaId: areas[2].id,
      areaSlug: areas[2].slug,
      goalId: null,
    },
    {
      key: 'mode',
      version: 1,
      kind: 'choice',
      label: 'Evening mode',
      config: { options: ['solo', 'co-op', 'offline'] },
      schedule: { type: 'daily' },
      rule: { op: 'present' },
      weight: 1,
      scored: false,
      effectiveFrom: startDay,
      areaId: areas[2].id,
      areaSlug: areas[2].slug,
      goalId: null,
    },
    {
      key: 'journal',
      version: 1,
      kind: 'note',
      label: 'Field note',
      config: {},
      schedule: { type: 'daily' },
      rule: { op: 'present' },
      weight: 1,
      scored: false,
      effectiveFrom: startDay,
      areaId: areas[2].id,
      areaSlug: areas[2].slug,
      goalId: null,
    },
    {
      key: 'legacy-check',
      version: 1,
      kind: 'check',
      label: 'Archived check',
      config: {},
      schedule: { type: 'daily' },
      weight: 1,
      scored: true,
      effectiveFrom: startDay,
      archivedFrom: addDays(today, -20),
      areaId: areas[1].id,
      areaSlug: areas[1].slug,
      goalId: null,
    },
    {
      key: 'legacy-check',
      version: 2,
      kind: 'count',
      label: 'Archived check v2',
      config: {},
      schedule: { type: 'daily' },
      rule: { op: 'gte', value: 2 },
      weight: 1,
      scored: true,
      effectiveFrom: addDays(today, -60),
      archivedFrom: addDays(today, -20),
      areaId: areas[1].id,
      areaSlug: areas[1].slug,
      goalId: null,
    },
  ];

  const entries: ApiEntry[] = [];
  const days: ApiSealedDay[] = [];
  const sealedKeys: DayKey[] = [];
  const voidOffsets = new Set([14, 15, 42, 77]);

  let mass = 76.2;

  for (let offset = 0; offset < count; offset++) {
    const day = addDays(startDay, offset);
    if (voidOffsets.has(count - offset)) continue;

    const active = activeTrackables(allTrackables, day);
    const dayEntries: Record<string, unknown> = {};
    const satisfiedOn = satisfiedOnFromDays(days);

    mass = Number((mass - 0.032 + (rng() - 0.48) * 0.18).toFixed(1));
    const isNullDay = count - offset === 33;

    for (const t of active) {
      if (isNullDay && t.scored) continue;

      let value: unknown;
      switch (t.kind) {
        case 'check':
          value = rng() > 0.22;
          break;
        case 'count':
          value = rng() > 0.25 ? Math.floor(1 + rng() * 3) : 0;
          break;
        case 'measure':
          value = mass;
          break;
        case 'duration':
          value =
            t.rule?.op === 'lte'
              ? rng() > 0.24
                ? Math.floor(rng() * 110)
                : 155
              : rng() > 0.26
                ? Math.floor(35 + rng() * 75)
                : 15;
          break;
        case 'rating':
          value = Math.floor(2 + rng() * 4);
          break;
        case 'choice':
          value = ['solo', 'co-op', 'offline'][Math.floor(rng() * 3)];
          break;
        case 'note':
          if (rng() > 0.6) value = 'notes from the late session.';
          break;
        case 'log':
          if (rng() > 0.28) {
            value = [
              { movement: 'press', load: 72.5, reps: 5, clean: true },
              { movement: 'row', load: 65, reps: 8, clean: true },
            ];
          }
          break;
        case 'queue':
          value = rng() > 0.3 ? 1 : 0;
          break;
      }

      if (value !== undefined) {
        dayEntries[t.key] = value;
        entries.push({ day, key: t.key, version: t.version, value });
      }
    }

    const results = isNullDay
      ? active.map((t) => ({
          key: t.key,
          version: t.version,
          status: 'off' as const,
          satisfied: false,
          weight: t.weight,
          scored: t.scored,
        }))
      : evaluateDay(day, active, dayEntries, satisfiedOn);

    const score = nightScore(results);
    sealedKeys.push(day);
    const streak = currentStreak(sealedKeys, day);
    const reflection =
      rng() > 0.58 ? REFLECTIONS[Math.floor(rng() * REFLECTIONS.length)] : null;

    days.push({
      day,
      sealedAt: `${day}T17:45:00.000Z`,
      score,
      results,
      reflection,
      streak,
    });
  }

  return {
    areas,
    goals: [],
    allTrackables,
    entries,
    days,
    today,
  };
}

const FIXTURE_STORAGE_KEY = 'tenet.fixture';
let fixtureOverride: boolean | null = null;

export function setFixtureModeOverride(enabled: boolean | null) {
  fixtureOverride = enabled;
}

export function isFixtureMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (fixtureOverride !== null) return fixtureOverride;
  if (process.env.NEXT_PUBLIC_TENET_FIXTURES === '1') return true;
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const queryFlag = params.get('fixture');
  try {
    if (queryFlag === '1') {
      window.sessionStorage.setItem(FIXTURE_STORAGE_KEY, '1');
      return true;
    }
    if (queryFlag === '0') {
      window.sessionStorage.removeItem(FIXTURE_STORAGE_KEY);
      return false;
    }
    return window.sessionStorage.getItem(FIXTURE_STORAGE_KEY) === '1';
  } catch {
    return queryFlag === '1';
  }
}

type FixtureRuntime = {
  dataset: FixtureDataset;
  state: State;
};

let runtime: FixtureRuntime | null = null;

function ensureRuntime(): FixtureRuntime {
  const currentToday = dayKey(new Date());
  if (runtime && runtime.dataset.today === currentToday) {
    return runtime;
  }

  const dataset = generateFixtureState({ days: 120, seed: 42, today: currentToday });
  let state: State = emptyState;

  for (const entry of dataset.entries) {
    state = apply(state, {
      type: 'entry_logged',
      at: `${entry.day}T16:00:00.000Z`,
      day: entry.day,
      key: entry.key,
      version: entry.version,
      value: entry.value,
    });
  }
  for (const d of dataset.days) {
    state = apply(state, {
      type: 'day_sealed',
      at: d.sealedAt,
      day: d.day,
      score: d.score,
      results: d.results,
      reflection: d.reflection ?? undefined,
      streak: d.streak,
    });
  }

  runtime = { dataset, state };
  return runtime;
}

export function resetFixtureStore(today?: DayKey) {
  runtime = null;
  if (today) {
    const dataset = generateFixtureState({ days: 120, seed: 42, today });
    let state: State = emptyState;
    for (const entry of dataset.entries) {
      state = apply(state, {
        type: 'entry_logged',
        at: `${entry.day}T16:00:00.000Z`,
        day: entry.day,
        key: entry.key,
        version: entry.version,
        value: entry.value,
      });
    }
    for (const d of dataset.days) {
      state = apply(state, {
        type: 'day_sealed',
        at: d.sealedAt,
        day: d.day,
        score: d.score,
        results: d.results,
        reflection: d.reflection ?? undefined,
        streak: d.streak,
      });
    }
    runtime = { dataset, state };
  }
}

export function fixtureGetDefinitions(now = new Date()): DefinitionsResponse {
  const { dataset } = ensureRuntime();
  const currentDay = dayKey(now);
  const byKeyVersion = new Map(
    dataset.allTrackables.map((t) => [`${t.key}@${t.version}`, t] as const),
  );
  const active = activeTrackables(dataset.allTrackables, currentDay)
    .map((t) => byKeyVersion.get(`${t.key}@${t.version}`))
    .filter((t): t is ApiTrackable => t !== undefined);

  return {
    ok: true,
    areas: dataset.areas,
    goals: dataset.goals,
    trackables: active,
  };
}

export function fixtureGetState(from?: DayKey, to?: DayKey, now = new Date()): StateResponse {
  const rt = ensureRuntime();
  const today = dayKey(now);
  const rangeFrom = from ?? addDays(today, -399);
  const rangeTo = to ?? today;

  const entries: ApiEntry[] = [];
  for (const [day, record] of Object.entries(rt.state.entries)) {
    if (day < rangeFrom || day > rangeTo) continue;
    for (const [key, item] of Object.entries(record)) {
      entries.push({ day, key, version: item.version, value: item.value });
    }
  }
  entries.sort((a, b) => (a.day === b.day ? a.key.localeCompare(b.key) : a.day.localeCompare(b.day)));

  const days: ApiSealedDay[] = Object.values(rt.state.sealed)
    .filter((d) => d.day >= rangeFrom && d.day <= rangeTo)
    .map((d) => ({
      day: d.day,
      sealedAt: d.sealedAt,
      score: d.score,
      results: d.results,
      reflection: d.reflection ?? null,
      streak: d.streak,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const defs = fixtureGetDefinitions(now);
  return {
    ok: true,
    range: { from: rangeFrom, to: rangeTo },
    definitions: {
      areas: defs.areas,
      goals: defs.goals,
      trackables: defs.trackables,
    },
    entries,
    days,
  };
}

export function fixtureExecuteCommand(
  command: Command,
  now = new Date(),
):
  | { status: 200; body: CommandSuccessResponse }
  | { status: 422; body: { ok: false; error: { code: string; message: string } } } {
  const rt = ensureRuntime();
  const ctx: DecideContext = {
    trackables: rt.dataset.allTrackables,
    now,
  };
  const decision = decide(rt.state, command, ctx);
  if (!decision.ok) {
    return { status: 422, body: { ok: false, error: decision.error } };
  }
  let nextState = rt.state;
  const events: DomainEvent[] = decision.value;
  for (const ev of events) {
    nextState = apply(nextState, ev);
  }
  rt.state = nextState;
  return { status: 200, body: { ok: true, events } };
}
