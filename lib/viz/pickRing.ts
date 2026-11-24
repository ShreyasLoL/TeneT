import { RING_R_IN, RING_R_OUT, RING_TAU, type RingNode, type RingSegment } from './ringLayout';

export type PickedRing = {
  ring: RingNode;
  segment: RingSegment | null;
};

/**
 * Closed-form inverse of `r(i) = rIn + (rOut - rIn) * (1 - 1 / (1 + i / tau))`.
 * Returns the nearest continuous index `i` for polar radius `r`.
 */
export function inverseRingIndex(
  r: number,
  rIn: number = RING_R_IN,
  rOut: number = RING_R_OUT,
  tau: number = RING_TAU,
): number | null {
  const span = rOut - rIn;
  if (span <= 0) return null;
  const u = (r - rIn) / span;
  if (u < -0.05 || u >= 0.999) return null;
  const clampedU = Math.max(0, u);
  return (tau * clampedU) / (1 - clampedU);
}

export function normalizeAngle(theta: number): number {
  const twoPi = Math.PI * 2;
  const mod = theta % twoPi;
  return mod < 0 ? mod + twoPi : mod;
}

export function pickRingPolar(
  r: number,
  theta: number,
  rings: ReadonlyArray<RingNode>,
  rIn: number = RING_R_IN,
  rOut: number = RING_R_OUT,
  tau: number = RING_TAU,
): PickedRing | null {
  if (rings.length === 0) return null;
  const est = inverseRingIndex(r, rIn, rOut, tau);
  if (est === null) return null;

  const idx = Math.min(rings.length - 1, Math.max(0, Math.round(est)));
  const candidate = rings[idx];
  const hitBand = Math.max(0.14, candidate.thickness * 2.2);

  let best: RingNode | null = null;
  let bestDist = Infinity;
  for (let offset = -1; offset <= 1; offset++) {
    const k = idx + offset;
    if (k < 0 || k >= rings.length) continue;
    const dist = Math.abs(rings[k].radius - r);
    if (dist < bestDist && dist <= hitBand) {
      bestDist = dist;
      best = rings[k];
    }
  }
  if (!best) return null;

  if (best.segments.length === 0) {
    return { ring: best, segment: null };
  }
  const ang = normalizeAngle(theta);
  const seg = best.segments.find((s) => ang >= s.start && ang <= s.end) ?? best.segments[0];
  return { ring: best, segment: seg };
}
