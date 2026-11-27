'use client';

import { memo, useMemo } from 'react';
import type { ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import type { DayKey } from '@/lib/domain/types';

type NightPanelProps = {
  day: DayKey;
  sealedDay: ApiSealedDay | null;
  trackables: ReadonlyArray<ApiTrackable>;
  isToday?: boolean;
};

export const NightPanel = memo(function NightPanel({
  day,
  sealedDay,
  trackables,
  isToday = false,
}: NightPanelProps) {
  const labelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trackables) {
      map.set(t.key, t.label);
    }
    return map;
  }, [trackables]);

  if (!sealedDay) {
    return (
      <section
        aria-label={`Night ${day}`}
        className="relative overflow-hidden rounded-md border border-line bg-bg/88 p-5"
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-text/25" />
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-dim tabular-nums">
            {day}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
            {isToday ? 'open' : 'void'}
          </span>
        </div>
        <p className="mt-6 text-sm text-text-dim">
          {isToday ? COPY.ritual.header : COPY.status.voidNight}
        </p>
      </section>
    );
  }

  const highNight = (sealedDay.score ?? 0) >= 85 || sealedDay.streak > 0;

  return (
    <section
      aria-label={`Night ${day}`}
      className="relative overflow-hidden rounded-md border border-line bg-bg/88 p-5"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-px transition-colors duration-[var(--duration-ui)] ease-[var(--ease-out)] ${
          highNight ? 'bg-accent/70' : 'bg-text/35'
        }`}
      />

      <div className="flex items-start justify-between gap-6 border-b border-line pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-text-dim tabular-nums">
            {sealedDay.day}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint tabular-nums">
            streak {sealedDay.streak}
          </p>
        </div>

        <span className="font-mono text-4xl font-light tracking-[-0.04em] text-text tabular-nums">
          {sealedDay.score === null ? '—' : sealedDay.score}
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        {sealedDay.results.map((r) => {
          const stateLabel =
            r.status === 'off'
              ? 'rest'
              : r.satisfied
                ? 'met'
                : r.status === 'optional'
                  ? 'optional'
                  : 'missed';
          return (
            <div
              key={`${r.key}-${r.version}`}
              className="flex items-center justify-between gap-4 border-b border-line/60 pb-2 text-sm last:border-b-0 last:pb-0"
            >
              <span className="min-w-0 truncate text-text">{labelMap.get(r.key) ?? r.key}</span>
              <span
                className={`shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] tabular-nums ${
                  r.satisfied
                    ? 'text-accent'
                    : r.status === 'off' || r.status === 'optional'
                      ? 'text-text-faint'
                      : 'text-text-dim'
                }`}
              >
                {stateLabel}
                {!r.scored ? ' · unranked' : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
          reflection
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-dim">
          {sealedDay.reflection ? sealedDay.reflection : COPY.status.emptyReflection}
        </p>
      </div>
    </section>
  );
});
