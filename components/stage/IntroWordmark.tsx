'use client';

import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { stageClock } from '@/lib/stage/clock';
import { useTenetStore } from '@/lib/store';
import { rig, subscribeCanvasReady } from '@/lib/store/rig';
import { readMotionTokens } from '@/lib/viz/motion';
import { IntroDial } from './IntroDial';
import { buildIntroTimeline } from './introTimeline';

stageClock.bindGsap(gsap);

const INTRO_SESSION_KEY = 'tenet.intro';
const LETTERS = ['T', 'E', 'N', 'E', 'T'] as const;

export function IntroWordmark() {
  const mode = useTenetStore((s) => s.mode);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const introDone = useTenetStore((s) => s.introDone);
  const setIntroDone = useTenetStore((s) => s.setIntroDone);

  const [visible, setVisible] = useState(false);
  const assemblyRef = useRef<HTMLDivElement | null>(null);
  const wordRef = useRef<HTMLDivElement | null>(null);
  const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const hairlineRef = useRef<HTMLDivElement | null>(null);
  const dialGroupRef = useRef<SVGGElement | null>(null);
  const tickRefs = useRef<Array<SVGLineElement | null>>([]);
  const timerRingRef = useRef<SVGCircleElement | null>(null);
  const clockReadoutRef = useRef<HTMLSpanElement | null>(null);
  const nightBeginsRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (introDone) {
      rig.introProgress = 1;
      rig.introSpin = 0;
      rig.introTick = 0;
      rig.introActive = false;
      rig.cameraOverride.active = false;
      return;
    }

    const mediaReduced =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

    const alreadyPlayed = (() => {
      try {
        return window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1';
      } catch {
        return false;
      }
    })();

    if (mode !== 'fork' || reducedMotion || mediaReduced || alreadyPlayed) {
      rig.introProgress = 1;
      rig.introSpin = 0;
      rig.introTick = 0;
      rig.introActive = false;
      rig.cameraOverride.active = false;
      if (mode === 'fork') {
        try {
          window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
        } catch {
          // ignore storage restrictions
        }
      }
      setIntroDone(true);
      return;
    }

    rig.introProgress = 0;
    rig.introSpin = 5.2;
    rig.introTick = 1;
    rig.introActive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);

    let started = false;
    let finished = false;
    let tl: ReturnType<typeof gsap.timeline> | null = null;
    let fallbackTimer: number | null = null;

    const clearWillChange = () => {
      const nodes: Array<Element | null> = [
        assemblyRef.current,
        wordRef.current,
        hairlineRef.current,
        dialGroupRef.current,
        timerRingRef.current,
        clockReadoutRef.current,
        nightBeginsRef.current,
        ...letterRefs.current,
      ];
      for (const n of nodes) {
        if (n instanceof HTMLElement || n instanceof SVGElement) n.style.willChange = '';
      }
    };

    const resetRigCamera = () => {
      rig.cameraOverride.active = false;
      rig.cameraOverride.px = 0;
      rig.cameraOverride.py = 0;
      rig.cameraOverride.pz = 10.6;
      rig.cameraOverride.tx = 0;
      rig.cameraOverride.ty = 0;
      rig.cameraOverride.tz = 0;
      rig.cameraOverride.fov = 45;
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      rig.introProgress = 1;
      rig.introSpin = 0;
      rig.introTick = 0;
      rig.introActive = false;
      resetRigCamera();
      clearWillChange();
      try {
        window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
      } catch {
        // ignore storage restrictions
      }
      setVisible(false);
      setIntroDone(true);
    };

    const startTimeline = () => {
      if (started || finished) return;
      started = true;
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }

      const assemblyEl = assemblyRef.current;
      const wordEl = wordRef.current;
      const spans = letterRefs.current.filter((s): s is HTMLSpanElement => s !== null);
      const ticks = tickRefs.current.filter((t): t is SVGLineElement => t !== null);

      if (!assemblyEl || !wordEl || spans.length === 0) {
        finish();
        return;
      }

      tl = buildIntroTimeline(
        {
          assemblyEl,
          wordEl,
          spans,
          hairlineEl: hairlineRef.current,
          dialGroupEl: dialGroupRef.current,
          ticks,
          timerRingEl: timerRingRef.current,
          clockEl: clockReadoutRef.current,
          nightEl: nightBeginsRef.current,
        },
        readMotionTokens().heroMs,
        finish,
      );
    };

    const unsubReady = subscribeCanvasReady(() => {
      window.requestAnimationFrame(startTimeline);
    });
    if (rig.canvasReady) {
      window.requestAnimationFrame(startTimeline);
    } else {
      fallbackTimer = window.setTimeout(startTimeline, 320);
    }

    const skip = () => {
      if (tl) tl.progress(1);
      else finish();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Tab' ||
        e.key === 'Shift' ||
        e.key === 'Control' ||
        e.key === 'Alt' ||
        e.key === 'Meta'
      ) {
        return;
      }
      skip();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', skip, { once: true });

    return () => {
      unsubReady();
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', skip);
      tl?.kill();
      clearWillChange();
      resetRigCamera();
      rig.introSpin = 0;
      rig.introTick = 0;
      rig.introActive = false;
    };
  }, [introDone, mode, reducedMotion, setIntroDone]);

  if (!visible || introDone) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
    >
      <div ref={assemblyRef} className="relative flex items-center justify-center">
        <IntroDial
          hairlineRef={hairlineRef}
          dialGroupRef={dialGroupRef}
          tickRefs={tickRefs}
          timerRingRef={timerRingRef}
          clockReadoutRef={clockReadoutRef}
          nightBeginsRef={nightBeginsRef}
        />

        <div
          ref={wordRef}
          className="flex origin-center select-none items-center font-mono text-[clamp(2.25rem,6vw,4.5rem)] font-medium uppercase leading-none tracking-[0.22em] text-text"
        >
          {LETTERS.map((ch, i) => (
            <span
              key={i}
              ref={(el) => {
                letterRefs.current[i] = el;
              }}
              className="inline-block opacity-0"
            >
              {ch}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
