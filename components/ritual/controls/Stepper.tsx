'use client';

import { memo, useEffect, useRef } from 'react';

type StepperProps = {
  value: number | undefined;
  disabled?: boolean;
  label: string;
  onChange: (next: number) => void;
};

export const Stepper = memo(function Stepper({
  value,
  disabled = false,
  label,
  onChange,
}: StepperProps) {
  const current = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hasValue = typeof value === 'number';
  const latestRef = useRef(current);

  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    latestRef.current = current;
  }, [current]);

  const stopRepeat = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => stopRepeat, []);

  const startRepeat = (delta: number) => {
    if (disabled) return;
    stopRepeat();
    const step = () => {
      const next = Math.max(0, latestRef.current + delta);
      latestRef.current = next;
      onChange(next);
    };
    step();
    timerRef.current = window.setTimeout(() => {
      intervalRef.current = window.setInterval(step, 90);
    }, 340);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === '+') {
      e.preventDefault();
      onChange(current + 1);
    } else if (e.key === 'ArrowLeft' || e.key === '-') {
      e.preventDefault();
      onChange(Math.max(0, current - 1));
    }
  };

  return (
    <div
      className="inline-flex items-center gap-2"
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        disabled={disabled || current <= 0}
        aria-label={`Decrease ${label}`}
        onPointerDown={() => startRepeat(-1)}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onChange(Math.max(0, current - 1));
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-md border border-line bg-bg font-mono text-base text-text-dim transition-[border-color,color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:border-text-dim hover:text-text active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
      >
        −
      </button>

      <span className="min-w-12 text-center font-mono text-lg text-text tabular-nums">
        {hasValue ? current : '—'}
      </span>

      <button
        type="button"
        disabled={disabled}
        aria-label={`Increase ${label}`}
        onPointerDown={() => startRepeat(1)}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onChange(current + 1);
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-md border border-line bg-bg font-mono text-base text-text transition-[border-color,color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:border-accent/70 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
      >
        +
      </button>
    </div>
  );
});
