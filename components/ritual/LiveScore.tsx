'use client';

import { memo, useEffect, useState } from 'react';
import { Mirror } from '@/components/chrome/Mirror';
import { COPY } from '@/lib/copy';

type LiveScoreProps = {
  score: number | null;
  metCount: number;
  requiredCount: number;
};

export const LiveScore = memo(function LiveScore({
  score,
  metCount,
  requiredCount,
}: LiveScoreProps) {
  const [announced, setAnnounced] = useState<string>('');

  useEffect(() => {
    const id = window.setTimeout(() => {
      const scoreLabel = score === null ? 'unscored' : `score ${score}`;
      setAnnounced(`${scoreLabel}, ${metCount} of ${requiredCount} required met`);
    }, 450);
    return () => window.clearTimeout(id);
  }, [metCount, requiredCount, score]);

  return (
    <div className="flex items-center justify-between gap-6 border-b border-line pb-5">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
          {COPY.ritual.liveScorePrefix}
        </p>
        <p className="font-mono text-xs text-text-dim tabular-nums">
          {metCount}/{requiredCount} met
        </p>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {announced}
        </span>
      </div>

      <Mirror>
        <span className="font-mono text-5xl font-light tracking-[-0.04em] text-text tabular-nums">
          {score === null ? '—' : score}
        </span>
      </Mirror>
    </div>
  );
});
