'use client';

import type { MutableRefObject, RefObject } from 'react';

export const TIMER_RING_R = 126;
export const TIMER_RING_CIRC = 2 * Math.PI * TIMER_RING_R;

type TickSpec = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
};

const TICKS: ReadonlyArray<TickSpec> = Array.from({ length: 60 }, (_, i) => {
  // Start at 12 o'clock (-PI/2) and step clockwise
  const theta = -Math.PI * 0.5 + (i / 60) * Math.PI * 2;
  const major = i % 5 === 0;
  const rInner = major ? 108 : 114;
  const rOuter = 122;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x1: Number((c * rInner).toFixed(2)),
    y1: Number((s * rInner).toFixed(2)),
    x2: Number((c * rOuter).toFixed(2)),
    y2: Number((s * rOuter).toFixed(2)),
    major,
  };
});

export function readCurrentIstSeconds(): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const ss = Number(parts.find((p) => p.type === 'second')?.value ?? 0);
    return hh * 3600 + mm * 60 + ss;
  } catch {
    const now = new Date();
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  }
}

export function formatSecondsHms(totalSeconds: number): string {
  const clamped = Math.max(0, Math.min(86399, Math.round(totalSeconds)));
  const hh = Math.floor(clamped / 3600);
  const mm = Math.floor((clamped % 3600) / 60);
  const ss = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} IST`;
}

export function IntroDial({
  hairlineRef,
  dialGroupRef,
  tickRefs,
  timerRingRef,
  clockReadoutRef,
  nightBeginsRef,
}: {
  hairlineRef: RefObject<HTMLDivElement | null>;
  dialGroupRef: RefObject<SVGGElement | null>;
  tickRefs: MutableRefObject<Array<SVGLineElement | null>>;
  timerRingRef: RefObject<SVGCircleElement | null>;
  clockReadoutRef: RefObject<HTMLSpanElement | null>;
  nightBeginsRef: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <>
      {/* 0.0-0.8s: single 1px --line hairline sweeping across the void */}
      <div
        ref={hairlineRef}
        className="pointer-events-none absolute h-px w-[min(78vw,560px)] origin-center bg-[var(--line)] opacity-0"
      />

      {/* 60 radial clock ticks + thin timer ring around TENET */}
      <svg
        viewBox="-150 -150 300 300"
        className="pointer-events-none absolute size-[min(78vw,380px)] overflow-visible"
      >
        <g ref={dialGroupRef}>
          {TICKS.map((t, idx) => (
            <line
              key={idx}
              ref={(el) => {
                tickRefs.current[idx] = el;
              }}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.major ? 'var(--text-dim)' : 'var(--line)'}
              strokeWidth={t.major ? 1.25 : 1}
              opacity={0}
            />
          ))}
        </g>

        <circle
          ref={timerRingRef}
          cx={0}
          cy={0}
          r={TIMER_RING_R}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.72}
          strokeWidth={1}
          strokeDasharray={TIMER_RING_CIRC}
          strokeDashoffset={TIMER_RING_CIRC}
          transform="rotate(-90)"
          opacity={0}
        />
      </svg>

      {/* 2.0-3.2s: IST HH:MM:SS count-up + NIGHT BEGINS */}
      <div className="pointer-events-none absolute translate-y-[4.6rem] flex flex-col items-center gap-1.5 text-center sm:translate-y-[5.4rem]">
        <span
          ref={clockReadoutRef}
          className="font-mono text-[11px] tracking-[0.22em] text-text-dim opacity-0 tabular-nums sm:text-xs"
        >
          00:00:00 IST
        </span>
        <span
          ref={nightBeginsRef}
          className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent opacity-0"
        >
          night begins
        </span>
      </div>
    </>
  );
}
