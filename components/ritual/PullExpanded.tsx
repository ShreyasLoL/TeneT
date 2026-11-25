'use client';

import { useMemo, useState } from 'react';
import { FrontierChart } from '@/components/review/FrontierChart';
import type { ApiSealedDay } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import {
  clampEffort,
  marginalValues,
  paretoFrontier,
  selfMatchDelta,
  weeklyPressure,
  type FrontierPoint,
  type StreakRisk,
  type SubsetPlan,
} from '@/lib/domain/optimizer';
import type { DayKey, SatisfiedOn, Trackable } from '@/lib/domain/types';

export type PullExpandedProps = {
  day: DayKey;
  domainActive: Trackable[];
  entries: Record<string, unknown>;
  days: ReadonlyArray<ApiSealedDay>;
  liveScore: number | null;
  satisfiedOn: SatisfiedOn;
  effortMap: Readonly<Record<string, number>>;
  labelByKey: ReadonlyMap<string, string>;
  path70: SubsetPlan | null;
  path90: SubsetPlan | null;
  risk: StreakRisk;
  onWriteEffort: (key: string, level: number) => void;
  formatPlanSummary: (
    keys: string[],
    effort: number,
    score: number,
    labelByKey: ReadonlyMap<string, string>,
  ) => string;
};

export function PullExpanded({
  day,
  domainActive,
  entries,
  days,
  liveScore,
  satisfiedOn,
  effortMap,
  labelByKey,
  path70,
  path90,
  risk,
  onWriteEffort,
  formatPlanSummary,
}: PullExpandedProps) {
  const [selectedEffort, setSelectedEffort] = useState<number | null>(null);

  const marginals = useMemo(
    () => marginalValues(day, domainActive, entries, satisfiedOn),
    [day, domainActive, entries, satisfiedOn],
  );

  const frontier = useMemo(
    () => paretoFrontier(day, domainActive, entries, satisfiedOn, effortMap),
    [day, domainActive, entries, satisfiedOn, effortMap],
  );

  const pressure = useMemo(
    () => weeklyPressure(day, domainActive, satisfiedOn, entries),
    [day, domainActive, entries, satisfiedOn],
  );

  const selfMatch = useMemo(
    () => selfMatchDelta(liveScore, days, day),
    [days, day, liveScore],
  );

  const handleSelectPoint = (pt: FrontierPoint) => {
    setSelectedEffort(pt.effort);
  };

  return (
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
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1 truncate">
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
                        className="flex shrink-0 items-center gap-1"
                      >
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button
                            key={level}
                            type="button"
                            aria-pressed={effort === level}
                            onClick={() => onWriteEffort(m.key, level)}
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
                    <span className="min-w-0 truncate text-text-dim">{p.label}</span>
                    <span
                      className={`shrink-0 ${
                        p.urgent
                          ? 'text-status-warning'
                          : p.needed === 0
                            ? 'text-status-success'
                            : 'text-text-faint'
                      }`}
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
  );
}
