'use client';

import { useMemo } from 'react';
import type { ApiArea, ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import type { DayKey } from '@/lib/domain/types';
import { resolveAreaLook } from '@/lib/viz/areaLook';
import { INSCRIPTION_NOTCHES, inscription } from '@/lib/viz/inscribe';
import { ringLayout, type RingNode } from '@/lib/viz/ringLayout';

type StaticOrbitProps = {
  days: ReadonlyArray<ApiSealedDay>;
  range: { from: DayKey; to: DayKey };
  areas?: ReadonlyArray<ApiArea>;
  trackables?: ReadonlyArray<ApiTrackable>;
  selectedDay?: DayKey | null;
  liveScore?: number | null;
  onSelectDay?: (day: DayKey) => void;
  className?: string;
};

const SVG_SIZE = 600;
const CENTER = SVG_SIZE / 2;
const INNER_PX = 56;
const OUTER_PX = 278;

function mapRadiusToPx(worldRadius: number): number {
  const norm = Math.min(1, Math.max(0, (worldRadius - 2.15) / (9.2 - 2.15)));
  return INNER_PX + norm * (OUTER_PX - INNER_PX);
}

function notchPolylinePoints(radius: number, notches: Uint8Array): string {
  const pts: string[] = [];
  for (let i = 0; i < INSCRIPTION_NOTCHES; i++) {
    const theta = (i / INSCRIPTION_NOTCHES) * Math.PI * 2 - Math.PI / 2;
    const amp = (notches[i] / 255) * 4.5;
    const r = radius + amp;
    const x = CENTER + Math.cos(theta) * r;
    const y = CENTER + Math.sin(theta) * r;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

export function StaticOrbit({
  days,
  range,
  areas = [],
  selectedDay = null,
  liveScore = null,
  onSelectDay,
  className = '',
}: StaticOrbitProps) {
  const rings = useMemo(
    () =>
      ringLayout(days, range, {
        maxRings: 180,
      }),
    [days, range],
  );

  const cohortArcs = useMemo(() => {
    const list = areas.length > 0 ? areas : [{ slug: 'default', position: 0, look: {} }];
    return list.map((area, index) => {
      const look = resolveAreaLook(area);
      const r = 34 + index * 9;
      return {
        slug: area.slug,
        r,
        rx: r * (1 + look.eccentricity * 0.28),
        ry: r * (1 - look.eccentricity * 0.16),
        rotate: (index * 37) % 180,
        dash: look.archetype === 'mass' ? '14 6' : look.archetype === 'precession' ? '6 5' : '2 6',
      };
    });
  }, [areas]);

  const featuredRing = useMemo<RingNode | null>(() => {
    if (selectedDay) return rings.find((r) => r.day === selectedDay) ?? null;
    return rings.find((r) => !r.isVoid) ?? null;
  }, [rings, selectedDay]);

  const notchPoints = useMemo(() => {
    if (!featuredRing || !featuredRing.reflection) return null;
    const notches = inscription(featuredRing.reflection);
    return notchPolylinePoints(mapRadiusToPx(featuredRing.radius), notches);
  }, [featuredRing]);

  const diskGlow = liveScore === null ? 0.25 : 0.35 + (liveScore / 100) * 0.55;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      aria-label="Orbital history of sealed nights"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full"
        style={{
          width: '28%',
          height: '28%',
          background: `radial-gradient(circle, color-mix(in srgb, var(--accent) ${Math.round(
            diskGlow * 28,
          )}%, transparent) 0%, color-mix(in srgb, var(--accent-abyss) 45%, transparent) 46%, transparent 74%)`,
        }}
      />

      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        className="h-auto w-full max-w-[560px] select-none"
        role="img"
        aria-label={`Orbit containing ${rings.filter((r) => !r.isVoid).length} sealed nights`}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={INNER_PX - 18}
          fill="var(--bg)"
          stroke="var(--accent)"
          strokeOpacity={0.75}
          strokeWidth={1.1}
        />

        {cohortArcs.map((arc) => (
          <ellipse
            key={arc.slug}
            cx={CENTER}
            cy={CENTER}
            rx={arc.rx}
            ry={arc.ry}
            transform={`rotate(${arc.rotate} ${CENTER} ${CENTER})`}
            fill="none"
            stroke="var(--accent-dim)"
            strokeOpacity={0.28}
            strokeWidth={0.9}
            strokeDasharray={arc.dash}
          />
        ))}

        {rings.map((ring) => {
          const r = mapRadiusToPx(ring.radius);
          const isSelected = selectedDay === ring.day;
          const circumference = 2 * Math.PI * r;

          if (ring.isVoid) {
            return (
              <circle
                key={ring.day}
                cx={CENTER}
                cy={CENTER}
                r={r}
                fill="none"
                stroke="var(--text-faint)"
                strokeOpacity={isSelected ? 0.6 : 0.22}
                strokeWidth={0.85}
                strokeDasharray="2 5"
                className={onSelectDay ? 'cursor-pointer' : undefined}
                onClick={() => onSelectDay?.(ring.day)}
              />
            );
          }

          return (
            <g
              key={ring.day}
              className={onSelectDay ? 'cursor-pointer' : undefined}
              onClick={() => onSelectDay?.(ring.day)}
            >
              {ring.inStreak ? (
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={r}
                  fill="none"
                  stroke="var(--accent-abyss)"
                  strokeOpacity={0.35}
                  strokeWidth={ring.thickness * 34}
                />
              ) : null}

              {ring.segments.map((seg, idx) => {
                const spanFraction = (seg.end - seg.start) / (Math.PI * 2);
                const segLength = Math.max(1, spanFraction * circumference - 1.5);
                const gapLength = Math.max(0, circumference - segLength);
                const dashOffset = -(seg.start / (Math.PI * 2)) * circumference;

                let stroke = 'var(--text-faint)';
                let opacity = ring.luminance * 0.35;
                let dashArray = `${segLength.toFixed(2)} ${gapLength.toFixed(2)}`;

                  if (seg.status === 'off') {
                  stroke = 'var(--text-faint)';
                  opacity = ring.luminance * 0.22;
                  dashArray = `1.5 3.5`;
                } else if (seg.satisfied) {
                  // Orchid discipline (<5% pixels): reserve orchid for active streak & featured ring
                  stroke = isSelected
                    ? 'var(--accent)'
                    : ring.inStreak
                      ? 'var(--accent-dim)'
                      : 'var(--text-dim)';
                  opacity = isSelected
                    ? 0.98
                    : ring.inStreak
                      ? Math.min(0.9, 0.35 + ring.luminance * 0.55)
                      : Math.min(0.55, 0.18 + ring.luminance * 0.38);
                } else if (seg.status === 'optional') {
                  stroke = 'var(--text-faint)';
                  opacity = ring.luminance * 0.2;
                } else {
                  stroke = 'var(--surface)';
                  opacity = 0.85;
                }

                return (
                  <circle
                    key={`${ring.day}-${seg.key}-${idx}`}
                    cx={CENTER}
                    cy={CENTER}
                    r={r}
                    fill="none"
                    stroke={stroke}
                    strokeOpacity={opacity}
                    strokeWidth={isSelected ? 2.6 : Math.max(1.1, ring.thickness * 20)}
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    transform={`rotate(-90 ${CENTER} ${CENTER})`}
                  />
                );
              })}
            </g>
          );
        })}

        {notchPoints ? (
          <polygon
            points={notchPoints}
            fill="none"
            stroke="var(--text)"
            strokeOpacity={0.48}
            strokeWidth={0.9}
          />
        ) : null}
      </svg>
    </div>
  );
}
