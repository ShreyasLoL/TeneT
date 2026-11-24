'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { FrontierChart } from '@/components/review/FrontierChart';
import type { ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import {
  cheapestPathToTarget,
  clampEffort,
  marginalValues,
  paretoFrontier,
  selfMatchDelta,
  streakRisk,
  weeklyPressure,
  type FrontierPoint,
} from '@/lib/domain/optimizer';
import { satisfiedOnFromDays } from '@/lib/domain/satisfiedOnFromDays';
import type { DayKey, Trackable } from '@/lib/domain/types';

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
  const raw = window.localStorage.getItem(EFFORT_STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedParsed = parseEffortMap(raw);
  }
  return cachedParsed;
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
  const current = { ...getEffortSnapshot(), [key]: clampEffort(nextValue) };
  const raw = JSON.stringify(current);
  cachedRaw = raw;
  cachedParsed = current;
  window.localStorage.setItem(EFFORT_STORAGE_KEY, raw);
  window.dispatchEvent(new Event(EFFORT_EVENT));
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

export function Pull({
  day,
  active,
  entries,
  days,
  liveScore,
  isSealed = false,
  defaultExpanded = false,
}: PullProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [selectedEffort, setSelectedEffort] = useState<number | null>(null);
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

  const marginals = useMemo(
    () => marginalValues(day, domainActive, entries, satisfiedOn),
    [day, domainActive, entries, satisfiedOn],
  );

  const path70 = useMemo(
    () => cheapestPathToTarget(day, domainActive, entries, satisfiedOn, effortMap, 70),
    [day, domainActive, entries, satisfiedOn, effortMap],
  );

  const path90 = useMemo(
    () => cheapestPathToTarget(day, domainActive, entries, satisfiedOn, effortMap, 90),
    [day, domainActive, entries, satisfiedOn, effortMap],
  );

  const frontier = useMemo(
    () => paretoFrontier(day, domainActive, entries, satisfiedOn, effortMap),
    [day, domainActive, entries, satisfiedOn, effortMap],
  );

  const pressure = useMemo(
    () => weeklyPressure(day, domainActive, satisfiedOn, entries),
    [day, domainActive, entries, satisfiedOn],
  );

  const sealedDayKeys = useMemo(() => days.map((d) => d.day), [days]);
  const risk = useMemo(() => streakRisk(sealedDayKeys, day), [day, sealedDayKeys]);
  const selfMatch = useMemo(
    () => selfMatchDelta(liveScore, days, day),
    [days, day, liveScore],
  );

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

  const handleSelectPoint = (pt: FrontierPoint) => {
    setSelectedEffort(pt.effort);
  };

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
        <div className="mt-4 space-y-5 border-t border-line pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-bg/60 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                cheapest path {'\u2265'} 70
              </p>
              <p className="mt-1 font-mono text-xs text-text tabular-nums">
                {path70
                  ? formatPlanSummary(path70.keys, path70.effort, path70.score, labelByKey)
                  : COPY.status.outOfReach}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-bg/60 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                cheapest path {'\u2265'} 90
              </p>
              <p className="mt-1 font-mono text-xs text-text tabular-nums">
                {path90
                  ? formatPlanSummary(path90.keys, path90.effort, path90.score, labelByKey)
                  : COPY.status.outOfReach}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-bg/60 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                vs 14-night mean
              </p>
              <p className="mt-1 font-mono text-xs text-text tabular-nums">
                {selfMatch.trailingMean === null
                  ? COPY.pace.no_data
                  : selfMatch.delta === null
                    ? `mean ${selfMatch.trailingMean}`
                    : `${selfMatch.delta >= 0 ? '+' : ''}${selfMatch.delta} (${selfMatch.trailingMean} mean)`}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-bg/60 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                streak & 30d seal rate
              </p>
              <p className="mt-1 font-mono text-xs text-text tabular-nums">
                {risk.sealedToday
                  ? `${risk.current} sealed (${Math.round(risk.rate30Now * 100)}%)`
                  : `${risk.current} \u2192 ${risk.ifSealedTonight} (${Math.round(risk.rate30Now * 100)}% \u2192 ${Math.round(risk.rate30IfSealed * 100)}%)`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-6">
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                  marginal lift & effort cost (1 easy · 5 heavy)
                </p>
                {marginals.length === 0 ? (
                  <p className="font-mono text-xs text-text-faint">
                    all scored candidates satisfied or off today.
                  </p>
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line bg-bg/60">
                    {marginals.map((m) => {
                      const effort = clampEffort(effortMap[m.key]);
                      return (
                        <li
                          key={m.key}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <span className="text-sm text-text">{m.label}</span>
                            <span className="ml-2 font-mono text-[11px] text-accent tabular-nums">
                              {m.delta >= 0 ? `+${m.delta}` : m.delta}
                            </span>
                            <span className="ml-2 font-mono text-[10px] uppercase text-text-faint">
                              {m.status}
                            </span>
                          </div>

                          <div
                            role="group"
                            aria-label={`${m.label} effort`}
                            className="flex items-center gap-1"
                          >
                            {[1, 2, 3, 4, 5].map((level) => (
                              <button
                                key={level}
                                type="button"
                                aria-pressed={effort === level}
                                onClick={() => writeEffortWeight(m.key, level)}
                                className={`min-h-8 min-w-8 rounded border font-mono text-[11px] tabular-nums transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] ${
                                  effort === level
                                    ? 'border-accent text-accent'
                                    : 'border-line text-text-faint hover:text-text'
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {pressure.length > 0 ? (
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                    weekly quota pressure
                  </p>
                  <ul className="space-y-1.5 rounded-lg border border-line bg-bg/60 p-3">
                    {pressure.map((p) => (
                      <li
                        key={p.key}
                        className="flex items-center justify-between gap-3 font-mono text-xs tabular-nums"
                      >
                        <span className="text-text-dim">{p.label}</span>
                        <span
                          className={
                            p.urgent
                              ? 'text-status-warning'
                              : p.needed === 0
                                ? 'text-status-success'
                                : 'text-text-faint'
                          }
                        >
                          {p.done}/{p.quota} done · {p.daysLeft}d left
                          {p.urgent ? ' · due tonight' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-line bg-bg/60 p-4 lg:col-span-6">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                effort / score frontier
              </p>
              <FrontierChart
                points={frontier}
                labelByKey={labelByKey}
                selectedEffort={selectedEffort}
                onSelectPoint={handleSelectPoint}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
