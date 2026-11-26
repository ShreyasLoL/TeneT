'use client';

import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { stageClock } from '@/lib/stage/clock';
import { useTenetStore } from '@/lib/store';
import { rig, subscribeCanvasReady } from '@/lib/store/rig';
import { readMotionTokens } from '@/lib/viz/motion';
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_FOV_DEG,
  CAMERA_INCLINATION_RAD,
  CAMERA_ROLL_RAD,
} from './blackhole/constants';
import { IntroDial } from './IntroDial';
import { buildIntroTimeline } from './introTimeline';

stageClock.bindGsap(gsap);

const LETTERS = ['T', 'E', 'N', 'E', 'T'] as const;

export function IntroWordmark() {
  const mode = useTenetStore((s) => s.mode);
  const webgl = useTenetStore((s) => s.quality.webgl);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
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
  const statusRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const resetRestingCameras = () => {
      rig.cameraOverride.active = false;
      rig.cameraOverride.px = 0;
      rig.cameraOverride.py = 0;
      rig.cameraOverride.pz = 10.6;
      rig.cameraOverride.tx = 0;
      rig.cameraOverride.ty = 0;
      rig.cameraOverride.tz = 0;
      rig.cameraOverride.fov = 45;

      rig.bhCam.distance = CAMERA_DISTANCE_DEFAULT;
      rig.bhCam.fov = CAMERA_FOV_DEG;
      rig.bhCam.inclination = CAMERA_INCLINATION_RAD;
      rig.bhCam.azimuth = 0;
      rig.bhCam.roll = CAMERA_ROLL_RAD;
    };

    const setSettledIntro = () => {
      rig.introSky = 1;
      rig.introShadow = 1;
      rig.introLens = 1;
      rig.introDisk = 1;
      rig.introDiskSweep = 1;
      rig.introRing = 1;
      rig.introTremor = 0;
      rig.introProgress = 1;
      rig.introSpin = 0;
      rig.introTick = 0;
      rig.introActive = false;
    };

    if (introDone) {
      setSettledIntro();
      rig.cameraOverride.active = false;
      return;
    }

    const mediaReduced =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    const uiShortcut =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('ui') === '1';

    if (mode !== 'fork' || lowPower || reducedMotion || mediaReduced || webgl !== 'ok' || uiShortcut) {
      setSettledIntro();
      rig.cameraOverride.active = false;
      setIntroDone(true);
      return;
    }

    rig.introSky = 0;
    rig.introShadow = 0;
    rig.introLens = 0;
    rig.introDisk = 0;
    rig.introDiskSweep = 0;
    rig.introRing = 0;
    rig.introTremor = 0;
    rig.introProgress = 0;
    rig.introSpin = -6.5;
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
        statusRef.current,
        ...letterRefs.current,
      ];
      for (const n of nodes) {
        if (n instanceof HTMLElement || n instanceof SVGElement) n.style.willChange = '';
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      setSettledIntro();
      resetRestingCameras();
      clearWillChange();
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
          statusEl: statusRef.current,
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
      resetRestingCameras();
      setSettledIntro();
    };
  }, [introDone, lowPower, mode, reducedMotion, setIntroDone, webgl]);

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

      {/* Rendered outside transformed assemblyRef so bottom-center anchors cleanly to viewport */}
      <div className="pointer-events-none fixed inset-x-0 bottom-7 flex justify-center">
        <span
          ref={statusRef}
          className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim/85 opacity-0"
        />
      </div>
    </div>
  );
}
