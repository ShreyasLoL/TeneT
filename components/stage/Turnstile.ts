import { gsap } from 'gsap/gsap-core';
import { acquireFrames } from '@/lib/stage/activity';
import { rig } from '@/lib/store/rig';

/**
 * Trigger the 1.2s mirrored rollover inversion sequence when logical day crosses 04:00.
 */
export function triggerTurnstile(reducedMotion: boolean): () => void {
  if (reducedMotion) {
    rig.turnstileProgress = 0;
    rig.turnstilePulse = 0;
    return () => undefined;
  }

  const release = acquireFrames('turnstile');
  rig.turnstileProgress = 1;
  rig.turnstilePulse = 1;

  const ctx = gsap.context(() => {
    const tl = gsap.timeline({
      onComplete: () => {
        rig.turnstileProgress = 0;
        rig.turnstilePulse = 0;
        release();
      },
    });
    tl.to(rig, { uDir: -1, turnstilePulse: 1, duration: 0.55, ease: 'expo.out' });
    tl.to(rig, { uDir: 1, turnstileProgress: 0, turnstilePulse: 0, duration: 0.65, ease: 'expo.out' });
  });

  return () => {
    ctx.revert();
    rig.turnstileProgress = 0;
    rig.turnstilePulse = 0;
    release();
  };
}
