'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiSealedDay } from '@/lib/api/types';
import { addDays, diffDays } from '@/lib/domain/day';
import type { DayKey } from '@/lib/domain/types';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import { DrivenSpring, rubberBand } from '@/lib/stage/spring';
import { clearRigCursorVelocity, setRigScrub, setRigTurnstilePulse } from '@/lib/store/rig';
import { buildVisibleTapeTicks, formatAriaDay } from '@/lib/viz/timeTape';

type TimeTapeProps = {
  from: DayKey;
  to: DayKey;
  cursor: DayKey;
  days: ReadonlyArray<ApiSealedDay>;
  onChangeCursor: (day: DayKey) => void;
};

const PX_PER_DAY = 18;

export const TimeTape = memo(function TimeTape({
  from,
  to,
  cursor,
  days,
  onChangeCursor,
}: TimeTapeProps) {
  const dragRef = useRef<{
    startX: number;
    lastX: number;
    lastTs: number;
    velocityPxPerSec: number;
    startDay: DayKey;
    releaseLease: (() => void) | null;
  } | null>(null);

  const lastSignRef = useRef<number>(1);
  const pulseTimerRef = useRef<number | null>(null);
  const pendingDayRef = useRef<DayKey | null>(null);
  const flushUnsubRef = useRef<(() => void) | null>(null);
  const cursorRef = useRef<DayKey>(cursor);

  const [rubberShiftPx, setRubberShiftPx] = useState(0);
  const rubberSpringRef = useRef<DrivenSpring | null>(null);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    const spring = new DrivenSpring(0, 22, (v) => {
      setRubberShiftPx(Math.abs(v) < 0.2 ? 0 : v);
    });
    rubberSpringRef.current = spring;
    return () => {
      spring.stop();
      rubberSpringRef.current = null;
      if (flushUnsubRef.current) {
        flushUnsubRef.current();
        flushUnsubRef.current = null;
      }
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current);
      }
      dragRef.current?.releaseLease?.();
      clearRigCursorVelocity();
    };
  }, []);

  const sealedByDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const totalSpan = Math.max(1, diffDays(to, from));
  const currentOffset = Math.min(totalSpan, Math.max(0, diffDays(to, cursor)));

  const visibleTicks = useMemo(
    () => buildVisibleTapeTicks(cursor, from, to, sealedByDay),
    [cursor, from, sealedByDay, to],
  );

  const scheduleCursorCommit = (clamped: DayKey) => {
    pendingDayRef.current = clamped;
    if (flushUnsubRef.current !== null) return;
    flushUnsubRef.current = stageClock.subscribe(() => {
      flushUnsubRef.current = null;
      const next = pendingDayRef.current;
      pendingDayRef.current = null;
      if (next && next !== cursorRef.current) {
        cursorRef.current = next;
        onChangeCursor(next);
      }
      return false;
    });
  };

  const moveTo = (rawCandidateDay: DayKey, immediateCommit = false) => {
    const clamped = rawCandidateDay < from ? from : rawCandidateDay > to ? to : rawCandidateDay;
    const base = pendingDayRef.current ?? cursorRef.current;
    if (clamped === base) return;

    const delta = diffDays(clamped, base);
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

    if (immediateCommit) {
      pendingDayRef.current = null;
      cursorRef.current = clamped;
      onChangeCursor(clamped);
    } else {
      scheduleCursorCommit(clamped);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const base = pendingDayRef.current ?? cursorRef.current;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveTo(addDays(base, -1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveTo(addDays(base, 1));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      moveTo(addDays(base, -7));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      moveTo(addDays(base, 7));
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveTo(from, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      moveTo(to, true);
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    const projectedDays = Math.round((drag.velocityPxPerSec * 0.12) / PX_PER_DAY);
    if (projectedDays !== 0) {
      const base = pendingDayRef.current ?? cursorRef.current;
      moveTo(addDays(base, -projectedDays));
    }

    rubberSpringRef.current?.to(0);
    drag.releaseLease?.();
    clearRigCursorVelocity();
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
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore synthetic pointer capture errors
          }
          rubberSpringRef.current?.stop();
          dragRef.current = {
            startX: e.clientX,
            lastX: e.clientX,
            lastTs: performance.now(),
            velocityPxPerSec: 0,
            startDay: cursorRef.current,
            releaseLease: acquireFrames('time-scrub'),
          };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag) return;
          const now = performance.now();
          const dtSec = Math.max(0.004, (now - drag.lastTs) / 1000);
          const instVel = (e.clientX - drag.lastX) / dtSec;
          drag.velocityPxPerSec = drag.velocityPxPerSec * 0.6 + instVel * 0.4;
          drag.lastX = e.clientX;
          drag.lastTs = now;

          const dx = e.clientX - drag.startX;
          const rawDayDelta = -Math.round(dx / PX_PER_DAY);
          const unclampedDay = addDays(drag.startDay, rawDayDelta);

          if (unclampedDay < from) {
            rubberSpringRef.current?.snap(rubberBand(diffDays(from, unclampedDay) * PX_PER_DAY, 64));
          } else if (unclampedDay > to) {
            rubberSpringRef.current?.snap(-rubberBand(diffDays(unclampedDay, to) * PX_PER_DAY, 64));
          } else if (rubberShiftPx !== 0) {
            rubberSpringRef.current?.snap(0);
          }

          moveTo(unclampedDay);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(e) => {
          const base = pendingDayRef.current ?? cursorRef.current;
          const dir = e.deltaY > 0 || e.deltaX > 0 ? 1 : -1;
          moveTo(addDays(base, dir));
        }}
        className="relative h-20 w-full touch-none select-none overflow-hidden rounded-lg border border-line bg-bg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-10 w-px -translate-x-1/2 bg-accent"
        />

        <div
          className="absolute inset-0 will-change-transform"
          style={
            rubberShiftPx !== 0
              ? { transform: `translate3d(${rubberShiftPx.toFixed(1)}px, 0, 0)` }
              : undefined
          }
        >
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
                onClick={() => moveTo(tick.day, true)}
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
      </div>

      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        drag or use ←/→ (1d) · pgup/pgdn (7d) · home/end
      </p>
    </div>
  );
});
