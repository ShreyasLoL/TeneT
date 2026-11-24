'use client';

import gsap from 'gsap';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Scrim } from '@/components/chrome/Scrim';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { acquireFrames } from '@/lib/stage/activity';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { forkLayout } from '@/lib/viz/forkLayout';
import { readMotionTokens } from '@/lib/viz/motion';

export function ForkView() {
  const router = useRouter();
  const today = useToday();
  const { data: state } = useTenetState();
  const setDensity = useTenetStore((s) => s.setDensity);
  const quality = useTenetStore((s) => s.quality);
  const introDone = useTenetStore((s) => s.introDone);
  const leftRef = useRef<HTMLAnchorElement>(null);
  const rightRef = useRef<HTMLAnchorElement>(null);
  const divingRef = useRef(false);

  useEffect(() => {
    setDensity(0.1);
    return () => {
      rig.doorHover = 0;
      rig.cameraOverride.active = false;
    };
  }, [setDensity]);

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
    divingRef.current = true;

    const { left, right } = forkLayout();
    const door = side === 'left' ? left : right;
    const durationSec = Math.max(0.35, readMotionTokens().sceneMs / 1000);
    const release = acquireFrames('fork-dive');

    rig.cameraOverride.active = true;
    rig.cameraOverride.px = 0;
    rig.cameraOverride.py = 0.3;
    rig.cameraOverride.pz = 11.4;
    rig.cameraOverride.tx = door.x;
    rig.cameraOverride.ty = door.y;
    rig.cameraOverride.tz = 0.4;
    rig.cameraOverride.fov = 44;

    let pushed = false;
    gsap.to(rig.cameraOverride, {
      px: door.x,
      py: door.y,
      pz: 0.9,
      fov: 58,
      duration: durationSec,
      ease: 'expo.out',
      onUpdate: function () {
        if (!pushed && this.progress() >= 0.6) {
          pushed = true;
          router.push(href);
        }
      },
      onComplete: () => {
        if (!pushed) router.push(href);
        rig.cameraOverride.active = false;
        divingRef.current = false;
        release();
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

  return (
    <main className="flex flex-1 flex-col items-center justify-between px-6 py-12">
      <div className="mt-6 text-center">
        <h1 className="font-display select-none text-[clamp(3.5rem,10vw,8rem)] font-medium leading-none tracking-[var(--tracking-display)] text-text">
          {COPY.brand}
        </h1>
        {!introDone && !quality.lowPower && !quality.reducedMotion ? (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
            press any key to skip intro
          </p>
        ) : null}
      </div>

      <Scrim direction="radial" className="w-full max-w-4xl py-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-12">
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
            className={`group flex min-h-48 flex-col items-center justify-between rounded-t-full border p-8 text-center transition-colors duration-[var(--duration-ui)] ease-[var(--ease-out)] ${
              tonightSealed
                ? 'border-accent/60 bg-surface/65 text-text'
                : 'border-line bg-surface/40 text-text-dim hover:border-text-dim hover:text-text'
            }`}
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint">
              retrograde
            </span>
            <span className="text-xl font-normal tracking-tight">{COPY.doors.lookBack}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
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
            className={`group flex min-h-48 flex-col items-center justify-between rounded-t-full border p-8 text-center transition-colors duration-[var(--duration-ui)] ease-[var(--ease-out)] ${
              tonightSealed
                ? 'border-line bg-surface/25 text-text-dim'
                : 'border-accent/70 bg-surface/60 text-text hover:border-accent'
            }`}
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
              prograde
            </span>
            <span className="text-xl font-normal tracking-tight">
              {tonightSealed ? COPY.doors.sealed : COPY.doors.enter}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
              {tonightSealed ? 'review open' : 'ritual'}
            </span>
          </Link>
        </div>
      </Scrim>

      <div className="pb-4">
        <Link
          href="/time"
          className="inline-flex min-h-11 items-center px-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:text-text"
        >
          {COPY.doors.scrubTime}
        </Link>
      </div>
    </main>
  );
}
