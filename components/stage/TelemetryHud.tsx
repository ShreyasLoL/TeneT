'use client';

import { useMemo } from 'react';
import { COPY } from '@/lib/copy';
import type { DayKey } from '@/lib/domain/types';

function shiftDayIso(day: DayKey, deltaDays: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return utc.toISOString().slice(0, 10);
}

function computeSealedStreak(sealedDays: ReadonlyArray<{ day: DayKey }> | undefined, today: DayKey): number {
  if (!sealedDays || sealedDays.length === 0) return 0;
  const set = new Set<string>(sealedDays.map((d) => d.day));
  let cursor: string = set.has(today) ? today : shiftDayIso(today, -1);
  let count = 0;
  while (set.has(cursor)) {
    count += 1;
    cursor = shiftDayIso(cursor as DayKey, -1);
  }
  return count;
}

export function TelemetryHud({
  today,
  sealedDays,
  tonightSealed,
  visible,
}: {
  today: DayKey;
  sealedDays: ReadonlyArray<{ day: DayKey }> | undefined;
  tonightSealed: boolean;
  visible: boolean;
}) {
  const streak = useMemo(() => computeSealedStreak(sealedDays, today), [sealedDays, today]);
  const formattedDate = useMemo(() => today.replaceAll('-', '.'), [today]);

  return (
    <div
      aria-label="Observatory telemetry"
      className={`pointer-events-none flex w-full max-w-6xl items-center justify-between gap-4 border-b border-line/40 pb-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint tabular-nums transition-[opacity,transform] duration-[var(--duration-scene)] ease-[var(--ease-out)] ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-block size-1.5 rounded-full ${
            tonightSealed ? 'bg-text-dim' : 'bg-accent'
          }`}
        />
        <span className="text-text-dim">{COPY.doors.telemetryNode}</span>
      </div>

      <span suppressHydrationWarning className="hidden sm:inline">{`${formattedDate} // ist`}</span>

      <span>{`streak // ${String(streak).padStart(2, '0')}d`}</span>

      <span className={tonightSealed ? 'text-text-dim' : 'text-accent'}>
        {tonightSealed ? COPY.doors.telemetrySealed : COPY.doors.telemetryOpen}
      </span>
    </div>
  );
}
