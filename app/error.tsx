'use client';

import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { Button } from '@/components/ui/button';
import { COPY } from '@/lib/copy';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <SatorGlyph caption={COPY.status.databaseError} />
      <Button
        type="button"
        variant="outline"
        onClick={() => reset()}
        className="min-h-11 font-mono text-xs uppercase tracking-[0.14em]"
      >
        try again
      </Button>
    </main>
  );
}
