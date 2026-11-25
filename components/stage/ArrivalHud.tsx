'use client';

import { useEffect, useRef, useState } from 'react';
import { useTenetState } from '@/lib/api/hooks';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import { useTenetStore } from '@/lib/store';
import { rig, subscribeArrivalHud, triggerArrivalHud } from '@/lib/store/rig';
import { expoBezierEase } from './expoBezier';

const TOTAL_HUD_MS = 1350;
const COUNT_MS = 720;
const SCAN_MS = 860;

export function ArrivalHud() {
  const { data: state } = useTenetState();
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const [activeKind, setActiveKind] = useState<'retrograde' | 'prograde' | null>(null);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const scanRef = useRef<HTMLDivElement | null>(null);
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
        const scanEl = scanRef.current;
        const countEl = countRef.current;

        if (frameEl) {
          const fadeIn = Math.min(1, elapsed / 160);
          const fadeOut =
            elapsed > TOTAL_HUD_MS - 300 ? Math.max(0, (TOTAL_HUD_MS - elapsed) / 300) : 1;
          const op = Math.min(fadeIn, fadeOut);
          frameEl.style.opacity = `${op.toFixed(3)}`;
          const lift = (1 - expoBezierEase(Math.min(1, elapsed / 320))) * 8;
          frameEl.style.transform = `translate3d(0, ${lift.toFixed(2)}px, 0)`;
        }

        if (scanEl && frameEl) {
          const scanT = Math.min(1, elapsed / SCAN_MS);
          const h = frameEl.offsetHeight || 116;
          const y = expoBezierEase(scanT) * h;
          const scanAlpha = scanT < 0.85 ? 0.9 : Math.max(0, (1 - scanT) / 0.15) * 0.9;
          scanEl.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
          scanEl.style.opacity = `${scanAlpha.toFixed(3)}`;
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
  const sectorLabel = isRetro
    ? 'sector // retrograde · memory star'
    : 'sector // prograde · ignition core';
  const metricLabel = isRetro ? 'sealed orbits' : 'active vectors';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4"
    >
      <div
        ref={frameRef}
        data-arrival-hud={activeKind}
        className="relative w-full max-w-lg overflow-hidden border border-line bg-surface px-6 py-4 opacity-0 shadow-[0_16px_48px_rgba(0,0,0,0.9)]"
        style={{ willChange: 'transform, opacity' }}
      >
        <div
          ref={scanRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0"
          style={{
            background: isRetro
              ? 'linear-gradient(90deg, transparent, rgba(124, 200, 248, 0.85), transparent)'
              : 'linear-gradient(90deg, transparent, var(--accent), transparent)',
            willChange: 'transform, opacity',
          }}
        />

        <span className="pointer-events-none absolute top-0 left-0 h-2 w-2 border-t border-l border-text-dim/60" />
        <span className="pointer-events-none absolute top-0 right-0 h-2 w-2 border-t border-r border-text-dim/60" />
        <span className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-text-dim/60" />
        <span className="pointer-events-none absolute right-0 bottom-0 h-2 w-2 border-r border-b border-text-dim/60" />

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p
              className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
                isRetro ? 'text-text-dim' : 'text-accent'
              }`}
            >
              {sectorLabel}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
              {metricLabel}
            </p>
          </div>

          <span
            ref={countRef}
            className={`font-mono text-3xl font-light tracking-tight tabular-nums ${
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
