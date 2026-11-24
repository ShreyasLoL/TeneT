'use client';

import { useMemo, useRef } from 'react';
import type { ApiSealedDay } from '@/lib/api/types';
import { addDays, diffDays } from '@/lib/domain/day';
import type { DayKey } from '@/lib/domain/types';
import { clearRigCursorVelocity, setRigScrub, setRigTurnstilePulse } from '@/lib/store/rig';
import { tapeOffset } from '@/lib/viz/timeTape';

type TimeTapeProps = {
  from: DayKey;
  to: DayKey;
  cursor: DayKey;
  days: ReadonlyArray<ApiSealedDay>;
  onChangeCursor: (day: DayKey) => void;
};

function formatAriaDay(day: DayKey, today: DayKey, score: number | null | undefined): string {
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const month = utc.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase();
  const ago = Math.max(0, diffDays(today, day));
  const scorePart = score === null || score === undefined ? 'void' : `score ${score}`;
  return `${d} ${month}, ${scorePart}, ${ago} nights ago`;
}

export function TimeTape({ from, to, cursor, days, onChangeCursor }: TimeTapeProps) {
  const dragStartRef = useRef<{ x: number; startDay: DayKey } | null>(null);
  const lastSignRef = useRef<number>(1);
  const pulseTimerRef = useRef<number | null>(null);

  const sealedByDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const totalSpan = Math.max(1, diffDays(to, from));
  const currentOffset = Math.min(totalSpan, Math.max(0, diffDays(to, cursor)));

  const visibleTicks = useMemo(() => {
    const out: { day: DayKey; delta: number; xPx: number; score: number | null; isVoid: boolean }[] = [];
    for (let offset = -36; offset <= 36; offset++) {
      const day = addDays(cursor, offset);
      if (day < from || day > to) continue;
      const sealed = sealedByDay.get(day);
      out.push({
        day,
        delta: offset,
        xPx: tapeOffset(offset, 92, 3.5),
        score: sealed ? sealed.score : null,
        isVoid: !sealed,
      });
    }
    return out;
  }, [cursor, from, sealedByDay, to]);

  const moveTo = (nextDay: DayKey) => {
    const clamped = nextDay < from ? from : nextDay > to ? to : nextDay;
    if (clamped === cursor) return;

    const delta = diffDays(clamped, cursor);
    const nextSign = delta < 0 ? -1 : 1;
    const flipped = nextSign !== lastSignRef.current;
    setRigScrub(delta * 2.2, nextSign, flipped ? 1 : undefined);

    if (flipped) {
      lastSignRef.current = nextSign;
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => {
        setRigTurnstilePulse(0);
      }, 280);
    }

    onChangeCursor(clamped);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveTo(addDays(cursor, -1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveTo(addDays(cursor, 1));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      moveTo(addDays(cursor, -7));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      moveTo(addDays(cursor, 7));
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveTo(from);
    } else if (e.key === 'End') {
      e.preventDefault();
      moveTo(to);
    }
  };

  const activeSealed = sealedByDay.get(cursor);

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim tabular-nums">
        <span>{cursor}</span>
        <span>{formatAriaDay(cursor, to, activeSealed?.score)}</span>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Time scrubber"
        aria-valuemin={0}
        aria-valuemax={totalSpan}
        aria-valuenow={totalSpan - currentOffset}
        aria-valuetext={formatAriaDay(cursor, to, activeSealed?.score)}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragStartRef.current = { x: e.clientX, startDay: cursor };
        }}
        onPointerMove={(e) => {
          if (!dragStartRef.current) return;
          const dx = e.clientX - dragStartRef.current.x;
          const dayDelta = Math.round(dx / 18);
          moveTo(addDays(dragStartRef.current.startDay, dayDelta));
        }}
        onPointerUp={() => {
          dragStartRef.current = null;
          clearRigCursorVelocity();
        }}
        onPointerCancel={() => {
          dragStartRef.current = null;
          clearRigCursorVelocity();
        }}
        onWheel={(e) => {
          const dir = e.deltaY > 0 || e.deltaX > 0 ? 1 : -1;
          moveTo(addDays(cursor, dir));
        }}
        className="relative h-20 w-full touch-none select-none overflow-hidden rounded-lg border border-line bg-bg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Center symmetric axis */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-accent"
        />

        {visibleTicks.map((tick) => {
          const height = tick.isVoid
            ? 14
            : Math.max(18, Math.round(18 + ((tick.score ?? 30) / 100) * 34));
          const isCurrent = tick.day === cursor;
          return (
            <button
              key={tick.day}
              type="button"
              tabIndex={-1}
              aria-label={tick.day}
              onClick={() => moveTo(tick.day)}
              style={{
                left: `calc(50% + ${tick.xPx.toFixed(1)}px)`,
                height: `${height}px`,
              }}
              className={`absolute bottom-3 w-1.5 -translate-x-1/2 rounded-full transition-[height,opacity] duration-[var(--duration-micro)] ease-[var(--ease-out)] ${
                isCurrent
                  ? 'bg-accent'
                  : tick.isVoid
                    ? 'border border-text-faint/45 bg-transparent'
                    : 'bg-text-dim/65 hover:bg-text'
              }`}
            />
          );
        })}
      </div>

      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        drag or use ←/→ (1d) · pgup/pgdn (7d) · home/end
      </p>
    </div>
  );
}
