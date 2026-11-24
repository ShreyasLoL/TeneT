'use client';

import { useEffect } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { Scrim } from '@/components/chrome/Scrim';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { useTenetStore } from '@/lib/store';

export function LogShell() {
  const today = useToday();
  const { data, isLoading, isError } = useTenetState();
  const setDensity = useTenetStore((s) => s.setDensity);

  useEffect(() => {
    setDensity(0.8);
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
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-8">
      <Scrim className="rounded-xl border border-line p-6">
        <div className="flex items-baseline justify-between border-b border-line pb-4">
          <h1 className="text-2xl font-normal tracking-tight text-text">{COPY.ritual.header}</h1>
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-dim tabular-nums">
            {today}
          </span>
        </div>
        <p className="mt-4 font-mono text-xs text-text-dim">
          {data.definitions.trackables.length} active trackables loaded.
        </p>
      </Scrim>
    </main>
  );
}
