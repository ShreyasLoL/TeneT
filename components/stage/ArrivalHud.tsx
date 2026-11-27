'use client';

import { useEffect, useRef, useState } from 'react';
import { useTenetState } from '@/lib/api/hooks';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import { useTenetStore } from '@/lib/store';
import { rig, subscribeArrivalHud, triggerArrivalHud } from '@/lib/store/rig';
import { expoBezierEase } from './expoBezier';

const TOTAL_HUD_MS = 1280;
const COUNT_MS = 620;
const BEAM_MS = 520;

export function ArrivalHud() {
  const { data: state } = useTenetState();
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const [activeKind, setActiveKind] = useState<'retrograde' | 'prograde' | null>(null);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const beamRef = useRef<HTMLDivElement | null>(null);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let unsubClock: (() => void) | null = null;
    let releaseLease: (() => void) | null = null;

    const teardown = () => {
      unsubClock?.();
      unsubClock = null;
      releaseLease?.();
      releaseLease = null;
    };

    const unsubArrival = subscribeArrivalHud(() => {
      const kind = rig.arrivalKind;
      teardown();

      const mediaReduced =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

      if (!kind || reducedMotion || mediaReduced) {
        setActiveKind(null);
        return;
      }

      setActiveKind(kind);
      const snapshot = stateRef.current;
      const targetValue =
        kind === 'retrograde'
          ? (snapshot?.days.length ?? 0)
          : (snapshot?.definitions.trackables.length ?? 6);

      const startAt = performance.now();
      releaseLease = acquireFrames('arrival-hud');

      unsubClock = stageClock.subscribe((now) => {
        const elapsed = now - startAt;
        const frameEl = frameRef.current;
        const beamEl = beamRef.current;
        const countEl = countRef.current;

        if (frameEl) {
          const fadeIn = Math.min(1, elapsed / 180);
          const fadeOut =
            elapsed > TOTAL_HUD_MS - 260 ? Math.max(0, (TOTAL_HUD_MS - elapsed) / 260) : 1;
          frameEl.style.opacity = Math.min(fadeIn, fadeOut).toFixed(3);
          const lift = (1 - expoBezierEase(Math.min(1, elapsed / 280))) * 6;
          frameEl.style.transform = `translate3d(0, ${lift.toFixed(2)}px, 0)`;
        }

        if (beamEl) {
          const beamScale = expoBezierEase(Math.min(1, elapsed / BEAM_MS));
          beamEl.style.transform = `scaleX(${beamScale.toFixed(3)})`;
        }

        if (countEl) {
          const countT = expoBezierEase(Math.min(1, elapsed / COUNT_MS));
          const val = Math.round(targetValue * countT);
          countEl.textContent = String(val).padStart(2, '0');
        }

        if (elapsed >= TOTAL_HUD_MS) {
          teardown();
          triggerArrivalHud(null);
          setActiveKind(null);
          return false;
        }
        return true;
      });
    });

    return () => {
      unsubArrival();
      teardown();
    };
  }, [reducedMotion]);

  if (!activeKind) return null;

  const isRetro = activeKind === 'retrograde';
  const sectorLabel = isRetro ? 'retrograde // orbit' : 'prograde // ritual';
  const metricLabel = isRetro ? 'sealed nights' : 'active trackables';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-4 bottom-5 left-4 z-40 flex justify-end sm:right-8 sm:left-auto"
    >
      <div
        ref={frameRef}
        data-arrival-hud={activeKind}
        className="relative w-full max-w-xs overflow-hidden rounded-md border border-line bg-bg/92 px-4 py-3 opacity-0"
        style={{ willChange: 'transform, opacity' }}
      >
        <div
          ref={beamRef}
          className={`pointer-events-none absolute inset-x-0 top-0 h-px origin-left ${
            isRetro ? 'bg-text-dim/60' : 'bg-accent'
          }`}
          style={{ willChange: 'transform' }}
        />

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p
              className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
                isRetro ? 'text-text-dim' : 'text-accent'
              }`}
            >
              {sectorLabel}
            </p>
            <p className="font-mono text-[10px] tracking-[0.12em] text-text-faint">
              {metricLabel}
            </p>
          </div>

          <span
            ref={countRef}
            className={`border-l border-line pl-4 font-mono text-2xl font-light tracking-[-0.03em] tabular-nums ${
              isRetro ? 'text-text' : 'text-accent'
            }`}
          >
            00
          </span>
        </div>
      </div>
    </div>
  );
}
