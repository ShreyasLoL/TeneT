'use client';

import { memo, useMemo, useState } from 'react';
import type { ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { COPY } from '@/lib/copy';
import type { DayKey } from '@/lib/domain/types';

type LedgerProps = {
  days: ReadonlyArray<ApiSealedDay>;
  trackables: ReadonlyArray<ApiTrackable>;
  selectedDay: DayKey | null;
  onSelectDay: (day: DayKey) => void;
};

const PAGE_SIZE = 60;

export const Ledger = memo(function Ledger({ days, selectedDay, onSelectDay }: LedgerProps) {
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const ordered = useMemo(() => [...days].sort((a, b) => b.day.localeCompare(a.day)), [days]);

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        <p className="text-sm text-text-dim">{COPY.status.noHistory}</p>
      </div>
    );
  }

  const sliced = ordered.slice(0, visibleLimit);
  const remaining = ordered.length - sliced.length;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
              <th className="px-4 py-3 font-normal">night</th>
              <th className="px-4 py-3 font-normal">score</th>
              <th className="px-4 py-3 font-normal">streak</th>
              <th className="px-4 py-3 font-normal">met</th>
              <th className="px-4 py-3 font-normal">reflection</th>
            </tr>
          </thead>
          <tbody>
            {sliced.map((d) => {
              const active = selectedDay === d.day;
              const counted = d.results.filter((r) => r.scored && r.status !== 'off');
              const metCount = counted.filter((r) => r.satisfied).length;
              return (
                <tr
                  key={d.day}
                  onClick={() => onSelectDay(d.day)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectDay(d.day);
                    }
                  }}
                  aria-selected={active}
                  className={`cursor-pointer border-b border-line/60 text-sm transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] last:border-b-0 ${
                    active ? 'bg-bg text-text' : 'text-text-dim hover:bg-bg/60 hover:text-text'
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap tabular-nums">
                    {d.day}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm whitespace-nowrap text-text tabular-nums">
                    {d.score === null ? '—' : d.score}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap tabular-nums">
                    {d.streak}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap tabular-nums">
                    {metCount}/{counted.length}
                  </td>
                  <td className="max-w-[16rem] truncate px-4 py-3 text-xs text-text-faint sm:max-w-xs">
                    {d.reflection ?? COPY.status.emptyReflection}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {remaining > 0 ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVisibleLimit((v) => v + PAGE_SIZE)}
            className="min-h-10 font-mono text-[11px] uppercase tracking-[0.12em]"
          >
            show {Math.min(PAGE_SIZE, remaining)} older nights ({remaining} left)
          </Button>
        </div>
      ) : null}
    </div>
  );
});
