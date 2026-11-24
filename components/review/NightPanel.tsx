'use client';

import type { ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { Mirror } from '@/components/chrome/Mirror';
import { COPY } from '@/lib/copy';
import type { DayKey } from '@/lib/domain/types';
import { labelFor } from '@/lib/viz/ringLayout';

type NightPanelProps = {
  day: DayKey;
  sealedDay: ApiSealedDay | null;
  trackables: ReadonlyArray<ApiTrackable>;
  isToday?: boolean;
};

export function NightPanel({ day, sealedDay, trackables, isToday = false }: NightPanelProps) {
  if (!sealedDay) {
    return (
      <section
        aria-label={`Night ${day}`}
        className="rounded-xl border border-line bg-surface p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
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

  return (
    <section
      aria-label={`Night ${day}`}
      className="rounded-xl border border-line bg-surface p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="flex items-start justify-between gap-6 border-b border-line pb-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-text-dim tabular-nums">
            {sealedDay.day}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint tabular-nums">
            streak {sealedDay.streak}
          </p>
        </div>

        <Mirror>
          <span className="font-mono text-4xl font-light tracking-[-0.04em] text-text tabular-nums">
            {sealedDay.score === null ? '—' : sealedDay.score}
          </span>
        </Mirror>
      </div>

      <div className="mt-5 space-y-2.5">
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
              <span className="text-text">{labelFor(r.key, { trackables })}</span>
              <span
                className={`font-mono text-[11px] uppercase tracking-[0.12em] tabular-nums ${
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

      <div className="mt-5 border-t border-line pt-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
          reflection
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-dim">
          {sealedDay.reflection ? sealedDay.reflection : COPY.status.emptyReflection}
        </p>
      </div>
    </section>
  );
}
