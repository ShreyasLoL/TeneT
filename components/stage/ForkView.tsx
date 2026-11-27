'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { useTenetStore } from '@/lib/store';
import { FORK_RING_CIRC, ForkCard } from './ForkCard';
import { TelemetryHud } from './TelemetryHud';
import { useDoorDive } from './useDoorDive';
import { useForkHold } from './useForkHold';

export function ForkView() {
  const today = useToday();
  const { data: state } = useTenetState();
  const setDensity = useTenetStore((s) => s.setDensity);
  const quality = useTenetStore((s) => s.quality);
  const introDone = useTenetStore((s) => s.introDone);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  const leftRef = useRef<HTMLAnchorElement>(null);
  const rightRef = useRef<HTMLAnchorElement>(null);
  const { diving, startJourney } = useDoorDive(quality, setDensity);

  const tonightSealed = Boolean(state?.days.some((d) => d.day === today));
  const showChrome =
    hydrated &&
    (introDone || quality.reducedMotion || quality.webgl !== 'ok');

  const {
    holdingSide,
    recoilingSide,
    leftArcRef,
    rightArcRef,
    beginHold,
    cancelHold,
    commitNow,
  } = useForkHold({
    ringCircumference: FORK_RING_CIRC,
    reducedMotion: quality.reducedMotion,
    disabled: diving || !showChrome,
    onCommit: startJourney,
  });

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
      className={`flex flex-1 flex-col items-center justify-between px-4 py-6 transition-opacity duration-[var(--duration-scene)] ease-[var(--ease-out)] sm:px-8 sm:py-8 ${
        diving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="sr-only">
        <h1>{COPY.brand}</h1>
      </div>

      <TelemetryHud
        today={today}
        sealedDays={state?.days}
        tonightSealed={tonightSealed}
        visible={showChrome}
      />

      <section
        aria-label="Entry choices"
        className="mt-auto w-full max-w-6xl py-4 md:my-auto"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-[minmax(240px,295px)_1fr_minmax(240px,295px)] md:items-center md:gap-6">
          <div
            className={`transition-[transform,opacity] duration-[380ms] ease-[var(--ease-out)] motion-reduce:transition-opacity motion-reduce:transform-none ${
              tonightSealed ? 'delay-[40ms]' : 'delay-[95ms]'
            } ${
              showChrome
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-2.5 opacity-0'
            }`}
          >
            <ForkCard
              side="left"
              href="/dashboard"
              primary={tonightSealed}
              kicker="retrograde"
              title={COPY.doors.lookBack}
              axiom={COPY.doors.retrogradeAxiom}
              payoff={COPY.doors.retrogradePayoff}
              footer="orbit & ledger"
              holding={holdingSide === 'left'}
              recoiling={recoilingSide === 'left'}
              reducedMotion={quality.reducedMotion}
              linkRef={leftRef}
              arcRef={leftArcRef}
              onBeginHold={() => beginHold('left', '/dashboard')}
              onCancelHold={cancelHold}
              onInstantCommit={() => commitNow('left', '/dashboard')}
              onArrowNav={(e) => onDoorKeyDown('left', e)}
            />
          </div>

          <div aria-hidden="true" className="hidden min-h-[320px] md:block" />

          <div
            className={`transition-[transform,opacity] duration-[380ms] ease-[var(--ease-out)] motion-reduce:transition-opacity motion-reduce:transform-none ${
              !tonightSealed ? 'delay-[40ms]' : 'delay-[95ms]'
            } ${
              showChrome
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-2.5 opacity-0'
            }`}
          >
            <ForkCard
              side="right"
              href="/log"
              primary={!tonightSealed}
              kicker="prograde"
              title={tonightSealed ? COPY.doors.sealed : COPY.doors.enter}
              axiom={COPY.doors.progradeAxiom}
              payoff={COPY.doors.progradePayoff}
              footer={tonightSealed ? 'review open' : 'ritual'}
              holding={holdingSide === 'right'}
              recoiling={recoilingSide === 'right'}
              reducedMotion={quality.reducedMotion}
              linkRef={rightRef}
              arcRef={rightArcRef}
              onBeginHold={() => beginHold('right', '/log')}
              onCancelHold={cancelHold}
              onInstantCommit={() => commitNow('right', '/log')}
              onArrowNav={(e) => onDoorKeyDown('right', e)}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col items-center gap-1 pb-1 text-center">
        <p
          className={`font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint transition-opacity duration-[var(--duration-ui)] ease-[var(--ease-out)] ${
            showChrome ? 'opacity-90' : 'opacity-0'
          }`}
        >
          {COPY.doors.credo}
        </p>
        {!showChrome ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
            press any key to skip intro
          </p>
        ) : (
          <Link
            href="/time"
            className="inline-flex min-h-10 items-center rounded-sm px-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint transition-[opacity,color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:text-text active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {COPY.doors.scrubTime}
          </Link>
        )}
      </div>
    </main>
  );
}
