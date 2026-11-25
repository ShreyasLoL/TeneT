'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import { rig } from '@/lib/store/rig';
import { readMotionTokens } from '@/lib/viz/motion';

export function useHoldToSeal({
  ringCircumference,
  reducedMotion,
  isSealed,
  isPending,
  onSeal,
}: {
  ringCircumference: number;
  reducedMotion: boolean;
  isSealed: boolean;
  isPending: boolean;
  onSeal: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const [keyboardArmed, setKeyboardArmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const progressArcRef = useRef<SVGCircleElement>(null);
  const unsubClockRef = useRef<(() => void) | null>(null);
  const releaseLeaseRef = useRef<(() => void) | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const holdingRef = useRef(false);
  const holdStartRef = useRef(0);
  const onSealRef = useRef(onSeal);

  useEffect(() => {
    onSealRef.current = onSeal;
  }, [onSeal]);

  const setVisualProgress = useCallback(
    (p: number) => {
      const clamped = Math.min(1, Math.max(0, p));
      rig.sealHold = clamped;
      if (progressArcRef.current) {
        progressArcRef.current.style.strokeDashoffset = `${(ringCircumference * (1 - clamped)).toFixed(2)}`;
      }
    },
    [ringCircumference],
  );

  const stopAnim = useCallback(() => {
    if (unsubClockRef.current) {
      unsubClockRef.current();
      unsubClockRef.current = null;
    }
    if (releaseLeaseRef.current) {
      releaseLeaseRef.current();
      releaseLeaseRef.current = null;
    }
  }, []);

  const cancelHold = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    stopAnim();
    const startVal = rig.sealHold;
    if (startVal <= 0.001) {
      setVisualProgress(0);
      return;
    }

    const relaxDurationMs = Math.max(120, readMotionTokens().uiMs);
    const startTime = performance.now();
    releaseLeaseRef.current = acquireFrames('seal-relax');

    unsubClockRef.current = stageClock.subscribe((now) => {
      const t = Math.min(1, (now - startTime) / relaxDurationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVisualProgress(startVal * (1 - eased));
      if (t >= 1) {
        unsubClockRef.current = null;
        if (releaseLeaseRef.current) {
          releaseLeaseRef.current();
          releaseLeaseRef.current = null;
        }
        return false;
      }
      return true;
    });
  }, [setVisualProgress, stopAnim]);

  useEffect(() => {
    return () => {
      stopAnim();
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
      rig.sealHold = 0;
    };
  }, [stopAnim]);

  useEffect(() => {
    if (!holding) return;
    window.addEventListener('pointerup', cancelHold);
    window.addEventListener('pointercancel', cancelHold);
    window.addEventListener('blur', cancelHold);
    return () => {
      window.removeEventListener('pointerup', cancelHold);
      window.removeEventListener('pointercancel', cancelHold);
      window.removeEventListener('blur', cancelHold);
    };
  }, [cancelHold, holding]);

  useEffect(() => {
    if (!isPending) firedRef.current = false;
  }, [isPending]);

  const fireOnce = useCallback(() => {
    if (firedRef.current || isPending || isSealed) return;
    firedRef.current = true;
    holdingRef.current = false;
    setHolding(false);
    setKeyboardArmed(false);
    setConfirmOpen(false);
    stopAnim();
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(8);
      } catch {
        // ignore vibration restrictions
      }
    }
    onSealRef.current();
  }, [isPending, isSealed, stopAnim]);

  const beginHold = useCallback(() => {
    if (isSealed || isPending || firedRef.current) return;
    if (reducedMotion) {
      setConfirmOpen(true);
      return;
    }

    stopAnim();
    holdingRef.current = true;
    setHolding(true);
    const holdDurationMs = Math.max(650, readMotionTokens().sceneMs);
    holdStartRef.current = performance.now();
    releaseLeaseRef.current = acquireFrames('seal-hold');

    unsubClockRef.current = stageClock.subscribe((now) => {
      const p = (now - holdStartRef.current) / holdDurationMs;
      setVisualProgress(p);
      if (p >= 1) {
        unsubClockRef.current = null;
        fireOnce();
        return false;
      }
      return true;
    });
  }, [fireOnce, isPending, isSealed, reducedMotion, setVisualProgress, stopAnim]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Escape') {
        if (keyboardArmed || confirmOpen) {
          e.preventDefault();
          setKeyboardArmed(false);
          setConfirmOpen(false);
        }
        return;
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (isSealed || isPending || firedRef.current) return;

      if (reducedMotion) {
        setConfirmOpen(true);
        return;
      }

      if (keyboardArmed) {
        if (armTimerRef.current !== null) {
          window.clearTimeout(armTimerRef.current);
          armTimerRef.current = null;
        }
        setVisualProgress(1);
        fireOnce();
        return;
      }

      setKeyboardArmed(true);
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
      armTimerRef.current = window.setTimeout(() => {
        setKeyboardArmed(false);
      }, 3000);
    },
    [confirmOpen, fireOnce, isPending, isSealed, keyboardArmed, reducedMotion, setVisualProgress],
  );

  return {
    holding,
    keyboardArmed,
    confirmOpen,
    setConfirmOpen,
    progressArcRef,
    beginHold,
    cancelHold,
    fireOnce,
    onKeyDown,
  };
}
