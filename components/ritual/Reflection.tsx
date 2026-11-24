'use client';

import { COPY } from '@/lib/copy';
import { ProofRing } from './ProofRing';

type ReflectionProps = {
  value: string;
  disabled?: boolean;
  error?: string | null;
  onChange: (next: string) => void;
};

export function Reflection({ value, disabled = false, error, onChange }: ReflectionProps) {
  return (
    <section
      aria-label="Nightly reflection"
      className="rounded-xl border border-line bg-surface p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="flex items-start gap-4">
        <ProofRing text={value} />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="nightly-reflection"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim"
            >
              reflection
            </label>
            <span className="font-mono text-[11px] text-text-faint tabular-nums">
              {value.trim().length}/500
            </span>
          </div>

          <textarea
            id="nightly-reflection"
            rows={3}
            maxLength={500}
            disabled={disabled}
            value={value}
            placeholder={COPY.ritual.reflectionPlaceholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full resize-y rounded-md border border-line bg-bg px-3 py-2.5 text-[15px] leading-relaxed text-text placeholder:text-text-faint outline-none transition-[border-color,color] duration-[var(--duration-micro)] ease-[var(--ease-out)] focus:border-accent disabled:opacity-50"
          />

          {error ? (
            <p role="alert" className="font-mono text-xs text-status-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
