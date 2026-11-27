'use client';

import Link from 'next/link';
import type { RefObject } from 'react';
import { COPY } from '@/lib/copy';
import { rig } from '@/lib/store/rig';

export const FORK_RING_R = 13;
export const FORK_RING_CIRC = 2 * Math.PI * FORK_RING_R;

export function ForkCard({
  side,
  href,
  primary,
  kicker,
  title,
  axiom,
  payoff,
  footer,
  holding,
  recoiling,
  reducedMotion,
  linkRef,
  arcRef,
  onBeginHold,
  onCancelHold,
  onInstantCommit,
  onArrowNav,
}: {
  side: 'left' | 'right';
  href: '/dashboard' | '/log';
  primary: boolean;
  kicker: string;
  title: string;
  axiom: string;
  payoff: string;
  footer: string;
  holding: boolean;
  recoiling: boolean;
  reducedMotion: boolean;
  linkRef: RefObject<HTMLAnchorElement | null>;
  arcRef: RefObject<SVGCircleElement | null>;
  onBeginHold: () => void;
  onCancelHold: () => void;
  onInstantCommit: () => void;
  onArrowNav: (e: React.KeyboardEvent<HTMLAnchorElement>) => void;
}) {
  const hoverDir: -1 | 1 = side === 'left' ? -1 : 1;

  return (
    <Link
      ref={linkRef}
      href={href}
      data-stage-card="true"
      data-fork-side={side}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        if (reducedMotion) {
          onInstantCommit();
        }
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        onBeginHold();
      }}
      onPointerUp={onCancelHold}
      onPointerCancel={onCancelHold}
      onMouseEnter={() => {
        rig.doorHover = hoverDir;
      }}
      onMouseLeave={() => {
        rig.doorHover = 0;
        onCancelHold();
      }}
      onFocus={() => {
        rig.doorHover = hoverDir;
      }}
      onBlur={() => {
        rig.doorHover = 0;
        onCancelHold();
      }}
      onKeyDown={(e) => {
        onArrowNav(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (e.repeat) return;
          onBeginHold();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCancelHold();
        }
      }}
      className={`group relative flex min-h-44 touch-none select-none flex-col items-start justify-between overflow-hidden rounded-md border p-5 text-left transition-[transform,border-color,color] duration-[var(--duration-micro)] ease-[var(--ease-out)] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-52 sm:p-6 ${
        holding
          ? 'scale-[0.975]'
          : recoiling
            ? 'translate-y-0.5 scale-[0.99]'
            : 'hover:-translate-y-0.5'
      } ${
        primary
          ? 'border-accent/50 bg-surface/90 text-text hover:border-accent'
          : 'border-line bg-bg/85 text-text-dim hover:border-text-dim/55 hover:text-text'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-px origin-left transition-transform duration-[var(--duration-ui)] ease-[var(--ease-out)] motion-reduce:transition-none ${
          primary ? 'bg-accent' : 'bg-text/40'
        } ${
          holding
            ? 'scale-x-100'
            : 'scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100'
        }`}
      />

      <div className="relative flex w-full items-center justify-between gap-2">
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.16em] sm:text-[11px] ${
            primary ? 'text-accent' : 'text-text-faint'
          }`}
        >
          {kicker}
        </span>

        <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
          <circle
            cx={16}
            cy={16}
            r={FORK_RING_R}
            fill="none"
            stroke="var(--line)"
            strokeWidth={1.75}
          />
          <circle
            ref={arcRef}
            cx={16}
            cy={16}
            r={FORK_RING_R}
            fill="none"
            stroke={primary ? 'var(--accent)' : 'var(--text)'}
            strokeWidth={2}
            strokeDasharray={FORK_RING_CIRC}
            strokeDashoffset={FORK_RING_CIRC}
            transform="rotate(-90 16 16)"
          />
          <circle
            cx={16}
            cy={16}
            r={2}
            fill={primary ? 'var(--accent)' : 'var(--text-faint)'}
          />
        </svg>
      </div>

      <div className="relative my-3 space-y-1.5">
        <span className="block text-lg font-normal leading-[1.15] tracking-[-0.03em] text-text sm:text-[1.375rem]">
          {title}
        </span>
        <span className="block font-mono text-[10px] tracking-[0.04em] text-text-faint sm:text-[11px]">
          {axiom}
        </span>
        <span
          className={`block font-mono text-[10px] tracking-[0.06em] transition-[opacity,transform] duration-[var(--duration-ui)] ease-[var(--ease-out)] motion-reduce:transform-none sm:text-[11px] ${
            primary ? 'text-accent' : 'text-text-dim'
          } ${
            holding
              ? 'translate-y-0 opacity-100'
              : 'translate-y-1 opacity-0 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-85 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100'
          }`}
        >
          {payoff}
        </span>
      </div>

      <div className="relative flex w-full items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint sm:text-[11px]">
        <span>{footer}</span>
        <span
          className={
            reducedMotion ? 'opacity-0' : holding ? 'text-accent' : 'text-text-faint/80'
          }
        >
          {holding ? COPY.doors.holdActive : COPY.doors.holdIdle}
        </span>
      </div>
    </Link>
  );
}
