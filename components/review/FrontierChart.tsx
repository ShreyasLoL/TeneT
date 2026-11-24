'use client';

import type { FrontierPoint } from '@/lib/domain/optimizer';

type FrontierChartProps = {
  points: ReadonlyArray<FrontierPoint>;
  labelByKey: ReadonlyMap<string, string>;
  selectedEffort: number | null;
  onSelectPoint: (point: FrontierPoint) => void;
};

const W = 360;
const H = 148;
const PAD_L = 32;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 26;

export function FrontierChart({
  points,
  labelByKey,
  selectedEffort,
  onSelectPoint,
}: FrontierChartProps) {
  if (points.length === 0) {
    return (
      <p className="py-4 font-mono text-xs text-text-faint">
        no scorable candidates remain tonight.
      </p>
    );
  }

  const maxEffort = Math.max(1, ...points.map((p) => p.effort));
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xFor = (effort: number) => PAD_L + (effort / maxEffort) * innerW;
  const yFor = (score: number) => PAD_T + (1 - Math.min(100, Math.max(0, score)) / 100) * innerH;

  // Step staircase path
  let lineD = '';
  let fillD = '';
  points.forEach((pt, idx) => {
    const x = xFor(pt.effort);
    const y = yFor(pt.score);
    if (idx === 0) {
      lineD = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      fillD = `M ${x.toFixed(1)} ${(PAD_T + innerH).toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    } else {
      const prevY = yFor(points[idx - 1].score);
      lineD += ` L ${x.toFixed(1)} ${prevY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
      fillD += ` L ${x.toFixed(1)} ${prevY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
  });
  const lastX = xFor(points[points.length - 1].effort);
  fillD += ` L ${lastX.toFixed(1)} ${(PAD_T + innerH).toFixed(1)} Z`;

  const selected =
    points.find((p) => p.effort === selectedEffort) ?? points[points.length - 1];

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="effort versus night score pareto frontier"
        className="w-full overflow-visible"
      >
        {/* Threshold hairlines at 70 and 90 */}
        {[70, 90].map((target) => {
          const y = yFor(target);
          return (
            <g key={target}>
              <line
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
                stroke="var(--line)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={PAD_L - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--text-faint)"
                fontSize="9"
                fontFamily="var(--font-data)"
              >
                {target}
              </text>
            </g>
          );
        })}

        {/* Baseline x-axis */}
        <line
          x1={PAD_L}
          y1={PAD_T + innerH}
          x2={W - PAD_R}
          y2={PAD_T + innerH}
          stroke="var(--line)"
          strokeWidth="1"
        />

        <path d={fillD} fill="var(--accent-abyss)" fillOpacity={0.28} />
        <path
          d={lineD}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {points.map((pt) => {
          const cx = xFor(pt.effort);
          const cy = yFor(pt.score);
          const active = selected.effort === pt.effort;
          return (
            <g key={`${pt.effort}-${pt.score}`}>
              <circle
                cx={cx}
                cy={cy}
                r={active ? 4.5 : 3}
                fill={active ? 'var(--accent)' : 'var(--bg)'}
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
              <circle
                cx={cx}
                cy={cy}
                r={12}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-label={`effort ${pt.effort}, score ${pt.score}`}
                className="cursor-pointer outline-none focus-visible:stroke-accent"
                onClick={() => onSelectPoint(pt)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPoint(pt);
                  }
                }}
              >
                <title>{`effort ${pt.effort}, score ${pt.score}`}</title>
              </circle>
            </g>
          );
        })}

        <text
          x={PAD_L}
          y={H - 6}
          fill="var(--text-faint)"
          fontSize="9"
          fontFamily="var(--font-data)"
        >
          effort 0
        </text>
        <text
          x={W - PAD_R}
          y={H - 6}
          textAnchor="end"
          fill="var(--text-faint)"
          fontSize="9"
          fontFamily="var(--font-data)"
        >
          {`effort ${maxEffort}`}
        </text>
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 font-mono text-[11px] text-text-dim tabular-nums">
        <span>
          effort {selected.effort} {'\u2192'} score {selected.score}
        </span>
        <span className="text-text-faint">
          {selected.keys.length === 0
            ? 'current entries'
            : selected.keys.map((k) => labelByKey.get(k) ?? k).join(' + ')}
        </span>
      </div>
    </div>
  );
}
