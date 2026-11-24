'use client';

import { Mirror } from '@/components/chrome/Mirror';
import { COPY } from '@/lib/copy';

type LiveScoreProps = {
  score: number | null;
  metCount: number;
  requiredCount: number;
};

export function LiveScore({ score, metCount, requiredCount }: LiveScoreProps) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line pb-5">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
          {COPY.ritual.liveScorePrefix}
        </p>
        <p className="font-mono text-xs text-text-dim tabular-nums">
          {metCount}/{requiredCount} met
        </p>
      </div>

      <Mirror>
        <span className="font-mono text-5xl font-light tracking-[-0.04em] text-text tabular-nums">
          {score === null ? '—' : score}
        </span>
      </Mirror>
    </div>
  );
}
