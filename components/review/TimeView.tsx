'use client';

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { Scrim } from '@/components/chrome/Scrim';
import { StaticOrbit } from '@/components/stage/StaticOrbit';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { addDays } from '@/lib/domain/day';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { NightPanel } from './NightPanel';
import { TimeTape } from './TimeTape';

export function TimeView() {
  const today = useToday();
  const { data, isLoading, isError } = useTenetState();
  const cursor = useTenetStore((s) => s.cursor);
  const setCursor = useTenetStore((s) => s.setCursor);
  const setDensity = useTenetStore((s) => s.setDensity);
  const quality = useTenetStore((s) => s.quality);

  useEffect(() => {
    setDensity(0.3);
    return () => {
      rig.cursorVelocity = 0;
      rig.uDir = 1;
    };
  }, [setDensity]);

  const activeDay = useMemo(() => {
    if (!data) return today;
    if (cursor < data.range.from) return data.range.from;
    if (cursor > data.range.to) return data.range.to;
    return cursor;
  }, [cursor, data, today]);

  // Defer heavy panel/SVG filtering under rapid 120Hz scrubbing so TimeTape & WebGL stay locked at VSync
  const deferredDay = useDeferredValue(activeDay);

  const sealedByDay = useMemo(
    () => new Map(data?.days.map((d) => [d.day, d]) ?? []),
    [data?.days],
  );
  const sealedDay = sealedByDay.get(deferredDay) ?? null;

  const handleScrubCursor = useCallback(
    (nextDay: string) => {
      startTransition(() => {
        setCursor(nextDay);
      });
    },
    [setCursor],
  );

  if (isLoading) return <LoadingFallback variant="wide" />;
  if (isError || !data) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <SatorGlyph caption={COPY.status.networkError} />
      </main>
    );
  }

  const earliest = data.days[0]?.day ?? addDays(today, -30);
  const showStaticOrbit =
    quality.lowPower || quality.reducedMotion || quality.level >= 4 || quality.webgl !== 'ok';
  const visibleDays = data.days.filter((d) => d.day <= deferredDay);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-between gap-6 px-4 py-8 sm:px-8">
      <h1 className="sr-only">Time scrubber</h1>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {showStaticOrbit ? (
            <StaticOrbit
              days={visibleDays}
              range={{ from: earliest, to: deferredDay }}
              areas={data.definitions.areas}
              trackables={data.definitions.trackables}
              selectedDay={deferredDay}
              onSelectDay={handleScrubCursor}
            />
          ) : (
            <Scrim className="flex min-h-[340px] flex-col justify-between rounded-xl border border-line/40 p-5">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
                <span>temporal orbit</span>
                <span className="tabular-nums">{visibleDays.length} rings emerged</span>
              </div>
              <p className="font-mono text-xs text-text-dim">
                scrubbing back pulls rings inward through the horizon.
              </p>
            </Scrim>
          )}
        </div>

        <div className="lg:col-span-5">
          <NightPanel
            day={deferredDay}
            sealedDay={sealedDay}
            trackables={data.definitions.trackables}
            isToday={deferredDay === today}
          />
        </div>
      </div>

      <TimeTape
        from={earliest}
        to={today}
        cursor={activeDay}
        days={data.days}
        onChangeCursor={handleScrubCursor}
      />
    </main>
  );
}
