'use client';

import dynamic from 'next/dynamic';
import { memo, useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import {
  cheapestPathToTarget,
  clampEffort,
  streakRisk,
} from '@/lib/domain/optimizerCore';
import { satisfiedOnFromDays } from '@/lib/domain/satisfiedOnFromDays';
import type { DayKey, Trackable } from '@/lib/domain/types';

const LazyPullExpanded = dynamic(
  () => import('./PullExpanded').then((m) => m.PullExpanded),
  {
    loading: () => (
      <div className="mt-4 min-h-48 border-t border-line pt-4 font-mono text-xs text-text-faint">
        computing frontier…
      </div>
    ),
  },
);

type PullProps = {
  day: DayKey;
  active: ReadonlyArray<ApiTrackable>;
  entries: Record<string, unknown>;
  days: ReadonlyArray<ApiSealedDay>;
  liveScore: number | null;
  isSealed?: boolean;
  defaultExpanded?: boolean;
};

const EFFORT_STORAGE_KEY = 'tenet.effort.v1';
const EFFORT_EVENT = 'tenet-effort-change';
const EMPTY_EFFORTS: Readonly<Record<string, number>> = {};

let cachedRaw: string | null = null;
let cachedParsed: Readonly<Record<string, number>> = EMPTY_EFFORTS;

function parseEffortMap(raw: string | null): Readonly<Record<string, number>> {
  if (!raw) return EMPTY_EFFORTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_EFFORTS;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = clampEffort(v);
      }
    }
    return out;
  } catch {
    return EMPTY_EFFORTS;
  }
}

function getEffortSnapshot(): Readonly<Record<string, number>> {
  if (typeof window === 'undefined') return EMPTY_EFFORTS;
  try {
    const raw = window.localStorage.getItem(EFFORT_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedParsed = parseEffortMap(raw);
    }
    return cachedParsed;
  } catch {
    return EMPTY_EFFORTS;
  }
}

function getEffortServerSnapshot(): Readonly<Record<string, number>> {
  return EMPTY_EFFORTS;
}

function subscribeEffort(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === EFFORT_STORAGE_KEY) cb();
  };
  const onLocal = () => cb();
  window.addEventListener('storage', onStorage);
  window.addEventListener(EFFORT_EVENT, onLocal);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EFFORT_EVENT, onLocal);
  };
}

function writeEffortWeight(key: string, nextValue: number) {
  if (typeof window === 'undefined') return;
  try {
    const current = { ...getEffortSnapshot(), [key]: clampEffort(nextValue) };
    const raw = JSON.stringify(current);
    cachedRaw = raw;
    cachedParsed = current;
    window.localStorage.setItem(EFFORT_STORAGE_KEY, raw);
    window.dispatchEvent(new Event(EFFORT_EVENT));
  } catch {
    // ignore storage quota errors
  }
}

function formatPlanSummary(
  keys: string[],
  effort: number,
  score: number,
  labelByKey: ReadonlyMap<string, string>,
): string {
  if (keys.length === 0) return `reached (${score})`;
  const labels = keys.map((k) => labelByKey.get(k) ?? k).join(' + ');
  return `${labels} · effort ${effort} → ${score}`;
}

export const Pull = memo(function Pull({
  day,
  active,
  entries,
  days,
  liveScore,
  isSealed = false,
  defaultExpanded = false,
}: PullProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const deferredEntries = useDeferredValue(entries);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void import('./PullExpanded');
    }, 350);
    return () => window.clearTimeout(id);
  }, []);
  const effortMap = useSyncExternalStore(
    subscribeEffort,
    getEffortSnapshot,
    getEffortServerSnapshot,
  );

  const satisfiedOn = useMemo(() => satisfiedOnFromDays(days), [days]);
  const domainActive = useMemo<Trackable[]>(() => [...active], [active]);
  const labelByKey = useMemo(
    () => new Map(active.map((t) => [t.key, t.label] as const)),
    [active],
  );

  const path70 = useMemo(
    () =>
      isSealed && !expanded
        ? null
        : cheapestPathToTarget(day, domainActive, deferredEntries, satisfiedOn, effortMap, 70),
    [day, domainActive, deferredEntries, satisfiedOn, effortMap, isSealed, expanded],
  );

  const needPath90 = expanded || (!isSealed && path70 !== null && path70.keys.length === 0);
  const path90 = useMemo(
    () =>
      needPath90
        ? cheapestPathToTarget(day, domainActive, deferredEntries, satisfiedOn, effortMap, 90)
        : null,
    [needPath90, day, domainActive, deferredEntries, satisfiedOn, effortMap],
  );

  const sealedDayKeys = useMemo(() => days.map((d) => d.day), [days]);
  const risk = useMemo(() => streakRisk(sealedDayKeys, day), [day, sealedDayKeys]);

  const primarySummary = isSealed
    ? COPY.doors.sealed
    : path70
      ? path70.keys.length === 0
        ? path90
          ? path90.keys.length === 0
            ? `90+ reached (${path90.score})`
            : `to 90: ${formatPlanSummary(path90.keys, path90.effort, path90.score, labelByKey)}`
          : `70+ reached · 90 ${COPY.status.outOfReach}`
        : `to 70: ${formatPlanSummary(path70.keys, path70.effort, path70.score, labelByKey)}`
      : `70 ${COPY.status.outOfReach}`;

  return (
    <section
      aria-label="pull guidance"
      className="rounded-xl border border-line bg-surface px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            pull
          </span>
          <span className="font-mono text-xs text-text-dim tabular-nums">{primarySummary}</span>
          {risk.atRisk ? (
            <span className="font-mono text-[11px] text-status-warning">
              streak {risk.current} at risk until sealed
            </span>
          ) : null}
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex min-h-9 items-center border border-line px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:text-text"
        >
          {expanded ? 'collapse' : 'inspect pull'}
        </button>
      </div>

      {expanded ? (
        <LazyPullExpanded
          day={day}
          domainActive={domainActive}
          entries={deferredEntries}
          days={days}
          liveScore={liveScore}
          satisfiedOn={satisfiedOn}
          effortMap={effortMap}
          labelByKey={labelByKey}
          path70={path70}
          path90={path90}
          risk={risk}
          onWriteEffort={writeEffortWeight}
          formatPlanSummary={formatPlanSummary}
        />
      ) : null}
    </section>
  );
});
