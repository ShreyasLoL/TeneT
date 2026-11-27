'use client';

import type { MutableRefObject, RefObject } from 'react';

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
  const rInner = major ? 116 : 124;
  const rOuter = 134;
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

const STENCIL_STARS: ReadonlyArray<{
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity: number;
}> = [
  { cx: 21, cy: 8, r: 0.9, fill: '#FFFFFF', opacity: 0.96 },
  { cx: 26, cy: 15, r: 0.65, fill: '#DCEEFF', opacity: 0.9 },
  { cx: 32, cy: 10, r: 1.08, fill: '#FFFFFF', opacity: 1.0 },
  { cx: 38, cy: 16, r: 0.58, fill: '#FFF0CE', opacity: 0.86 },
  { cx: 44, cy: 7, r: 0.8, fill: '#DCEEFF', opacity: 0.92 },
  { cx: 50, cy: 13, r: 0.95, fill: '#FFFFFF', opacity: 0.98 },
  { cx: 56, cy: 9, r: 0.6, fill: '#FFFFFF', opacity: 0.88 },
  { cx: 63, cy: 16, r: 1.02, fill: '#FFF0CE', opacity: 0.94 },
  { cx: 69, cy: 8, r: 0.68, fill: '#DCEEFF', opacity: 0.9 },
  { cx: 76, cy: 12, r: 0.88, fill: '#FFFFFF', opacity: 0.95 },
  { cx: 82, cy: 17, r: 0.56, fill: '#FFFFFF', opacity: 0.85 },
  { cx: 89, cy: 7, r: 0.82, fill: '#DCEEFF', opacity: 0.92 },
  { cx: 95, cy: 14, r: 1.1, fill: '#FFFFFF', opacity: 1.0 },
  { cx: 101, cy: 9, r: 0.62, fill: '#FFF0CE', opacity: 0.88 },
  { cx: 108, cy: 16, r: 0.85, fill: '#FFFFFF', opacity: 0.94 },
  { cx: 114, cy: 11, r: 1.15, fill: '#FFFFFF', opacity: 1.0 },
  { cx: 120, cy: 7, r: 0.68, fill: '#DCEEFF', opacity: 0.9 },
  { cx: 126, cy: 15, r: 0.9, fill: '#FFF0CE', opacity: 0.92 },
  { cx: 133, cy: 9, r: 0.72, fill: '#FFFFFF', opacity: 0.94 },
  { cx: 139, cy: 17, r: 1.0, fill: '#FFFFFF', opacity: 0.98 },
  { cx: 145, cy: 8, r: 0.58, fill: '#DCEEFF', opacity: 0.86 },
  { cx: 151, cy: 13, r: 1.08, fill: '#FFFFFF', opacity: 1.0 },
  { cx: 158, cy: 7, r: 0.65, fill: '#FFF0CE', opacity: 0.88 },
  { cx: 164, cy: 16, r: 0.82, fill: '#DCEEFF', opacity: 0.92 },
  { cx: 171, cy: 10, r: 0.95, fill: '#FFFFFF', opacity: 0.96 },
  { cx: 177, cy: 14, r: 0.58, fill: '#FFFFFF', opacity: 0.86 },
  { cx: 184, cy: 8, r: 0.88, fill: '#DCEEFF', opacity: 0.94 },
  { cx: 190, cy: 16, r: 1.05, fill: '#FFFFFF', opacity: 0.98 },
  { cx: 196, cy: 9, r: 0.62, fill: '#FFF0CE', opacity: 0.9 },
  { cx: 202, cy: 14, r: 0.9, fill: '#FFFFFF', opacity: 0.95 },
  { cx: 208, cy: 7, r: 0.7, fill: '#DCEEFF', opacity: 0.92 },
  { cx: 213, cy: 15, r: 1.0, fill: '#FFFFFF', opacity: 0.98 },
  { cx: 218, cy: 10, r: 0.58, fill: '#FFF0CE', opacity: 0.85 },
  { cx: 222, cy: 13, r: 0.8, fill: '#DCEEFF', opacity: 0.92 },
];

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
  clockReadoutRef,
  nightBeginsRef,
}: {
  hairlineRef: RefObject<HTMLDivElement | null>;
  dialGroupRef: RefObject<SVGGElement | null>;
  tickRefs: MutableRefObject<Array<SVGLineElement | null>>;
  clockReadoutRef: RefObject<HTMLSpanElement | null>;
  nightBeginsRef: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <>
      {/* 0.0-0.8s: single 1px hairline sweeping across the void, parted around TENET */}
      <div
        ref={hairlineRef}
        className="pointer-events-none absolute h-px w-[min(78vw,560px)] origin-center bg-text-dim/45 opacity-0"
        style={{
          maskImage:
            'linear-gradient(90deg, transparent 0%, black 12%, black 29%, transparent 36%, transparent 64%, black 71%, black 88%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent 0%, black 12%, black 29%, transparent 36%, transparent 64%, black 71%, black 88%, transparent 100%)',
        }}
      />

      {/* 60 radial clock ticks around TENET */}
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
              stroke={t.major ? 'rgba(245, 243, 247, 0.86)' : 'rgba(245, 243, 247, 0.34)'}
              strokeWidth={t.major ? 1.35 : 1}
              opacity={0}
            />
          ))}
        </g>
      </svg>

      {/* Act I inside symmetrical dial: IST HH:MM:SS count-up + cosmic-stencil NIGHT BEGINS */}
      <div className="pointer-events-none absolute flex translate-y-[2.85rem] flex-col items-center gap-1.5 text-center sm:translate-y-[3.4rem]">
        <span
          ref={clockReadoutRef}
          className="pl-[0.24em] font-mono text-[11px] tracking-[0.24em] text-text/90 opacity-0 tabular-nums sm:text-xs"
        >
          00:00:00 IST
        </span>
        <span
          ref={nightBeginsRef}
          className="inline-flex items-center justify-center opacity-0"
        >
          <svg
            viewBox="0 0 240 24"
            className="h-[23px] w-[228px] sm:h-[26px] sm:w-[252px]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="tenet-cosmos-void" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1F273B" />
                <stop offset="45%" stopColor="#0B0E17" />
                <stop offset="100%" stopColor="#06070C" />
              </linearGradient>
              <radialGradient id="tenet-cosmos-starlight-cool" cx="30%" cy="44%" r="34%">
                <stop offset="0%" stopColor="#9CC8FF" stopOpacity={0.4} />
                <stop offset="55%" stopColor="#4D73A8" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#4D73A8" stopOpacity={0} />
              </radialGradient>
              <radialGradient id="tenet-cosmos-starlight-warm" cx="72%" cy="50%" r="30%">
                <stop offset="0%" stopColor="#F5D89C" stopOpacity={0.34} />
                <stop offset="55%" stopColor="#9C7F4D" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#9C7F4D" stopOpacity={0} />
              </radialGradient>
              <mask id="tenet-night-stencil">
                <rect width={240} height={24} fill="#000000" />
                <text
                  x={122}
                  y={17}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontFamily="var(--font-ui), ui-sans-serif, system-ui, sans-serif"
                  fontSize={13.5}
                  fontWeight={800}
                  letterSpacing="0.30em"
                >
                  NIGHT BEGINS
                </text>
              </mask>
            </defs>
            <g mask="url(#tenet-night-stencil)">
              <rect width={240} height={24} fill="url(#tenet-cosmos-void)" />
              <rect width={240} height={24} fill="url(#tenet-cosmos-starlight-cool)" />
              <rect width={240} height={24} fill="url(#tenet-cosmos-starlight-warm)" />
              {STENCIL_STARS.map((st, idx) => (
                <circle
                  key={idx}
                  cx={st.cx}
                  cy={st.cy}
                  r={st.r}
                  fill={st.fill}
                  opacity={st.opacity}
                />
              ))}
            </g>
            <text
              x={122}
              y={17}
              textAnchor="middle"
              fill="none"
              stroke="rgba(232, 240, 255, 0.80)"
              strokeWidth={0.75}
              fontFamily="var(--font-ui), ui-sans-serif, system-ui, sans-serif"
              fontSize={13.5}
              fontWeight={800}
              letterSpacing="0.30em"
            >
              NIGHT BEGINS
            </text>
          </svg>
        </span>
      </div>
    </>
  );
}
