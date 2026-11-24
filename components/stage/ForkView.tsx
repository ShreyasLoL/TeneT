'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Scrim } from '@/components/chrome/Scrim';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { rig } from '@/lib/store/rig';
import { useTenetStore } from '@/lib/store';

export function ForkView() {
  const today = useToday();
  const { data: state } = useTenetState();
  const setDensity = useTenetStore((s) => s.setDensity);
  const leftRef = useRef<HTMLAnchorElement>(null);
  const rightRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setDensity(0.1);
  }, [setDensity]);

  const tonightSealed = Boolean(state?.days.some((d) => d.day === today));

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
      </div>

      <Scrim direction="radial" className="w-full max-w-4xl py-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-12">
          <Link
            ref={leftRef}
            href="/dashboard"
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
