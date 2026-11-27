'use client';

import { memo, useRef, useState } from 'react';
import type { DayKey } from '@/lib/domain/types';
import type { TimelineDay } from '@/lib/viz/retrogradeData';

type TimeRulerProps = {
  ruler: ReadonlyArray<TimelineDay>;
  selectedDay: DayKey;
  onSelectDay: (day: DayKey) => void;
};

export const TimeRuler = memo(function TimeRuler({
  ruler,
  selectedDay,
  onSelectDay,
}: TimeRulerProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState<TimelineDay | null>(null);

  const count = ruler.length;
  const selIdx = Math.max(
    0,
    ruler.findIndex((d) => d.day === selectedDay),
  );
  const selectedNode = ruler[selIdx];

  const pickDayAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el || count === 0) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const idx = Math.min(count - 1, Math.max(0, Math.floor(ratio * count)));
    const node = ruler[idx];
    if (!node) return;
    setHovered(node);
    if (node.day !== selectedDay) {
      onSelectDay(node.day);
    }
  };

  return (
    <div className="space-y-2 border-t border-line pt-4">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint tabular-nums">
        <span>
          {count}d time ruler <span className="text-text-faint/60">· drag</span>
        </span>
        <span>
          {hovered
            ? `${hovered.day} · ${hovered.score === null ? 'void' : hovered.score}`
            : count > 0
              ? `${ruler[0].day.slice(5)} → ${ruler[count - 1].day.slice(5)}`
              : '—'}
        </span>
      </div>

      <div
        ref={trackRef}
        tabIndex={0}
        role="slider"
        aria-label={`${count} day score ruler`}
        aria-valuemin={1}
        aria-valuemax={Math.max(1, count)}
        aria-valuenow={selIdx + 1}
        aria-valuetext={
          selectedNode
            ? `${selectedNode.day}: ${selectedNode.score === null ? 'void' : `score ${selectedNode.score}`}`
            : undefined
        }
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          setIsDragging(true);
          pickDayAt(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) {
            pickDayAt(e.clientX);
          }
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          draggingRef.current = false;
          setIsDragging(false);
          setHovered(null);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          setIsDragging(false);
          setHovered(null);
        }}
        onKeyDown={(e) => {
          if (count === 0) return;
          let targetIdx: number | null = null;
          if (e.key === 'ArrowLeft') targetIdx = Math.max(0, selIdx - 1);
          else if (e.key === 'ArrowRight') targetIdx = Math.min(count - 1, selIdx + 1);
          else if (e.key === 'Home') targetIdx = 0;
          else if (e.key === 'End') targetIdx = count - 1;
          if (targetIdx !== null) {
            e.preventDefault();
            onSelectDay(ruler[targetIdx].day);
          }
        }}
        className={`relative flex h-14 touch-none select-none items-end gap-[2px] outline-none focus-visible:ring-1 focus-visible:ring-accent/60 ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {ruler.map((node) => {
          const active = node.day === selectedDay;
          const isHov = hovered?.day === node.day && !active;
          const pct = node.isVoid ? 6 : Math.max(12, node.score ?? 12);
          const barColor = active
            ? 'bg-accent'
            : isHov
              ? 'bg-text'
              : node.isVoid
                ? 'bg-line'
                : (node.score ?? 0) >= 80
                  ? 'bg-text/75'
                  : 'bg-text-dim/45';
          return (
            <div
              key={node.day}
              onPointerEnter={() => {
                if (!draggingRef.current) setHovered(node);
              }}
              onPointerLeave={() => {
                if (!draggingRef.current) setHovered(null);
              }}
              className="flex h-full flex-1 items-end"
            >
              <span
                className={`block h-full w-full origin-bottom transition-[transform,background-color,opacity] duration-[var(--duration-micro)] ease-[var(--ease-out)] ${barColor}`}
                style={{ transform: `scaleY(${(pct / 100).toFixed(3)})` }}
              />
            </div>
          );
        })}
      </div>

      <div aria-hidden="true" className="relative h-[2px] w-full overflow-hidden bg-line/70">
        {count > 0 ? (
          <span
            className={`absolute top-0 left-0 h-full bg-accent ${
              isDragging
                ? 'transition-none'
                : 'transition-transform duration-[var(--duration-micro)] ease-[var(--ease-out)]'
            }`}
            style={{
              width: `${(100 / count).toFixed(4)}%`,
              transform: `translateX(${selIdx * 100}%)`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
});
