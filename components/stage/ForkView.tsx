'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { useDoorDive } from './useDoorDive';

export function ForkView() {
  const today = useToday();
  const { data: state } = useTenetState();
  const setDensity = useTenetStore((s) => s.setDensity);
  const quality = useTenetStore((s) => s.quality);
  const introDone = useTenetStore((s) => s.introDone);

  const leftRef = useRef<HTMLAnchorElement>(null);
  const rightRef = useRef<HTMLAnchorElement>(null);
  const { diving, handleDoorDive } = useDoorDive(quality, setDensity);

  const tonightSealed = Boolean(state?.days.some((d) => d.day === today));
  const showChrome =
    introDone || quality.lowPower || quality.reducedMotion || quality.webgl !== 'ok';

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
    <main
      className={`flex flex-1 flex-col items-center justify-between px-4 py-8 transition-opacity duration-[var(--duration-scene)] ease-[var(--ease-out)] sm:px-8 sm:py-10 ${
        diving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="sr-only">
        <h1>{COPY.brand}</h1>
      </div>

      <section
        aria-label="Entry choices"
        className="mt-auto w-full max-w-6xl py-4 md:my-auto"
      >
        <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-[minmax(230px,280px)_1fr_minmax(230px,280px)] md:items-center md:gap-6">
          <div
            className={`transition-[transform,opacity] duration-[var(--duration-scene)] ease-[var(--ease-out)] delay-0 ${
              showChrome
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-4 opacity-0'
            }`}
          >
            <Link
              ref={leftRef}
              href="/dashboard"
              data-stage-card="true"
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
              className="group relative flex min-h-40 flex-col items-start justify-between overflow-hidden rounded-md border border-line bg-surface/90 p-5 text-left transition-[transform,border-color,color] duration-[var(--duration-ui)] ease-[var(--ease-out)] hover:-translate-y-1 hover:border-text-dim/60 active:scale-[0.985] sm:min-h-48 sm:p-6"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[var(--duration-ui)] ease-[var(--ease-out)] group-hover:opacity-100"
                style={{
                  background:
                    'radial-gradient(circle at 50% 0%, rgba(245, 243, 247, 0.08), transparent 72%)',
                }}
              />
              <span className="relative font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint sm:text-[11px]">
                retrograde
              </span>
              <span className="relative text-base font-normal tracking-tight text-text-dim transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] group-hover:text-text sm:text-xl">
                {COPY.doors.lookBack}
              </span>
              <span className="relative font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint sm:text-[11px]">
                orbit &amp; ledger
              </span>
            </Link>
          </div>

          <div aria-hidden="true" className="hidden min-h-[300px] md:block" />

          <div
            className={`transition-[transform,opacity] duration-[var(--duration-scene)] ease-[var(--ease-out)] delay-100 ${
              showChrome
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-4 opacity-0'
            }`}
          >
            <Link
              ref={rightRef}
              href="/log"
              data-stage-card="true"
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
              className={`group relative flex min-h-40 flex-col items-start justify-between overflow-hidden rounded-md border bg-surface/90 p-5 text-left transition-[transform,border-color,color] duration-[var(--duration-ui)] ease-[var(--ease-out)] hover:-translate-y-1 active:scale-[0.985] sm:min-h-48 sm:p-6 ${
                tonightSealed
                  ? 'border-line text-text-dim hover:border-accent/60'
                  : 'border-line text-text hover:border-accent'
              }`}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[var(--duration-ui)] ease-[var(--ease-out)] group-hover:opacity-100"
                style={{
                  background:
                    'radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 72%)',
                }}
              />
              <span className="relative font-mono text-[10px] uppercase tracking-[0.16em] text-accent sm:text-[11px]">
                prograde
              </span>
              <span className="relative text-base font-normal tracking-tight text-text sm:text-xl">
                {tonightSealed ? COPY.doors.sealed : COPY.doors.enter}
              </span>
              <span className="relative font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint sm:text-[11px]">
                {tonightSealed ? 'review open' : 'ritual'}
              </span>
            </Link>
          </div>
        </div>
      </section>

      <div className="pb-2 text-center">
        {!showChrome ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
            press any key to skip intro
          </p>
        ) : (
          <Link
            href="/time"
            className="inline-flex min-h-11 items-center px-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint transition-[transform,opacity,color] duration-[var(--duration-scene)] ease-[var(--ease-out)] delay-150 hover:text-text"
          >
            {COPY.doors.scrubTime}
          </Link>
        )}
      </div>
    </main>
  );
}
