'use client';

import { useEffect } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { Scrim } from '@/components/chrome/Scrim';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { useTenetStore } from '@/lib/store';
import { useSmoothScroll } from '@/lib/viz/useSmoothScroll';
import { MirrorWeek } from './MirrorWeek';

export function WeeklyView() {
  useSmoothScroll();
  const today = useToday();
  const { data, isLoading, isError } = useTenetState();
  const setDensity = useTenetStore((s) => s.setDensity);

  useEffect(() => {
    setDensity(0.5);
  }, [setDensity]);

  if (isLoading) return <LoadingFallback />;
  if (isError || !data) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <SatorGlyph caption={COPY.status.networkError} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8">
      <Scrim className="mb-6 rounded-xl border border-line p-6">
        <h1 className="text-2xl font-normal tracking-tight text-text">weekly mirror</h1>
        <p className="mt-1 font-mono text-xs text-text-dim">
          last week left · this week right
        </p>
      </Scrim>

      <MirrorWeek
        today={today}
        days={data.days}
        trackables={data.definitions.trackables}
      />
    </main>
  );
}
