'use client';

import { gsap } from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { stageClock } from '@/lib/stage/clock';
import { useTenetStore } from '@/lib/store';
import { rig, subscribeCanvasReady } from '@/lib/store/rig';
import { readMotionTokens } from '@/lib/viz/motion';

stageClock.bindGsap(gsap);

const INTRO_SESSION_KEY = 'tenet.intro';
const LETTERS = ['T', 'E', 'N', 'E', 'T'] as const;
const STAGGER_FRACTIONS = [0.035, 0.064, 0.089, 0.11, 0.128] as const;

/** Exact analytical solver for CSS `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` (zero bounce). */
function expoBezierEase(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const x1 = 0.16;
  const y1 = 1.0;
  const x2 = 0.3;
  const y2 = 1.0;

  let t = x;
  for (let i = 0; i < 6; i++) {
    const inv = 1 - t;
    const bx = 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t - x;
    const dbx = 3 * inv * inv * x1 + 6 * inv * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(dbx) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - bx / dbx));
  }
  const inv = 1 - t;
  return 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t;
}

export function IntroWordmark() {
  const mode = useTenetStore((s) => s.mode);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const introDone = useTenetStore((s) => s.introDone);
  const setIntroDone = useTenetStore((s) => s.setIntroDone);

  const [visible, setVisible] = useState(false);
  const wordRef = useRef<HTMLDivElement | null>(null);
  const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (introDone) {
      rig.introProgress = 1;
      rig.introActive = false;
      return;
    }

    const alreadyPlayed = (() => {
      try {
        return window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1';
      } catch {
        return false;
      }
    })();

    if (mode !== 'fork' || reducedMotion || alreadyPlayed) {
      rig.introProgress = 1;
      rig.introActive = false;
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
    rig.introActive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);

    let started = false;
    let finished = false;
    let tl: ReturnType<typeof gsap.timeline> | null = null;
    let fallbackTimer: number | null = null;

    const getNavBrand = () => {
      const link = document.querySelector<HTMLElement>('header nav a[href="/"]');
      const textSpan = link?.querySelector<HTMLElement>('span:last-child') ?? link;
      return { link, textSpan };
    };

    const clearWillChange = () => {
      if (wordRef.current) wordRef.current.style.willChange = '';
      for (const el of letterRefs.current) {
        if (el) el.style.willChange = '';
      }
    };

    const restoreNav = () => {
      const { link } = getNavBrand();
      if (link) {
        link.style.opacity = '';
        link.style.willChange = '';
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      rig.introProgress = 1;
      rig.introActive = false;
      clearWillChange();
      restoreNav();
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

      const wordEl = wordRef.current;
      const spans = letterRefs.current.filter((s): s is HTMLSpanElement => s !== null);
      if (!wordEl || spans.length === 0) {
        finish();
        return;
      }

      const heroSec = Math.max(0.28, readMotionTokens().heroMs / 1000);
      const { link: navLink, textSpan: navBrandSpan } = getNavBrand();

      wordEl.style.willChange = 'transform, opacity';
      for (const s of spans) s.style.willChange = 'transform, opacity';
      if (navLink) {
        navLink.style.willChange = 'opacity';
        navLink.style.opacity = '0';
      }

      gsap.set(wordEl, { x: 0, y: 0, scale: 1, opacity: 1 });
      gsap.set(spans, { y: 18, scale: 0.94, opacity: 0 });

      tl = gsap.timeline({ onComplete: finish });

      // 1. Single GPU intro uniform: scattered dark cloud -> spiral disk -> horizon last
      tl.fromTo(
        rig,
        { introProgress: 0 },
        { introProgress: 1, duration: heroSec, ease: expoBezierEase },
        0,
      );

      // 2. Letter-by-letter transform + opacity reveal with overlapping cadence
      spans.forEach((span, idx) => {
        tl!.to(
          span,
          {
            y: 0,
            scale: 1,
            opacity: 1,
            duration: heroSec * 0.28,
            ease: expoBezierEase,
          },
          heroSec * STAGGER_FRACTIONS[idx],
        );
      });

      // 3. Smooth FLIP handoff to Nav TENET wordmark (overlapping with horizon fade-in)
      const handoffStart = heroSec * 0.61;
      const handoffDur = heroSec * 0.35;
      let dx = 0;
      let dy = 0;
      let scaleRatio = 0.22;

      tl.to(
        wordEl,
        {
          x: () => dx,
          y: () => dy,
          scale: () => scaleRatio,
          duration: handoffDur,
          ease: expoBezierEase,
          onStart: () => {
            const src = wordEl.getBoundingClientRect();
            const dst = navBrandSpan?.getBoundingClientRect();
            if (dst && src.width > 0 && src.height > 0) {
              dx = dst.left + dst.width * 0.5 - (src.left + src.width * 0.5);
              dy = dst.top + dst.height * 0.5 - (src.top + src.height * 0.5);
              scaleRatio = Math.max(0.14, Math.min(1, dst.height / src.height));
            }
          },
        },
        handoffStart,
      );

      if (navLink) {
        tl.to(
          navLink,
          { opacity: 1, duration: heroSec * 0.09, ease: expoBezierEase },
          heroSec * 0.89,
        );
      }
      tl.to(
        wordEl,
        { opacity: 0, duration: heroSec * 0.08, ease: expoBezierEase },
        heroSec * 0.91,
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        if (tl) tl.progress(1);
        else finish();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      unsubReady();
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      window.removeEventListener('keydown', onKeyDown);
      tl?.kill();
      clearWillChange();
      restoreNav();
      rig.introActive = false;
    };
  }, [introDone, mode, reducedMotion, setIntroDone]);

  if (!visible || introDone) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
    >
      <div
        ref={wordRef}
        className="flex origin-center select-none items-center font-mono text-[clamp(2.5rem,7vw,5.25rem)] font-medium uppercase leading-none tracking-[0.22em] text-text"
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
  );
}
