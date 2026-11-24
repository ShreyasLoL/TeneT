'use client';

import { useMemo, useState } from 'react';
import type { ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { addDays, weekStart } from '@/lib/domain/day';
import type { DayKey } from '@/lib/domain/types';

type MirrorWeekProps = {
  today: DayKey;
  days: ReadonlyArray<ApiSealedDay>;
  trackables: ReadonlyArray<ApiTrackable>;
};

const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function meanScore(list: ReadonlyArray<ApiSealedDay | undefined>): number | null {
  const scored = list.filter((d): d is ApiSealedDay => Boolean(d && d.score !== null));
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((s, d) => s + (d.score ?? 0), 0) / scored.length);
}

export function MirrorWeek({ today, days, trackables }: MirrorWeekProps) {
  const [tableView, setTableView] = useState(false);

  const sealedByDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const thisMon = weekStart(today);
  const lastMon = addDays(thisMon, -7);

  const rows = useMemo(() => {
    return WEEKDAY_NAMES.map((name, idx) => {
      const prevDay = addDays(lastMon, idx);
      const currDay = addDays(thisMon, idx);
      return {
        weekday: name,
        prevDay,
        currDay,
        prev: sealedByDay.get(prevDay),
        curr: sealedByDay.get(currDay),
      };
    });
  }, [lastMon, sealedByDay, thisMon]);

  const thisWeekSealed = rows.map((r) => r.curr).filter((d): d is ApiSealedDay => Boolean(d));
  const lastWeekSealed = rows.map((r) => r.prev).filter((d): d is ApiSealedDay => Boolean(d));
  const thisMean = meanScore(thisWeekSealed);
  const lastMean = meanScore(lastWeekSealed);

  const scoredValues = thisWeekSealed
    .map((d) => d.score)
    .filter((s): s is number => s !== null);
  const best = scoredValues.length > 0 ? Math.max(...scoredValues) : null;
  const worst = scoredValues.length > 0 ? Math.min(...scoredValues) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-5">
        <div className="flex flex-wrap gap-8 font-mono tabular-nums">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-faint">this week</p>
            <p className="mt-1 text-3xl font-light text-text">
              {thisMean === null ? '—' : thisMean}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-faint">last week</p>
            <p className="mt-1 text-3xl font-light text-text-dim">
              {lastMean === null ? '—' : lastMean}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-faint">sealed</p>
            <p className="mt-1 text-2xl font-light text-text">{thisWeekSealed.length}/7</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-faint">best / worst</p>
            <p className="mt-1 text-2xl font-light text-text-dim">
              {best === null ? '—' : best} / {worst === null ? '—' : worst}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setTableView((v) => !v)}
          className="min-h-10 font-mono text-[11px] uppercase tracking-[0.12em]"
        >
          {tableView ? 'mirror view' : 'table view'}
        </Button>
      </div>

      {tableView ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-text-faint">
                <th className="px-4 py-3 font-normal">day</th>
                <th className="px-4 py-3 font-normal">last week</th>
                <th className="px-4 py-3 font-normal">this week</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.weekday} className="border-b border-line/60 last:border-b-0">
                  <td className="px-4 py-3 uppercase text-text-dim">{r.weekday}</td>
                  <td className="px-4 py-3 text-text-dim">
                    {r.prev ? (r.prev.score === null ? '—' : r.prev.score) : 'void'}
                  </td>
                  <td className="px-4 py-3 text-text">
                    {r.curr ? (r.curr.score === null ? '—' : r.curr.score) : 'void'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4 font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
            <span className="text-right">last week</span>
            <span className="text-center">axis</span>
            <span>this week</span>
          </div>

          <div className="space-y-3">
            {rows.map((r) => {
              const prevW = r.prev?.score ?? 0;
              const currW = r.curr?.score ?? 0;
              return (
                <div
                  key={r.weekday}
                  className="grid grid-cols-[1fr_3rem_1fr] items-center gap-3"
                >
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-mono text-[11px] text-text-faint tabular-nums">
                      {r.prev ? (r.prev.score ?? '—') : '·'}
                    </span>
                    <div className="flex h-3 w-full max-w-xs justify-end">
                      {r.prev ? (
                        <div
                          style={{ width: `${Math.max(4, prevW)}%` }}
                          className="h-full rounded-l bg-text-dim/45"
                        />
                      ) : (
                        <div className="h-full w-6 rounded-l border border-dashed border-line" />
                      )}
                    </div>
                  </div>

                  <span className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
                    {r.weekday}
                  </span>

                  <div className="flex items-center gap-2">
                    <div className="flex h-3 w-full max-w-xs">
                      {r.curr ? (
                        <div
                          style={{ width: `${Math.max(4, currW)}%` }}
                          className="h-full rounded-r bg-accent/85"
                        />
                      ) : (
                        <div className="h-full w-6 rounded-r border border-dashed border-line" />
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-text tabular-nums">
                      {r.curr ? (r.curr.score ?? '—') : '·'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7x7 per-trackable small multiples */}
      <section aria-label="49-day trackable cadence" className="space-y-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          49-night cadence
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trackables.map((t) => {
            const cells = Array.from({ length: 49 }, (_, idx) => {
              const d = addDays(today, idx - 48);
              const sealed = sealedByDay.get(d);
              const res = sealed?.results.find((r) => r.key === t.key);
              return { day: d, res, isVoid: !sealed };
            });

            return (
              <div
                key={t.key}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <p className="mb-3 truncate text-sm text-text">{t.label}</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {cells.map((cell) => (
                    <span
                      key={cell.day}
                      title={cell.day}
                      className={`size-3 rounded-[2px] ${
                        cell.isVoid
                          ? 'border border-line/60 bg-transparent'
                          : cell.res?.satisfied
                            ? 'bg-accent'
                            : cell.res?.status === 'off'
                              ? 'bg-line'
                              : 'bg-bg ring-1 ring-line'
                      }`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
