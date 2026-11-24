import { SatorGlyph } from './SatorGlyph';
import { COPY } from '@/lib/copy';

export function LoadingFallback({ caption = COPY.status.loading }: { caption?: string }) {
  return (
    <div className="flex min-h-[50dvh] flex-1 items-center justify-center p-6">
      <SatorGlyph animate caption={caption} />
    </div>
  );
}
