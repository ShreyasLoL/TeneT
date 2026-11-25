'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import { rig } from '@/lib/store/rig';
import { startHoldTensionAudio, stopHoldTensionAudio } from './forkAudio';

const HOLD_MS = 700;
const RECOIL_MS = 260;

export function useForkHold({
  ringCircumference,
  reducedMotion,
  disabled,
  onCommit,
}: {
  ringCircumference: number;
  reducedMotion: boolean;
  disabled: boolean;
  onCommit: (side: 'left' | 'right', href: '/dashboard' | '/log') => void;
}) {
  const [holdingSide, setHoldingSide] = useState<'left' | 'right' | null>(null);
  const [recoilingSide, setRecoilingSide] = useState<'left' | 'right' | null>(null);

  const leftArcRef = useRef<SVGCircleElement | null>(null);
  const rightArcRef = useRef<SVGCircleElement | null>(null);
  const activeSideRef = useRef<'left' | 'right' | null>(null);
  const activeHrefRef = useRef<'/dashboard' | '/log'>('/log');
  const progressRef = useRef(0);
  const holdStartRef = useRef(0);
  const unsubClockRef = useRef<(() => void) | null>(null);
  const releaseLeaseRef = useRef<(() => void) | null>(null);
  const recoilTimerRef = useRef<number | null>(null);
  const committedRef = useRef(false);

  const writeVisuals = useCallback(
    (side: 'left' | 'right' | null, p: number) => {
      const clamped = Math.min(1, Math.max(0, p));
      progressRef.current = clamped;

      if (!committedRef.current && !rig.forkActive) {
        const dir = side === 'left' ? -1 : side === 'right' ? 1 : 0;
        rig.sealHold = clamped * 0.9;
        rig.forkMode = dir * clamped * 0.65;
        rig.forkHue = clamped * 0.55;
      }

      const leftOffset = side === 'left' ? ringCircumference * (1 - clamped) : ringCircumference;
      const rightOffset = side === 'right' ? ringCircumference * (1 - clamped) : ringCircumference;
      if (leftArcRef.current) leftArcRef.current.style.strokeDashoffset = `${leftOffset.toFixed(2)}`;
      if (rightArcRef.current) {
        rightArcRef.current.style.strokeDashoffset = `${rightOffset.toFixed(2)}`;
      }
    },
    [ringCircumference],
  );

  const stopAnim = useCallback(() => {
    unsubClockRef.current?.();
    unsubClockRef.current = null;
    releaseLeaseRef.current?.();
    releaseLeaseRef.current = null;
  }, []);

  const cancelHold = useCallback(() => {
    const side = activeSideRef.current;
    if (!side || committedRef.current) return;
    activeSideRef.current = null;
    setHoldingSide(null);
    stopAnim();
    stopHoldTensionAudio(false);

    const startP = progressRef.current;
    if (startP <= 0.01) {
      writeVisuals(null, 0);
      return;
    }

    setRecoilingSide(side);
    if (recoilTimerRef.current !== null) window.clearTimeout(recoilTimerRef.current);
    recoilTimerRef.current = window.setTimeout(() => setRecoilingSide(null), RECOIL_MS);

    const startAt = performance.now();
    releaseLeaseRef.current = acquireFrames('fork-recoil');
    unsubClockRef.current = stageClock.subscribe((now) => {
      const t = Math.min(1, (now - startAt) / RECOIL_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      writeVisuals(side, startP * (1 - eased));
      if (t >= 1) {
        writeVisuals(null, 0);
        unsubClockRef.current = null;
        releaseLeaseRef.current?.();
        releaseLeaseRef.current = null;
        return false;
      }
      return true;
    });
  }, [stopAnim, writeVisuals]);

  const commitNow = useCallback(
    (side: 'left' | 'right', href: '/dashboard' | '/log') => {
      if (committedRef.current || disabled) return;
      committedRef.current = true;
      activeSideRef.current = null;
      setHoldingSide(null);
      stopAnim();
      stopHoldTensionAudio(true);
      if (leftArcRef.current) leftArcRef.current.style.strokeDashoffset = `${ringCircumference}`;
      if (rightArcRef.current) rightArcRef.current.style.strokeDashoffset = `${ringCircumference}`;
      onCommit(side, href);
    },
    [disabled, onCommit, ringCircumference, stopAnim],
  );

  const beginHold = useCallback(
    (side: 'left' | 'right', href: '/dashboard' | '/log') => {
      if (disabled || committedRef.current) return;
      const mediaReduced =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

      if (reducedMotion || mediaReduced) {
        commitNow(side, href);
        return;
      }

      stopAnim();
      if (recoilTimerRef.current !== null) window.clearTimeout(recoilTimerRef.current);
      setRecoilingSide(null);
      activeSideRef.current = side;
      activeHrefRef.current = href;
      setHoldingSide(side);
      holdStartRef.current = performance.now();
      releaseLeaseRef.current = acquireFrames('fork-hold');
      startHoldTensionAudio(side, HOLD_MS / 1000);

      unsubClockRef.current = stageClock.subscribe((now) => {
        const p = (now - holdStartRef.current) / HOLD_MS;
        writeVisuals(side, p);
        if (p >= 1) {
          unsubClockRef.current = null;
          commitNow(side, activeHrefRef.current);
          return false;
        }
        return true;
      });
    },
    [commitNow, disabled, reducedMotion, stopAnim, writeVisuals],
  );

  useEffect(() => {
    if (!disabled) committedRef.current = false;
  }, [disabled]);

  useEffect(() => {
    if (!holdingSide) return;
    window.addEventListener('pointerup', cancelHold);
    window.addEventListener('pointercancel', cancelHold);
    window.addEventListener('blur', cancelHold);
    return () => {
      window.removeEventListener('pointerup', cancelHold);
      window.removeEventListener('pointercancel', cancelHold);
      window.removeEventListener('blur', cancelHold);
    };
  }, [cancelHold, holdingSide]);

  useEffect(() => {
    return () => {
      stopAnim();
      stopHoldTensionAudio(false);
      if (recoilTimerRef.current !== null) window.clearTimeout(recoilTimerRef.current);
    };
  }, [stopAnim]);

  return {
    holdingSide,
    recoilingSide,
    leftArcRef,
    rightArcRef,
    beginHold,
    cancelHold,
    commitNow,
  };
}
