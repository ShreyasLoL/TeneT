/**
 * Symmetric fisheye warp for TimeTape ticks around cursor delta `d` (in days).
 * `x(d) = sign(d) * k * log1p(|d| / s)`
 */
export function tapeOffset(d: number, k: number = 110, s: number = 3.5): number {
  if (d === 0) return 0;
  const sign = d < 0 ? -1 : 1;
  return sign * k * Math.log1p(Math.abs(d) / s);
}

export function inverseTapeOffset(x: number, k: number = 110, s: number = 3.5): number {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  return sign * s * Math.expm1(Math.abs(x) / k);
}

/**
 * Continuous emergence factor in [0, 1] for ring `ringIndex` when scrubbing at `cursorIndex`.
 * Rings with `ringIndex >= cursorIndex` are emerged (1); older rings behind the cursor
 * smoothly re-absorb into the singularity (`0`).
 */
export function ringEmergence(ringIndex: number, cursorIndex: number, feather: number = 0.85): number {
  const delta = ringIndex - cursorIndex + feather;
  if (delta <= 0) return 0;
  if (delta >= feather) return 1;
  const t = delta / feather;
  return t * t * (3 - 2 * t);
}
