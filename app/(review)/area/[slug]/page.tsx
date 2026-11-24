'use client';

import { useParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { useTenetState } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { useTenetStore } from '@/lib/store';

function AreaShellContent() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const { data, isLoading } = useTenetState();
  const setDensity = useTenetStore((s) => s.setDensity);

  useEffect(() => {
    setDensity(0.5);
  }, [setDensity]);

  if (isLoading) return <LoadingFallback />;
  const area = data?.definitions.areas.find((a) => a.slug === slug);
  if (!area) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <SatorGlyph caption={COPY.status.unknownArea} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8">
      <div className="rounded-xl border border-line bg-surface p-6">
        <h1 className="text-2xl font-normal tracking-tight text-text">{area.name}</h1>
        <p className="mt-2 font-mono text-xs text-text-dim">{area.slug}</p>
      </div>
    </main>
  );
}

export default function AreaPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AreaShellContent />
    </Suspense>
  );
}
