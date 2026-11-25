import { SatorGlyph } from './SatorGlyph';
import { COPY } from '@/lib/copy';

type LoadingFallbackProps = {
  caption?: string;
  variant?: 'log' | 'wide';
};

/**
 * Route-matched geometry skeleton so Suspense / query resolution produces 0.00 CLS.
 */
export function LoadingFallback({
  caption = COPY.status.loading,
  variant = 'log',
}: LoadingFallbackProps) {
  const maxWidthClass = variant === 'wide' ? 'max-w-6xl' : 'max-w-4xl';

  return (
    <main
      aria-busy="true"
      aria-label={caption}
      className={`mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full ${maxWidthClass} flex-1 flex-col gap-6 px-4 py-8 sm:px-8`}
    >
      <div className="flex min-h-40 items-center justify-center rounded-xl border border-line bg-surface/60 p-6">
        <SatorGlyph animate caption={caption} />
      </div>
      <div className="min-h-[52vh] flex-1 rounded-xl border border-line/60 bg-surface/35" />
    </main>
  );
}
