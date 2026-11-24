import { Suspense } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';

export default function WeeklyPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-6 py-12">
        <SatorGlyph caption="weekly mirror" />
      </main>
    </Suspense>
  );
}
