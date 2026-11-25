import type { StateResponse } from '@/lib/api/types';
import { addDays, isDayKey } from '@/lib/domain/day';
import type { DayKey, Trackable } from '@/lib/domain/types';

export function resolveJumpPreview(
  query: string,
  today: DayKey,
  state: StateResponse | undefined,
): { label: string; day: DayKey } | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (q === 'yesterday') return { label: 'yesterday', day: addDays(today, -1) };
  if (q === 'today') return { label: 'today', day: today };
  const rel = q.match(/^-(\d+)d$/);
  if (rel) {
    const n = Number(rel[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 400) {
      return { label: `${n} days ago`, day: addDays(today, -n) };
    }
  }
  if (isDayKey(q)) return { label: q, day: q };
  if (q.startsWith('last ') && state) {
    const targetKey = q.slice(5).trim();
    const matchedTrackable = state.definitions.trackables.find(
      (t) =>
        t.key.toLowerCase().includes(targetKey) ||
        t.label.toLowerCase().includes(targetKey),
    );
    if (matchedTrackable) {
      const lastSealed = [...state.days]
        .reverse()
        .find((d) => d.results.some((r) => r.key === matchedTrackable.key && r.satisfied));
      if (lastSealed) {
        return { label: `last ${matchedTrackable.label}`, day: lastSealed.day };
      }
    }
  }
  return null;
}

export function resolveQuickLogPreview(
  query: string,
  activeToday: ReadonlyArray<Trackable>,
): { trackable: Trackable; rawVal: unknown } | null {
  const q = query.trim();
  if (!q || activeToday.length === 0) return null;
  const parts = q.split(/\s+/);
  const term = parts[0].toLowerCase();
  const t = activeToday.find(
    (item) => item.key.toLowerCase() === term || item.label.toLowerCase().startsWith(term),
  );
  if (!t) return null;

  let rawVal: unknown;
  switch (t.kind) {
    case 'check':
      if (parts.length === 1) rawVal = true;
      else if (parts[1] === 'true' || parts[1] === 'yes' || parts[1] === '1') rawVal = true;
      else if (parts[1] === 'false' || parts[1] === 'no' || parts[1] === '0') rawVal = false;
      else rawVal = parts[1];
      break;
    case 'count':
    case 'queue':
    case 'duration':
    case 'measure':
    case 'rating': {
      if (parts.length < 2) return null;
      const num = Number(parts[1]);
      rawVal = Number.isFinite(num) ? num : parts[1];
      break;
    }
    case 'choice':
    case 'note':
    case 'log':
      rawVal = parts.slice(1).join(' ');
      break;
    default: {
      const _exhaustive: never = t.kind;
      rawVal = _exhaustive;
    }
  }

  return { trackable: t, rawVal };
}
