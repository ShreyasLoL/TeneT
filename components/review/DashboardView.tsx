'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { Mirror } from '@/components/chrome/Mirror';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { Scrim } from '@/components/chrome/Scrim';
import { Ledger } from '@/components/review/Ledger';
import { NightPanel } from '@/components/review/NightPanel';
import { Pull } from '@/components/ritual/Pull';
import { StaticOrbit } from '@/components/stage/StaticOrbit';
import { Button } from '@/components/ui/button';
import { useLivePreview, useStreaks, useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { activeTrackables } from '@/lib/domain/schedule';
import { useTenetStore } from '@/lib/store';
import { useSmoothScroll } from '@/lib/viz/useSmoothScroll';

export function DashboardView() {
  useSmoothScroll();
  const today = useToday();
  const { data, isLoading, isError } = useTenetState();
  const streaks = useStreaks();
  const preview = useLivePreview(today);

  const selection = useTenetStore((s) => s.selection);
  const select = useTenetStore((s) => s.select);
  const setDensity = useTenetStore((s) => s.setDensity);
  const quality = useTenetStore((s) => s.quality);

  const [viewMode, setViewMode] = useState<'orbit' | 'ledger'>('orbit');

  useEffect(() => {
    setDensity(0.35);
  }, [setDensity]);

  const selectedDay = useMemo(() => {
    if (selection && (selection.kind === 'ring' || selection.kind === 'segment')) {
      return selection.day;
    }
    return data?.days[data.days.length - 1]?.day ?? today;
  }, [data?.days, selection, today]);

  const selectedSealedDay = useMemo(
    () => data?.days.find((d) => d.day === selectedDay) ?? null,
    [data?.days, selectedDay],
  );

  const sealedToday = useMemo(
    () => data?.days.find((d) => d.day === today) ?? null,
    [data?.days, today],
  );

  const activeTodayApi = useMemo(() => {
    if (!data) return [];
    const active = activeTrackables(data.definitions.trackables, today);
    const byKeyVersion = new Map(
      data.definitions.trackables.map((t) => [`${t.key}@${t.version}`, t] as const),
    );
    return active
      .map((t) => byKeyVersion.get(`${t.key}@${t.version}`))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
  }, [data, today]);

  if (isLoading) return <LoadingFallback />;

  if (isError || !data) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <SatorGlyph caption={COPY.status.networkError} />
      </main>
    );
  }

  const showStaticOrbit =
    quality.lowPower || quality.reducedMotion || quality.level >= 4 || quality.webgl !== 'ok';

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <Scrim className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
        <div className="flex items-end gap-10">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
              streak
            </p>
            <Mirror>
              <span className="font-mono text-5xl font-light tracking-[-0.04em] text-text tabular-nums">
                {streaks.current}
              </span>
            </Mirror>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
              30d seal rate
            </p>
            <p className="font-mono text-2xl font-light text-text tabular-nums">
              {Math.round(streaks.rate30 * 100)}%
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
              longest
            </p>
            <p className="font-mono text-2xl font-light text-text-dim tabular-nums">
              {streaks.longest}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {data.definitions.areas.map((area) => (
            <Link
              key={area.id}
              href={`/area/${area.slug}`}
              className="inline-flex min-h-10 items-center border border-line px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:text-text"
            >
              {area.name}
            </Link>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setViewMode((v) => (v === 'orbit' ? 'ledger' : 'orbit'))}
            className="min-h-10 font-mono text-[11px] uppercase tracking-[0.12em]"
          >
            {viewMode === 'orbit' ? 'view as list' : 'view as orbit'}
          </Button>
        </div>
      </Scrim>

      {data.days.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
          <SatorGlyph caption={COPY.status.noHistory} />
          <Link
            href="/log"
            className="inline-flex min-h-11 items-center border border-accent/60 px-4 font-mono text-xs uppercase tracking-[0.14em] text-accent transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:bg-surface"
          >
            {COPY.doors.enter}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {viewMode === 'ledger' ? (
              <Ledger
                days={data.days}
                trackables={data.definitions.trackables}
                selectedDay={selectedDay}
                onSelectDay={(day) => select({ kind: 'ring', day })}
              />
            ) : showStaticOrbit ? (
              <StaticOrbit
                days={data.days}
                range={data.range}
                areas={data.definitions.areas}
                trackables={data.definitions.trackables}
                selectedDay={selectedDay}
                liveScore={preview.score}
                onSelectDay={(day) => select({ kind: 'ring', day })}
              />
            ) : (
              <div className="flex min-h-[420px] flex-col justify-between rounded-xl border border-line/50 p-5">
                <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
                  <span>live orbital stage</span>
                  <span>click ring or pick below</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-4">
                  {data.days.slice(-14).reverse().map((d) => (
                    <button
                      key={d.day}
                      type="button"
                      onClick={() => select({ kind: 'ring', day: d.day })}
                      className={`min-h-9 rounded border px-2 font-mono text-[11px] tabular-nums transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] ${
                        selectedDay === d.day
                          ? 'border-accent text-accent'
                          : 'border-line bg-bg/70 text-text-dim hover:text-text'
                      }`}
                    >
                      {d.day.slice(5)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-5">
            <NightPanel
              day={selectedDay}
              sealedDay={selectedSealedDay}
              trackables={data.definitions.trackables}
              isToday={selectedDay === today}
            />
          </div>
        </div>
      )}

      <Pull
        day={today}
        active={activeTodayApi}
        entries={preview.entriesMap}
        days={data.days}
        liveScore={sealedToday ? sealedToday.score : preview.score}
        isSealed={Boolean(sealedToday)}
        defaultExpanded
      />
    </main>
  );
}
