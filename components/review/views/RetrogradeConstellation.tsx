'use client';

import { memo, useMemo, useState } from 'react';
import type { ApiSealedDay } from '@/lib/api/types';
import type { DayKey } from '@/lib/domain/types';
import { buildTimelineWindow, type TimelineDay } from '@/lib/viz/retrogradeData';

type RetrogradeConstellationProps = {
  days: ReadonlyArray<ApiSealedDay>;
  selectedDay: DayKey;
  endDay: DayKey;
  onSelectDay: (day: DayKey) => void;
};

export const RetrogradeConstellation = memo(function RetrogradeConstellation({
  days,
  selectedDay,
  endDay,
  onSelectDay,
}: RetrogradeConstellationProps) {
  const [hovered, setHovered] = useState<TimelineDay | null>(null);

  const nodes = useMemo(() => {
    const win = buildTimelineWindow(days, endDay, 60);
    return win.map((d, i) => {
      const t = i / 59;
      const theta = -Math.PI * 0.88 + t * Math.PI * 2.15;
      const r = 42 + t * 108;
      return {
        ...d,
        x: Number((320 + Math.cos(theta) * r * 1.62).toFixed(1)),
        y: Number((170 + Math.sin(theta) * r * 0.88).toFixed(1)),
      };
    });
  }, [days, endDay]);

  const links = useMemo(() => {
    const segs: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = [];
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1];
      const b = nodes[i];
      if (!a.isVoid && !b.isVoid) {
        segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, key: b.day });
      }
    }
    return segs;
  }, [nodes]);

  const activeNode = nodes.find((n) => n.day === selectedDay) ?? nodes[nodes.length - 1];
  const displayNode = hovered ?? activeNode;

  return (
    <div className="flex flex-col justify-between gap-4 rounded-md border border-line bg-bg/84 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint tabular-nums">
        <span>constellation arc // 60 nights</span>
        <span>
          {displayNode
            ? `${displayNode.day.replaceAll('-', '.')} // ${displayNode.score === null ? 'VOID' : `SCORE ${displayNode.score}`}`
            : ''}
        </span>
      </div>

      <svg
        viewBox="0 0 640 340"
        className="w-full select-none"
        role="img"
        aria-label="60 night constellation arc"
      >
        <circle cx={320} cy={170} r={8} fill="none" stroke="rgba(245,243,247,0.18)" strokeWidth={0.75} />

        {links.map((l) => (
          <line
            key={l.key}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="rgba(245, 243, 247, 0.22)"
            strokeWidth={0.85}
          />
        ))}

        {nodes.map((n) => {
          const isSelected = n.day === selectedDay;
          const score = n.score ?? 0;
          const starR = n.isVoid ? 2.0 : 1.7 + (score / 100) * 2.5;
          const starFill = isSelected
            ? 'var(--accent)'
            : score >= 90
              ? '#F5D89C'
              : '#F5F3F7';

          return (
            <g
              key={n.day}
              className="cursor-pointer"
              onClick={() => onSelectDay(n.day)}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle cx={n.x} cy={n.y} r={11} fill="transparent" />
              {n.isVoid ? (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={starR}
                  fill="none"
                  stroke={isSelected ? 'var(--accent)' : 'var(--text-faint)'}
                  strokeOpacity={isSelected ? 0.9 : 0.45}
                  strokeWidth={0.9}
                />
              ) : (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={starR}
                  fill={starFill}
                  opacity={isSelected ? 1 : 0.35 + (score / 100) * 0.65}
                />
              )}
              {isSelected ? (
                <g stroke="var(--accent)" strokeWidth={0.9} opacity={0.9}>
                  <line x1={n.x - 10} y1={n.y} x2={n.x - 5} y2={n.y} />
                  <line x1={n.x + 5} y1={n.y} x2={n.x + 10} y2={n.y} />
                  <line x1={n.x} y1={n.y - 10} x2={n.x} y2={n.y - 5} />
                  <line x1={n.x} y1={n.y + 5} x2={n.x} y2={n.y + 10} />
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-between border-t border-line pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
        <span>inner origin: -60d · outer: today</span>
        <span>hollow = void · gold ≥ 90</span>
      </div>
    </div>
  );
});
