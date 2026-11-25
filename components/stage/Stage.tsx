'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { detectInitialLevel, detectWebGL2Support } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { ArrivalHud } from './ArrivalHud';
import { ForkTransitionOverlay } from './ForkTransitionOverlay';
import { IntroWordmark } from './IntroWordmark';
import { StageErrorBoundary } from './StageErrorBoundary';

const LazyStageCanvas = dynamic(() => import('./StageCanvas'), {
  ssr: false,
  loading: () => null,
});

export function Stage() {
  const webgl = useTenetStore((s) => s.quality.webgl);
  const setQuality = useTenetStore((s) => s.setQuality);

  useEffect(() => {
    const hasWebGL2 = detectWebGL2Support();
    const initial = detectInitialLevel();
    setQuality({
      webgl: hasWebGL2 ? 'ok' : 'none',
      level: useTenetStore.getState().quality.lowPower ? 4 : initial,
    });
  }, [setQuality]);

  if (webgl === 'none' || webgl === 'lost') {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 bg-[var(--bg)]"
    >
      <StageErrorBoundary>
        <LazyStageCanvas />
      </StageErrorBoundary>
      <IntroWordmark />
      <ForkTransitionOverlay />
      <ArrivalHud />
    </div>
  );
}
