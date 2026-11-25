/** Exact analytical solver for CSS `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` (zero bounce). */
export function expoBezierEase(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const x1 = 0.16;
  const y1 = 1.0;
  const x2 = 0.3;
  const y2 = 1.0;

  let t = x;
  for (let i = 0; i < 6; i++) {
    const inv = 1 - t;
    const bx = 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t - x;
    const dbx = 3 * inv * inv * x1 + 6 * inv * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(dbx) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - bx / dbx));
  }
  const inv = 1 - t;
  return 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
}
