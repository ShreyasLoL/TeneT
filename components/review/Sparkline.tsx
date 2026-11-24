export function Sparkline({
  values,
  width = 168,
  height = 36,
}: {
  values: ReadonlyArray<number | null>;
  width?: number;
  height?: number;
}) {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center font-mono text-[10px] text-text-faint"
      >
        no data
      </div>
    );
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;

  const points: string[] = [];
  const n = Math.max(1, values.length - 1);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) continue;
    const x = (i / n) * (width - 4) + 2;
    const y = height - 4 - ((v - min) / span) * (height - 8);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.35}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(' ')}
      />
    </svg>
  );
}
