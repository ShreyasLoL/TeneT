import type { ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { addDays, diffDays } from '@/lib/domain/day';
import type { DayKey, DueStatus } from '@/lib/domain/types';

export const RING_R_IN = 2.15;
export const RING_R_OUT = 9.2;
export const RING_TAU = 14;
export const RING_LUM_TAU = 45;
export const RING_LUM_FLOOR = 0.18;

export type RingSegment = {
  key: string;
  version: number;
  start: number;
  end: number;
  status: DueStatus;
  satisfied: boolean;
  weight: number;
  scored: boolean;
};

export type RingNode = {
  day: DayKey;
  i: number;
  radius: number;
  thickness: number;
  score: number | null;
  luminance: number;
  segments: RingSegment[];
  isVoid: boolean;
  inStreak: boolean;
  reflection: string | null;
};

export type RingLayoutOptions = {
  rIn?: number;
  rOut?: number;
  tau?: number;
  lumTau?: number;
  lumFloor?: number;
  maxRings?: number;
};

export function ringRadiusAt(
  i: number,
  rIn: number = RING_R_IN,
  rOut: number = RING_R_OUT,
  tau: number = RING_TAU,
): number {
  const clamped = Math.max(0, i);
  return rIn + (rOut - rIn) * (1 - 1 / (1 + clamped / tau));
}

export function ageLuminance(
  i: number,
  lumTau: number = RING_LUM_TAU,
  floor: number = RING_LUM_FLOOR,
): number {
  return Math.max(floor, Math.exp(-Math.max(0, i) / lumTau));
}

export function labelFor(
  key: string,
  definitions?: { trackables: ReadonlyArray<Pick<ApiTrackable, 'key' | 'label'>> },
): string {
  const found = definitions?.trackables.find((t) => t.key === key);
  return found?.label ?? key;
}

/**
 * Pure ring layout shared by WebGL instancing and StaticOrbit SVG fallback.
 * Ordered newest-first (`i = 0` is `range.to` or latest day in range).
 */
export function ringLayout(
  days: ReadonlyArray<ApiSealedDay>,
  range: { from: DayKey; to: DayKey },
  options?: RingLayoutOptions,
): RingNode[] {
  const rIn = options?.rIn ?? RING_R_IN;
  const rOut = options?.rOut ?? RING_R_OUT;
  const tau = options?.tau ?? RING_TAU;
  const lumTau = options?.lumTau ?? RING_LUM_TAU;
  const lumFloor = options?.lumFloor ?? RING_LUM_FLOOR;
  const maxRings = options?.maxRings ?? 400;

  if (days.length === 0) return [];

  const sealedByDay = new Map<DayKey, ApiSealedDay>();
  let earliest = range.to;
  for (const d of days) {
    if (d.day >= range.from && d.day <= range.to) {
      sealedByDay.set(d.day, d);
      if (d.day < earliest) earliest = d.day;
    }
  }
  if (sealedByDay.size === 0) return [];

  const startDay = earliest > range.from ? earliest : range.from;
  const span = Math.min(maxRings, Math.max(1, diffDays(range.to, startDay) + 1));

  const nodes: RingNode[] = [];
  for (let i = 0; i < span; i++) {
    const day = addDays(range.to, -i);
    const sealed = sealedByDay.get(day);
    const radius = ringRadiusAt(i, rIn, rOut, tau);
    const ageLum = ageLuminance(i, lumTau, lumFloor);

    if (!sealed) {
      nodes.push({
        day,
        i,
        radius,
        thickness: 0.028,
        score: null,
        luminance: ageLum * 0.45,
        segments: [],
        isVoid: true,
        inStreak: false,
        reflection: null,
      });
      continue;
    }

    const totalWeight = sealed.results.reduce((acc, r) => acc + Math.max(0.25, r.weight), 0);
    const segments: RingSegment[] = [];
    let angle = 0;
    const tauAngle = Math.PI * 2;
    for (const r of sealed.results) {
      const spanAngle = totalWeight > 0 ? (Math.max(0.25, r.weight) / totalWeight) * tauAngle : 0;
      segments.push({
        key: r.key,
        version: r.version,
        start: angle,
        end: angle + spanAngle,
        status: r.status,
        satisfied: r.satisfied,
        weight: r.weight,
        scored: r.scored,
      });
      angle += spanAngle;
    }

    const prevSealed = sealedByDay.has(addDays(day, -1));
    const nextSealed = sealedByDay.has(addDays(day, 1));
    const scoreFactor = sealed.score === null ? 0.35 : 0.35 + 0.65 * (sealed.score / 100);

    nodes.push({
      day,
      i,
      radius,
      thickness: 0.04 + 0.065 * scoreFactor,
      score: sealed.score,
      luminance: Math.min(1, ageLum * scoreFactor * (prevSealed || nextSealed ? 1.12 : 1)),
      segments,
      isVoid: false,
      inStreak: prevSealed || nextSealed,
      reflection: sealed.reflection,
    });
  }

  return nodes;
}
