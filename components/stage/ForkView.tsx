'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Scrim } from '@/components/chrome/Scrim';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { forkLayout } from '@/lib/viz/forkLayout';
import { readMotionTokens } from '@/lib/viz/motion';

type GsapCore = (typeof import('gsap/gsap-core'))['gsap'];

export function ForkView() {
  const router = useRouter();
  const today = useToday();
  const { data: state } = useTenetState();
  const setDensity = useTenetStore((s) => s.setDensity);
  const quality = useTenetStore((s) => s.quality);
  const introDone = useTenetStore((s) => s.introDone);

  const [diving, setDiving] = useState(false);
  const leftRef = useRef<HTMLAnchorElement>(null);
  const rightRef = useRef<HTMLAnchorElement>(null);
  const divingRef = useRef(false);
  const gsapRef = useRef<GsapCore | null>(null);
  const diveTweenRef = useRef<ReturnType<GsapCore['to']> | null>(null);
  const diveReleaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setDensity(0.1);
    router.prefetch('/log');
    router.prefetch('/dashboard');
    let cancelled = false;
    void import('gsap/gsap-core').then((m) => {
      stageClock.bindGsap(m.gsap);
      if (!cancelled) gsapRef.current = m.gsap;
    });
    return () => {
      cancelled = true;
      diveTweenRef.current?.kill();
      diveTweenRef.current = null;
      diveReleaseRef.current?.();
      diveReleaseRef.current = null;
      divingRef.current = false;
      rig.doorHover = 0;
      rig.cameraOverride.active = false;
    };
  }, [router, setDensity]);

  useEffect(() => {
    const interruptDive = () => {
      if (!divingRef.current) return;
      diveTweenRef.current?.kill();
      diveTweenRef.current = null;
      divingRef.current = false;
      setDiving(false);

      const gsapInstance = gsapRef.current;
      if (!gsapInstance) {
        rig.cameraOverride.active = false;
        diveReleaseRef.current?.();
        diveReleaseRef.current = null;
        return;
      }

      // Smoothly return camera from its exact mid-flight presentation state (no snap)
      diveTweenRef.current = gsapInstance.to(rig.cameraOverride, {
        px: 0,
        py: 0.3,
        pz: 11.4,
        tx: 0,
        ty: 0,
        tz: 0,
        fov: 44,
        duration: 0.32,
        ease: 'expo.out',
        onComplete: () => {
          rig.cameraOverride.active = false;
          diveTweenRef.current = null;
          diveReleaseRef.current?.();
          diveReleaseRef.current = null;
        },
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && divingRef.current) {
        e.preventDefault();
        interruptDive();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', interruptDive);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', interruptDive);
    };
  }, []);

  const tonightSealed = Boolean(state?.days.some((d) => d.day === today));

  const handleDoorDive = (
    side: 'left' | 'right',
    href: '/dashboard' | '/log',
    e: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      quality.reducedMotion ||
      quality.lowPower ||
      quality.level >= 4 ||
      quality.webgl !== 'ok'
    ) {
      return;
    }

    e.preventDefault();
    if (divingRef.current) return;
    const gsapInstance = gsapRef.current;
    if (!gsapInstance) {
      router.push(href);
      return;
    }
    divingRef.current = true;
    setDiving(true);

    const { left, right } = forkLayout();
    const door = side === 'left' ? left : right;
    const durationSec = Math.max(0.35, readMotionTokens().sceneMs / 1000);
    diveReleaseRef.current?.();
    diveReleaseRef.current = acquireFrames('fork-dive');

    if (!rig.cameraOverride.active) {
      rig.cameraOverride.active = true;
      rig.cameraOverride.px = 0;
      rig.cameraOverride.py = 0.3;
      rig.cameraOverride.pz = 11.4;
      rig.cameraOverride.tx = door.x;
      rig.cameraOverride.ty = door.y;
      rig.cameraOverride.tz = 0.4;
      rig.cameraOverride.fov = 44;
    }

    let pushed = false;
    diveTweenRef.current = gsapInstance.to(rig.cameraOverride, {
      px: door.x,
      py: door.y,
      pz: 0.9,
      fov: 58,
      duration: durationSec,
      ease: 'expo.out',
      onUpdate: function () {
        if (!pushed && divingRef.current && this.progress() >= 0.58) {
          pushed = true;
          router.push(href);
        }
      },
      onComplete: () => {
        if (!pushed && divingRef.current) router.push(href);
        rig.cameraOverride.active = false;
        divingRef.current = false;
        diveTweenRef.current = null;
        if (diveReleaseRef.current) {
          diveReleaseRef.current();
          diveReleaseRef.current = null;
        }
      },
    });
  };

  const onDoorKeyDown = (side: 'left' | 'right', e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && side === 'right') {
      e.preventDefault();
      leftRef.current?.focus();
    } else if (e.key === 'ArrowRight' && side === 'left') {
      e.preventDefault();
      rightRef.current?.focus();
    }
  };

  const showChrome = introDone || quality.lowPower || quality.reducedMotion || quality.webgl !== 'ok';

  return (
    <main
      className={`flex flex-1 flex-col items-center justify-between px-4 py-8 transition-opacity duration-[var(--duration-scene)] ease-[var(--ease-out)] sm:px-8 sm:py-12 ${
        diving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div
        className={`mt-4 text-center transition-opacity duration-[var(--duration-scene)] ease-[var(--ease-out)] ${
          showChrome ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <h1 className="font-display select-none text-[clamp(3.25rem,9vw,7.25rem)] font-medium leading-none tracking-[var(--tracking-display)] text-text">
          {COPY.brand}
        </h1>
      </div>

      <Scrim
        direction="radial"
        className={`w-full max-w-5xl py-4 transition-opacity duration-[var(--duration-scene)] ease-[var(--ease-out)] ${
          showChrome ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-20 lg:gap-48">
          <Link
            ref={leftRef}
            href="/dashboard"
            onClick={(e) => handleDoorDive('left', '/dashboard', e)}
            onMouseEnter={() => {
              rig.doorHover = -1;
            }}
            onMouseLeave={() => {
              rig.doorHover = 0;
            }}
            onFocus={() => {
              rig.doorHover = -1;
            }}
            onBlur={() => {
              rig.doorHover = 0;
            }}
            onKeyDown={(e) => onDoorKeyDown('left', e)}
            className={`group flex min-h-40 flex-col items-center justify-between rounded-t-full border px-4 py-6 text-center transition-[border-color,color,transform] duration-[var(--duration-ui)] ease-[var(--ease-out)] active:scale-[0.98] sm:min-h-52 sm:p-8 ${
              tonightSealed
                ? 'border-accent/65 bg-surface/65 text-text'
                : 'border-line bg-surface/40 text-text-dim hover:border-text-dim hover:text-text'
            }`}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint sm:text-[11px]">
              retrograde
            </span>
            <span className="text-base font-normal tracking-tight sm:text-xl">
              {COPY.doors.lookBack}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint sm:text-[11px]">
              orbit &amp; ledger
            </span>
          </Link>

          <Link
            ref={rightRef}
            href="/log"
            onClick={(e) => handleDoorDive('right', '/log', e)}
            onMouseEnter={() => {
              rig.doorHover = 1;
            }}
            onMouseLeave={() => {
              rig.doorHover = 0;
            }}
            onFocus={() => {
              rig.doorHover = 1;
            }}
            onBlur={() => {
              rig.doorHover = 0;
            }}
            onKeyDown={(e) => onDoorKeyDown('right', e)}
            className={`group flex min-h-40 flex-col items-center justify-between rounded-t-full border px-4 py-6 text-center transition-[border-color,color,transform] duration-[var(--duration-ui)] ease-[var(--ease-out)] active:scale-[0.98] sm:min-h-52 sm:p-8 ${
              tonightSealed
                ? 'border-line bg-surface/25 text-text-dim'
                : 'border-accent/70 bg-surface/60 text-text hover:border-accent'
            }`}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent sm:text-[11px]">
              prograde
            </span>
            <span className="text-base font-normal tracking-tight sm:text-xl">
              {tonightSealed ? COPY.doors.sealed : COPY.doors.enter}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint sm:text-[11px]">
              {tonightSealed ? 'review open' : 'ritual'}
            </span>
          </Link>
        </div>
      </Scrim>

      <div className="pb-2 text-center">
        {!showChrome ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
            press any key to skip intro
          </p>
        ) : (
          <Link
            href="/time"
            className="inline-flex min-h-11 items-center px-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:text-text"
          >
            {COPY.doors.scrubTime}
          </Link>
        )}
      </div>
    </main>
  );
}
