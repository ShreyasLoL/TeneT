import type { ApiArea, ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { addDays, isoWeekday, weekStart } from '@/lib/domain/day';
import type { DayKey } from '@/lib/domain/types';

export type TimelineDay = {
  day: DayKey;
  sealed: ApiSealedDay | null;
  score: number | null;
  streak: number;
  isVoid: boolean;
  weekday: number; // 0 = Mon .. 6 = Sun
  future: boolean;
};

export type AreaMomentum = {
  area: ApiArea;
  rate: number | null;
  delta: number | null;
  series: Array<number | null>;
};

export function buildTimelineWindow(
  days: ReadonlyArray<ApiSealedDay>,
  endDay: DayKey,
  count = 84,
): TimelineDay[] {
  const byDay = new Map<DayKey, ApiSealedDay>(days.map((d) => [d.day, d]));
  const out: TimelineDay[] = [];
  for (let i = 0; i < count; i++) {
    const day = addDays(endDay, -(count - 1 - i));
    const sealed = byDay.get(day) ?? null;
    out.push({
      day,
      sealed,
      score: sealed?.score ?? null,
      streak: sealed?.streak ?? 0,
      isVoid: sealed === null,
      weekday: isoWeekday(day) - 1,
      future: false,
    });
  }
  return out;
}

export function buildCalendarMatrix(
  days: ReadonlyArray<ApiSealedDay>,
  endDay: DayKey,
  weeks = 12,
): TimelineDay[] {
  const byDay = new Map<DayKey, ApiSealedDay>(days.map((d) => [d.day, d]));
  const gridStart = addDays(weekStart(endDay), -(weeks - 1) * 7);
  const total = weeks * 7;
  const out: TimelineDay[] = [];

  for (let i = 0; i < total; i++) {
    const day = addDays(gridStart, i);
    const future = day > endDay;
    const sealed = future ? null : (byDay.get(day) ?? null);
    out.push({
      day,
      sealed,
      score: sealed?.score ?? null,
      streak: sealed?.streak ?? 0,
      isVoid: !future && sealed === null,
      weekday: isoWeekday(day) - 1,
      future,
    });
  }
  return out;
}

function windowAreaRate(
  days: ReadonlyArray<ApiSealedDay>,
  trackableArea: ReadonlyMap<string, string>,
  areaId: string,
  fromDay: DayKey,
  toDay: DayKey,
): number | null {
  let met = 0;
  let total = 0;
  for (const d of days) {
    if (d.day < fromDay || d.day > toDay) continue;
    for (const r of d.results) {
      if (!r.scored || r.status === 'off') continue;
      if (trackableArea.get(r.key) !== areaId) continue;
      total += 1;
      if (r.satisfied) met += 1;
    }
  }
  return total > 0 ? met / total : null;
}

export function computeAreaMomentum(
  days: ReadonlyArray<ApiSealedDay>,
  areas: ReadonlyArray<ApiArea>,
  trackables: ReadonlyArray<ApiTrackable>,
  endDay: DayKey,
): AreaMomentum[] {
  const trackableArea = new Map<string, string>();
  for (const t of trackables) {
    trackableArea.set(t.key, t.areaId);
  }
  const byDay = new Map<DayKey, ApiSealedDay>(days.map((d) => [d.day, d]));
  const sortedAreas = [...areas].sort((a, b) => a.position - b.position);

  const from30 = addDays(endDay, -29);
  const cur14Start = addDays(endDay, -13);
  const prev14Start = addDays(endDay, -27);
  const prev14End = addDays(endDay, -14);

  return sortedAreas.map((area) => {
    const rate = windowAreaRate(days, trackableArea, area.id, from30, endDay);
    const cur14 = windowAreaRate(days, trackableArea, area.id, cur14Start, endDay);
    const prev14 = windowAreaRate(days, trackableArea, area.id, prev14Start, prev14End);
    const delta = cur14 !== null && prev14 !== null ? cur14 - prev14 : null;

    const series: Array<number | null> = [];
    for (let i = 0; i < 14; i++) {
      const day = addDays(cur14Start, i);
      const sealed = byDay.get(day);
      if (!sealed) {
        series.push(null);
        continue;
      }
      let dayMet = 0;
      let dayTotal = 0;
      for (const r of sealed.results) {
        if (!r.scored || r.status === 'off') continue;
        if (trackableArea.get(r.key) !== area.id) continue;
        dayTotal += 1;
        if (r.satisfied) dayMet += 1;
      }
      series.push(dayTotal > 0 ? Math.round((dayMet / dayTotal) * 100) : null);
    }

    return { area, rate, delta, series };
  });
}
