import Link from 'next/link';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { COPY } from '@/lib/copy';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <SatorGlyph caption={COPY.status.notFound} />
      <Link
        href="/"
        className="inline-flex min-h-11 items-center border border-line px-4 font-mono text-xs uppercase tracking-[0.14em] text-text-dim transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:text-text"
      >
        return to fork
      </Link>
    </main>
  );
}
