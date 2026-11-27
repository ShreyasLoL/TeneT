'use client';

import { memo, useMemo, useState } from 'react';
import type { ApiSealedDay } from '@/lib/api/types';
import type { DayKey } from '@/lib/domain/types';
import { buildCalendarMatrix, type TimelineDay } from '@/lib/viz/retrogradeData';

type RetrogradeMatrixProps = {
  days: ReadonlyArray<ApiSealedDay>;
  selectedDay: DayKey;
  endDay: DayKey;
  onSelectDay: (day: DayKey) => void;
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export const RetrogradeMatrix = memo(function RetrogradeMatrix({
  days,
  selectedDay,
  endDay,
  onSelectDay,
}: RetrogradeMatrixProps) {
  const [hovered, setHovered] = useState<TimelineDay | null>(null);

  const cells = useMemo(() => buildCalendarMatrix(days, endDay, 12), [days, endDay]);

  const stats = useMemo(() => {
    const active = cells.filter((c) => !c.future);
    const sealed = active.filter((c) => !c.isVoid);
    const scored = sealed.filter((c) => c.score !== null);
    const avg =
      scored.length > 0
        ? Math.round(scored.reduce((sum, c) => sum + (c.score ?? 0), 0) / scored.length)
        : null;
    return { total: active.length, sealedCount: sealed.length, avg };
  }, [cells]);

  return (
    <div className="flex flex-col justify-between gap-6 rounded-md border border-line bg-bg/84 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint tabular-nums">
        <span>ephemeris matrix // 12 weeks</span>
        <span>
          {hovered
            ? `${hovered.day} · ${hovered.score === null ? 'void' : hovered.score}`
            : `${stats.sealedCount}/${stats.total} sealed`}
        </span>
      </div>

      <div className="flex items-stretch gap-3 py-2">
        <div className="grid grid-rows-7 gap-1.5 font-mono text-[10px] text-text-faint">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="flex items-center justify-center">
              {w}
            </span>
          ))}
        </div>

        <div className="grid flex-1 grid-flow-col grid-rows-7 gap-1.5 sm:gap-2">
          {cells.map((cell) => {
            if (cell.future) {
              return <div key={cell.day} aria-hidden="true" className="aspect-square" />;
            }
            const active = cell.day === selectedDay;
            const score = cell.score ?? 0;
            const fillClass = cell.isVoid
              ? 'border border-line/60 bg-transparent'
              : score >= 100
                ? 'bg-accent/90'
                : score >= 80
                  ? 'bg-text/80'
                  : score >= 50
                    ? 'bg-text-dim/55'
                    : 'bg-text-dim/25';

            return (
              <button
                key={cell.day}
                type="button"
                aria-label={`${cell.day}: ${cell.isVoid ? 'void' : `score ${score}`}`}
                aria-pressed={active}
                onClick={() => onSelectDay(cell.day)}
                onMouseEnter={() => setHovered(cell)}
                onMouseLeave={() => setHovered(null)}
                className={`aspect-square w-full rounded-[2px] transition-[transform,border-color,background-color] duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${fillClass} ${
                  active ? 'ring-1 ring-accent ring-offset-2 ring-offset-bg' : ''
                }`}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint tabular-nums">
        <span>{stats.avg === null ? 'avg —' : `avg score ${stats.avg}`}</span>
        <div className="flex items-center gap-2">
          <span>void</span>
          <span className="inline-block size-2.5 rounded-[1px] border border-line/60" />
          <span className="inline-block size-2.5 rounded-[1px] bg-text-dim/25" />
          <span className="inline-block size-2.5 rounded-[1px] bg-text-dim/55" />
          <span className="inline-block size-2.5 rounded-[1px] bg-text/80" />
          <span className="inline-block size-2.5 rounded-[1px] bg-accent/90" />
          <span>100</span>
        </div>
      </div>
    </div>
  );
});
