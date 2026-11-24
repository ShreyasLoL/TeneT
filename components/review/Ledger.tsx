'use client';

import type { ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import type { DayKey } from '@/lib/domain/types';

type LedgerProps = {
  days: ReadonlyArray<ApiSealedDay>;
  trackables: ReadonlyArray<ApiTrackable>;
  selectedDay: DayKey | null;
  onSelectDay: (day: DayKey) => void;
};

export function Ledger({ days, selectedDay, onSelectDay }: LedgerProps) {
  const ordered = [...days].sort((a, b) => b.day.localeCompare(a.day));

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        <p className="text-sm text-text-dim">{COPY.status.noHistory}</p>
      </div>
    );
  }

  return (
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
          {ordered.map((d) => {
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
                <td className="px-4 py-3 font-mono text-xs tabular-nums">{d.day}</td>
                <td className="px-4 py-3 font-mono text-sm tabular-nums text-text">
                  {d.score === null ? '—' : d.score}
                </td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums">{d.streak}</td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums">
                  {metCount}/{counted.length}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-xs text-text-faint">
                  {d.reflection ?? COPY.status.emptyReflection}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
