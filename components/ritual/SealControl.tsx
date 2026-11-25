'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { COPY } from '@/lib/copy';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { readMotionTokens } from '@/lib/viz/motion';

type SealControlProps = {
  unloggedRequiredCount: number;
  isSealed: boolean;
  isPending: boolean;
  errorMessage: string | null;
  onSeal: () => void;
};

const RING_SIZE = 72;
const RING_CENTER = RING_SIZE / 2;
const RING_R = 29;
const RING_CIRC = 2 * Math.PI * RING_R;

export const SealControl = memo(function SealControl({
  unloggedRequiredCount,
  isSealed,
  isPending,
  errorMessage,
  onSeal,
}: SealControlProps) {
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
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

  const setVisualProgress = (p: number) => {
    const clamped = Math.min(1, Math.max(0, p));
    rig.sealHold = clamped;
    if (progressArcRef.current) {
      progressArcRef.current.style.strokeDashoffset = `${(RING_CIRC * (1 - clamped)).toFixed(2)}`;
    }
  };

  const stopAnim = () => {
    if (unsubClockRef.current) {
      unsubClockRef.current();
      unsubClockRef.current = null;
    }
    if (releaseLeaseRef.current) {
      releaseLeaseRef.current();
      releaseLeaseRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopAnim();
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
      rig.sealHold = 0;
    };
  }, []);

  useEffect(() => {
    if (!holding) return;
    const endFromWindow = () => cancelHold();
    window.addEventListener('pointerup', endFromWindow);
    window.addEventListener('pointercancel', endFromWindow);
    window.addEventListener('blur', endFromWindow);
    return () => {
      window.removeEventListener('pointerup', endFromWindow);
      window.removeEventListener('pointercancel', endFromWindow);
      window.removeEventListener('blur', endFromWindow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding]);

  useEffect(() => {
    if (!isPending) firedRef.current = false;
  }, [isPending]);

  const fireOnce = () => {
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
    onSeal();
  };

  const beginHold = () => {
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
  };

  const cancelHold = () => {
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
      // Fast expo-out snap-back without overshoot (emil-design-eng)
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
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
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
  };

  if (isSealed) {
    return (
      <section className="rounded-xl border border-accent/45 bg-surface p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
          {COPY.doors.sealed}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Seal tonight"
      className="rounded-xl border border-line bg-surface p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        {unloggedRequiredCount > 0 ? (
          <p className="font-mono text-xs text-status-warning tabular-nums">
            {unloggedRequiredCount} unlogged count as missed.
          </p>
        ) : null}

        {reducedMotion && confirmOpen ? (
          <div className="space-y-3">
            <p className="text-sm text-text">{COPY.ritual.reducedConfirmPrompt}</p>
            <div className="flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setConfirmOpen(false)}
                className="min-h-11 font-mono text-xs"
              >
                {COPY.ritual.reducedConfirmNo}
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={isPending}
                onClick={fireOnce}
                className="min-h-11 px-5 font-mono text-xs"
              >
                {COPY.ritual.reducedConfirmYes}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-seal-trigger=""
            disabled={isPending}
            aria-label={COPY.ritual.sealIdle}
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              beginHold();
            }}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onKeyDown={onKeyDown}
            className="group relative inline-flex min-h-20 min-w-52 touch-none select-none items-center justify-center gap-4 rounded-full border border-line bg-bg px-6 py-3 transition-[border-color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:border-accent/60 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="size-12 shrink-0">
              <circle
                cx={RING_CENTER}
                cy={RING_CENTER}
                r={RING_R}
                fill="none"
                stroke="var(--line)"
                strokeWidth={2.5}
              />
              <circle
                ref={progressArcRef}
                cx={RING_CENTER}
                cy={RING_CENTER}
                r={RING_R}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeDasharray={RING_CIRC}
                strokeDashoffset={RING_CIRC}
                transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
              />
              <circle cx={RING_CENTER} cy={RING_CENTER} r={4} fill="var(--accent)" />
            </svg>

            <span className="font-mono text-xs uppercase tracking-[0.16em] text-text">
              {isPending
                ? COPY.ritual.sealHolding
                : holding
                  ? COPY.ritual.sealHolding
                  : keyboardArmed
                    ? COPY.ritual.keyboardSeal
                    : COPY.ritual.sealIdle}
            </span>
          </button>
        )}

        <p className="font-mono text-[11px] text-text-faint">
          {reducedMotion
            ? COPY.ritual.sealFootnote
            : `${COPY.ritual.sealFootnote} · ${COPY.ritual.keyboardSeal}`}
        </p>

        {errorMessage ? (
          <p role="alert" className="font-mono text-xs text-status-danger">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
});
