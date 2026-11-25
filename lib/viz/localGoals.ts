import type { ApiEntry, ApiTrackable } from '@/lib/api/types';
import { projectPace, type PaceResult } from '@/lib/domain/goals';
import type { DayKey } from '@/lib/domain/types';

export type LocalGoal = {
  trackableKey: string;
  target: number;
  direction: 'up' | 'down';
  deadline?: string;
};

const LOCAL_GOALS_KEY = 'tenet.localGoals.v1';

function isValidLocalGoal(v: unknown): v is LocalGoal {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const rec = v as Record<string, unknown>;
  if (typeof rec.trackableKey !== 'string' || rec.trackableKey.length === 0) return false;
  if (typeof rec.target !== 'number' || !Number.isFinite(rec.target)) return false;
  if (rec.direction !== 'up' && rec.direction !== 'down') return false;
  if (rec.deadline !== undefined && typeof rec.deadline !== 'string') return false;
  return true;
}

export function loadLocalGoals(storage?: Storage): LocalGoal[] {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return [];
  try {
    const raw = store.getItem(LOCAL_GOALS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.every(isValidLocalGoal) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalGoal(goal: LocalGoal, storage?: Storage): LocalGoal[] {
  const existing = loadLocalGoals(storage).filter((g) => g.trackableKey !== goal.trackableKey);
  const next = [...existing, goal];
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (store) {
    try {
      store.setItem(LOCAL_GOALS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}

export function removeLocalGoal(trackableKey: string, storage?: Storage): LocalGoal[] {
  const next = loadLocalGoals(storage).filter((g) => g.trackableKey !== trackableKey);
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (store) {
    try {
      store.setItem(LOCAL_GOALS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}

export function extractNumericSeries(
  entries: ReadonlyArray<ApiEntry>,
  trackableKey: string,
): { day: DayKey; value: number }[] {
  return entries
    .filter((e) => e.key === trackableKey && typeof e.value === 'number' && Number.isFinite(e.value))
    .map((e) => ({ day: e.day, value: e.value as number }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function evaluateLocalGoal(
  goal: LocalGoal,
  entries: ReadonlyArray<ApiEntry>,
  trackables: ReadonlyArray<Pick<ApiTrackable, 'key' | 'label'>>,
): { label: string; pace: PaceResult; latest?: number } {
  const series = extractNumericSeries(entries, goal.trackableKey);
  const label = trackables.find((t) => t.key === goal.trackableKey)?.label ?? goal.trackableKey;
  const pace = projectPace({
    series,
    target: goal.target,
    direction: goal.direction,
    deadline: goal.deadline,
    windowDays: 28,
  });
  return {
    label,
    pace,
    latest: series.length > 0 ? series[series.length - 1].value : undefined,
  };
}
