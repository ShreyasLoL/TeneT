'use client';

import { useRef } from 'react';
import type { Rule } from '@/lib/domain/types';

type DurationDialProps = {
  value: number | undefined;
  rule: Rule;
  disabled?: boolean;
  label: string;
  onChange: (next: number) => void;
};

const MAX_DIAL_MINUTES = 360;
const DIAL_SIZE = 104;
const DIAL_CENTER = DIAL_SIZE / 2;
const DIAL_RADIUS = 38;

function polarPoint(angleRad: number, radius: number) {
  return {
    x: DIAL_CENTER + Math.cos(angleRad) * radius,
    y: DIAL_CENTER + Math.sin(angleRad) * radius,
  };
}

function clampMinutes(n: number): number {
  return Math.min(1440, Math.max(0, Math.round(n)));
}

export function DurationDial({
  value,
  rule,
  disabled = false,
  label,
  onChange,
}: DurationDialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const current = typeof value === 'number' && Number.isFinite(value) ? clampMinutes(value) : 0;
  const hasValue = typeof value === 'number';
  const dialFrac = Math.min(1, current / MAX_DIAL_MINUTES);

  const thresholdValue =
    rule.op === 'gte' || rule.op === 'lte'
      ? rule.value
      : rule.op === 'between'
        ? rule.min
        : null;
  const thresholdFrac =
    thresholdValue !== null ? Math.min(1, Math.max(0, thresholdValue / MAX_DIAL_MINUTES)) : null;

  const circumference = 2 * Math.PI * DIAL_RADIUS;
  const arcLength = dialFrac * circumference;
  const thresholdAngle = thresholdFrac !== null ? thresholdFrac * Math.PI * 2 - Math.PI / 2 : null;
  const thresholdPt =
    thresholdAngle !== null ? polarPoint(thresholdAngle, DIAL_RADIUS) : null;
  const thumbAngle = dialFrac * Math.PI * 2 - Math.PI / 2;
  const thumbPt = polarPoint(thumbAngle, DIAL_RADIUS);

  const updateFromPointer = (clientX: number, clientY: number) => {
    if (disabled || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let theta = Math.atan2(clientY - cy, clientX - cx) + Math.PI / 2;
    if (theta < 0) theta += Math.PI * 2;
    const raw = (theta / (Math.PI * 2)) * MAX_DIAL_MINUTES;
    const snapped = Math.round(raw / 5) * 5;
    onChange(clampMinutes(snapped));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(clampMinutes(current + 5));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(clampMinutes(current - 5));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      onChange(clampMinutes(current + 30));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      onChange(clampMinutes(current - 30));
    }
  };

  const quickChips = rule.op === 'lte' ? [0, 30, 60, 90, 120] : [15, 30, 45, 60, 90];

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={MAX_DIAL_MINUTES}
        aria-valuenow={current}
        aria-valuetext={`${current} minutes`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) updateFromPointer(e.clientX, e.clientY);
        }}
        className={`size-24 shrink-0 touch-none select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          disabled ? 'opacity-45' : 'cursor-pointer'
        }`}
      >
        <circle
          cx={DIAL_CENTER}
          cy={DIAL_CENTER}
          r={DIAL_RADIUS}
          fill="none"
          stroke="var(--line)"
          strokeWidth={4}
        />

        <circle
          cx={DIAL_CENTER}
          cy={DIAL_CENTER}
          r={DIAL_RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={hasValue ? 0.9 : 0.3}
          strokeWidth={4}
          strokeDasharray={`${arcLength.toFixed(2)} ${circumference.toFixed(2)}`}
          transform={`rotate(-90 ${DIAL_CENTER} ${DIAL_CENTER})`}
        />

        {thresholdPt ? (
          <circle
            cx={thresholdPt.x}
            cy={thresholdPt.y}
            r={4.2}
            fill="var(--bg)"
            stroke="var(--text)"
            strokeWidth={1.6}
          />
        ) : null}

        <circle cx={thumbPt.x} cy={thumbPt.y} r={3.5} fill="var(--accent)" />

        <text
          x={DIAL_CENTER}
          y={DIAL_CENTER + 4}
          textAnchor="middle"
          className="fill-text font-mono text-sm tabular-nums"
        >
          {hasValue ? `${current}m` : '—'}
        </text>
      </svg>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={1440}
            step={5}
            disabled={disabled}
            aria-label={`${label} minutes`}
            value={hasValue ? current : ''}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') return;
              const num = Number(raw);
              if (Number.isFinite(num)) onChange(clampMinutes(num));
            }}
            className="h-11 w-24 rounded-md border border-line bg-bg px-3 font-mono text-sm text-text tabular-nums outline-none focus:border-accent"
          />
          <span className="font-mono text-xs text-text-faint">min</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {quickChips.map((mins) => (
            <button
              key={mins}
              type="button"
              disabled={disabled}
              onClick={() => onChange(mins)}
              className={`min-h-9 rounded border px-2 font-mono text-[11px] tabular-nums transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] ${
                hasValue && current === mins
                  ? 'border-accent text-accent'
                  : 'border-line text-text-dim hover:border-text-dim hover:text-text'
              }`}
            >
              {mins}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
