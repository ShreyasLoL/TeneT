'use client';

import Link from 'next/link';
import { memo, useMemo, useState } from 'react';
import type { ApiArea, ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import type { DayKey } from '@/lib/domain/types';
import { computeAreaMomentum } from '@/lib/viz/retrogradeData';

type RetrogradeEditorialProps = {
  days: ReadonlyArray<ApiSealedDay>;
  areas: ReadonlyArray<ApiArea>;
  trackables: ReadonlyArray<ApiTrackable>;
  selectedDay: DayKey;
  endDay: DayKey;
  onSelectDay: (day: DayKey) => void;
};

export const RetrogradeEditorial = memo(function RetrogradeEditorial({
  days,
  areas,
  trackables,
  selectedDay,
  endDay,
  onSelectDay,
}: RetrogradeEditorialProps) {
  const [limit, setLimit] = useState(30);

  const momentum = useMemo(
    () => computeAreaMomentum(days, areas, trackables, endDay),
    [areas, days, endDay, trackables],
  );

  const ordered = useMemo(() => [...days].sort((a, b) => b.day.localeCompare(a.day)), [days]);
  const sliced = ordered.slice(0, limit);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {momentum.map((m) => {
          const pct = m.rate === null ? '—' : `${Math.round(m.rate * 100)}%`;
          const deltaPct = m.delta === null ? null : Math.round(m.delta * 100);
          return (
            <Link
              key={m.area.id}
              href={`/area/${m.area.slug}`}
              className="group rounded-md border border-line bg-bg/84 p-3.5 transition-[border-color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:border-text-dim/55 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim group-hover:text-text">
                  {m.area.name}
                </span>
                {deltaPct !== null ? (
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      deltaPct > 0
                        ? 'text-accent'
                        : deltaPct < 0
                          ? 'text-text-faint'
                          : 'text-text-dim'
                    }`}
                  >
                    {deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}
                  </span>
                ) : null}
              </div>

              <div className="mt-2.5 flex items-end justify-between gap-3">
                <span className="font-mono text-2xl font-light tracking-[-0.03em] text-text tabular-nums">
                  {pct}
                </span>
                <svg viewBox="0 0 70 22" className="h-[22px] w-[70px] shrink-0" aria-hidden="true">
                  {m.series.map((val, i) => {
                    const h = val === null ? 2 : Math.max(3, Math.round((val / 100) * 20));
                    return (
                      <rect
                        key={i}
                        x={i * 5}
                        y={22 - h}
                        width={3}
                        height={h}
                        fill={
                          val === null
                            ? 'var(--line)'
                            : val >= 80
                              ? 'var(--accent)'
                              : 'rgba(245, 243, 247, 0.55)'
                        }
                      />
                    );
                  })}
                </svg>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-bg/84">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
          <span>night tape // {ordered.length} sealed</span>
          <span>score</span>
        </div>

        <div className="max-h-[340px] divide-y divide-line/60 overflow-y-auto overscroll-contain">
          {sliced.map((d) => {
            const active = selectedDay === d.day;
            const counted = d.results.filter((r) => r.scored && r.status !== 'off');
            const met = counted.filter((r) => r.satisfied).length;
            const pct = d.score ?? 0;

            return (
              <button
                key={d.day}
                type="button"
                onClick={() => onSelectDay(d.day)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring ${
                  active ? 'bg-surface text-text' : 'text-text-dim hover:bg-surface/50 hover:text-text'
                }`}
              >
                <span className="w-20 shrink-0 font-mono text-[11px] tabular-nums">{d.day}</span>
                <span className="h-[2px] w-16 shrink-0 bg-line">
                  <span
                    className={`block h-full ${active ? 'bg-accent' : 'bg-text/75'}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 font-mono text-xs text-text tabular-nums">
                  {d.score === null ? '—' : d.score}
                </span>
                <span className="w-10 shrink-0 font-mono text-[11px] text-text-faint tabular-nums">
                  {met}/{counted.length}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-text-faint">
                  {d.reflection ?? COPY.status.emptyReflection}
                </span>
              </button>
            );
          })}
        </div>

        {ordered.length > limit ? (
          <button
            type="button"
            onClick={() => setLimit((n) => n + 30)}
            className="w-full border-t border-line py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint hover:text-text"
          >
            load older nights ({ordered.length - limit} remaining)
          </button>
        ) : null}
      </div>
    </div>
  );
});
