'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import type { DayKey } from '@/lib/domain/types';
import { DrivenSpring } from '@/lib/stage/spring';
import { buildTimelineWindow } from '@/lib/viz/retrogradeData';
import { TimeRuler } from './TimeRuler';

type RetrogradeDialProps = {
  days: ReadonlyArray<ApiSealedDay>;
  trackables: ReadonlyArray<ApiTrackable>;
  selectedDay: DayKey;
  endDay: DayKey;
  onSelectDay: (day: DayKey) => void;
};

const DIAL_TICKS = Array.from({ length: 60 }, (_, i) => {
  const th = -Math.PI * 0.5 + (i / 60) * Math.PI * 2;
  const major = i % 5 === 0;
  const rIn = major ? 108 : 114;
  return {
    x1: Number((Math.cos(th) * rIn).toFixed(2)),
    y1: Number((Math.sin(th) * rIn).toFixed(2)),
    x2: Number((Math.cos(th) * 122).toFixed(2)),
    y2: Number((Math.sin(th) * 122).toFixed(2)),
    major,
  };
});

const RING_R = 88;
const RING_CIRC = 2 * Math.PI * RING_R;
const INNER_R = 73;
const INNER_CIRC = 2 * Math.PI * INNER_R;
const NAV_BTN =
  'inline-flex h-7 items-center justify-center rounded border border-line text-text-dim transition-[color,border-color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:border-text-dim/60 hover:text-text active:scale-[0.95] disabled:opacity-30';

export const RetrogradeDial = memo(function RetrogradeDial({
  days,
  trackables,
  selectedDay,
  endDay,
  onSelectDay,
}: RetrogradeDialProps) {
  const [hoveredSegKey, setHoveredSegKey] = useState<string | null>(null);

  const labelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trackables) m.set(t.key, t.label);
    return m;
  }, [trackables]);

  const ruler = useMemo(() => buildTimelineWindow(days, endDay, 60), [days, endDay]);
  const selectedSealed = useMemo(
    () => days.find((d) => d.day === selectedDay) ?? null,
    [days, selectedDay],
  );

  const selIdx = ruler.findIndex((d) => d.day === selectedDay);
  const prevDay = selIdx > 0 ? ruler[selIdx - 1].day : null;
  const nextDay = selIdx >= 0 && selIdx < ruler.length - 1 ? ruler[selIdx + 1].day : null;
  const latestDay = ruler[ruler.length - 1]?.day ?? null;

  const targetScore = selectedSealed?.score ?? null;
  const segments = selectedSealed?.results ?? [];
  const segCount = segments.length;
  const hoveredSeg = segments.find((s) => s.key === hoveredSegKey) ?? null;

  const scoreTextRef = useRef<SVGTextElement | null>(null);
  const innerArcRef = useRef<SVGCircleElement | null>(null);
  const needleRef = useRef<SVGGElement | null>(null);
  const springRef = useRef<DrivenSpring | null>(null);
  const hasScoreRef = useRef(targetScore !== null);

  const [initialScoreVal] = useState(() => targetScore ?? 0);
  const [initialHasScore] = useState(() => targetScore !== null);

  useEffect(() => {
    const spring = new DrivenSpring(initialScoreVal, 15, (val) => {
      const clamped = Math.max(0, Math.min(100, val));
      if (scoreTextRef.current) {
        scoreTextRef.current.textContent = hasScoreRef.current ? String(Math.round(clamped)) : '—';
      }
      if (innerArcRef.current) {
        const offset = (INNER_CIRC * (1 - clamped / 100)).toFixed(2);
        innerArcRef.current.setAttribute('stroke-dashoffset', offset);
      }
      if (needleRef.current) {
        needleRef.current.setAttribute('transform', `rotate(${((clamped / 100) * 360).toFixed(2)})`);
      }
    });
    springRef.current = spring;
    return () => {
      spring.stop();
      springRef.current = null;
    };
  }, [initialScoreVal]);

  useEffect(() => {
    hasScoreRef.current = targetScore !== null;
    const spring = springRef.current;
    if (!spring) return;
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || targetScore === null) {
      spring.snap(targetScore ?? 0);
      if (targetScore === null && scoreTextRef.current) {
        scoreTextRef.current.textContent = '—';
      }
      return;
    }
    spring.to(targetScore);
  }, [targetScore]);

  const litTicks = targetScore !== null ? Math.round((targetScore / 100) * 60) : 0;
  const centerSubLabel = hoveredSeg
    ? `${(labelMap.get(hoveredSeg.key) ?? hoveredSeg.key).slice(0, 18).toUpperCase()} · ${
        hoveredSeg.status === 'off' ? 'REST' : hoveredSeg.satisfied ? 'MET' : 'MISSED'
      }`
    : selectedSealed
      ? `STREAK ${String(selectedSealed.streak).padStart(2, '0')}D`
      : 'VOID NIGHT';

  return (
    <div className="flex flex-col justify-between gap-6 rounded-md border border-line bg-bg/84 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
        <span>precision dial // selected night</span>
        <div className="flex items-center gap-1.5">
          {latestDay && selectedDay !== latestDay ? (
            <button type="button" onClick={() => onSelectDay(latestDay)} className={`${NAV_BTN} px-2 text-[10px]`}>
              latest
            </button>
          ) : null}
          <button
            type="button"
            disabled={!prevDay}
            onClick={() => prevDay && onSelectDay(prevDay)}
            aria-label="Previous night"
            className={`${NAV_BTN} w-7`}
          >
            ←
          </button>
          <button
            type="button"
            disabled={!nextDay}
            onClick={() => nextDay && onSelectDay(nextDay)}
            aria-label="Next night"
            className={`${NAV_BTN} w-7`}
          >
            →
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-1">
        <svg viewBox="-136 -136 272 272" className="size-[min(68vw,270px)] select-none">
          {DIAL_TICKS.map((t, i) => {
            const lit = i < litTicks;
            const stroke = lit
              ? t.major ? 'rgba(245,243,247,0.88)' : 'rgba(245,243,247,0.42)'
              : t.major ? 'rgba(245,243,247,0.30)' : 'rgba(245,243,247,0.11)';
            return (
              <line
                key={i}
                x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                stroke={stroke}
                strokeWidth={t.major ? 1.25 : 0.85}
                className="transition-[stroke] duration-[var(--duration-ui)] ease-[var(--ease-out)]"
              />
            );
          })}

          <circle cx={0} cy={0} r={INNER_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <circle
            ref={innerArcRef}
            cx={0} cy={0} r={INNER_R} fill="none"
            stroke={targetScore === 100 ? 'var(--accent)' : 'rgba(245,243,247,0.55)'}
            strokeWidth={1.25}
            strokeDasharray={INNER_CIRC.toFixed(2)}
            strokeDashoffset={(INNER_CIRC * (1 - initialScoreVal / 100)).toFixed(2)}
            transform="rotate(-90)"
            className="transition-[stroke] duration-[var(--duration-ui)] ease-[var(--ease-out)]"
          />

          <g ref={needleRef} transform={`rotate(${((initialScoreVal / 100) * 360).toFixed(2)})`}>
            <line
              x1={0} y1={-125} x2={0} y2={-105}
              stroke={targetScore === 100 ? 'var(--accent)' : 'var(--text)'}
              strokeOpacity={targetScore === null ? 0.2 : 0.95}
              strokeWidth={1.5}
              className="transition-[stroke,stroke-opacity] duration-[var(--duration-ui)] ease-[var(--ease-out)]"
            />
          </g>

          {segCount === 0 ? (
            <circle
              cx={0} cy={0} r={RING_R} fill="none"
              stroke="var(--text-faint)" strokeOpacity={0.28} strokeWidth={1.25} strokeDasharray="3 5"
            />
          ) : (
            segments.map((seg, i) => {
              const slotLen = RING_CIRC / segCount;
              const arcLen = Math.max(2, slotLen - (segCount > 1 ? 6 : 0));
              const isHov = hoveredSegKey === seg.key;
              const dimmed = hoveredSegKey !== null && !isHov;
              const stroke =
                seg.status === 'off'
                  ? 'var(--text-faint)'
                  : seg.satisfied
                    ? selectedSealed?.score === 100 || isHov ? 'var(--accent)' : '#F5F3F7'
                    : 'rgba(255,255,255,0.14)';
              const baseOpacity = seg.status === 'off' ? 0.35 : seg.satisfied ? 0.92 : 0.65;
              return (
                <circle
                  key={`${seg.key}-${seg.version}`}
                  cx={0} cy={0} r={RING_R} fill="none"
                  stroke={stroke}
                  strokeOpacity={dimmed ? 0.26 : isHov ? 1 : baseOpacity}
                  strokeWidth={isHov ? 6.5 : 4.5}
                  strokeDasharray={`${arcLen.toFixed(2)} ${(RING_CIRC - arcLen).toFixed(2)}`}
                  strokeDashoffset={(-(i * slotLen)).toFixed(2)}
                  transform="rotate(-90)"
                  onPointerEnter={() => setHoveredSegKey(seg.key)}
                  onPointerLeave={() => setHoveredSegKey(null)}
                  className="cursor-pointer transition-[stroke-width,stroke-opacity,stroke,stroke-dashoffset,stroke-dasharray] duration-[var(--duration-ui)] ease-[var(--ease-out)]"
                >
                  <title>{`${labelMap.get(seg.key) ?? seg.key}: ${seg.status === 'off' ? 'rest' : seg.satisfied ? 'met' : 'missed'}`}</title>
                </circle>
              );
            })
          )}

          <text
            ref={scoreTextRef}
            x={0} y={-4} textAnchor="middle" fill="var(--text)"
            fontFamily="var(--font-data), monospace" fontSize={36} fontWeight={300} letterSpacing="-0.04em"
          >
            {initialHasScore ? String(initialScoreVal) : '—'}
          </text>
          <text
            x={0} y={18} textAnchor="middle" fill="var(--text-dim)"
            fontFamily="var(--font-data), monospace" fontSize={9.5} letterSpacing="0.18em"
          >
            {selectedDay.replaceAll('-', '.')}
          </text>
          <text
            x={0} y={33} textAnchor="middle"
            fill={hoveredSeg || (selectedSealed && selectedSealed.streak > 0) ? 'var(--accent)' : 'var(--text-faint)'}
            fontFamily="var(--font-data), monospace" fontSize={8} letterSpacing="0.14em"
          >
            {centerSubLabel}
          </text>
        </svg>
      </div>

      <TimeRuler ruler={ruler} selectedDay={selectedDay} onSelectDay={onSelectDay} />
    </div>
  );
});
