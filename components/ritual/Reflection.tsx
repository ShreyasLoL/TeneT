'use client';

import { memo, useState } from 'react';
import { COPY } from '@/lib/copy';
import { ProofRing } from './ProofRing';

type ReflectionProps = {
  initialValue?: string;
  sealedValue?: string | null;
  disabled?: boolean;
  error?: string | null;
  onDraftChange: (next: string) => void;
  onClearError?: () => void;
};

export const Reflection = memo(function Reflection({
  initialValue = '',
  sealedValue,
  disabled = false,
  error,
  onDraftChange,
  onClearError,
}: ReflectionProps) {
  const [draft, setDraft] = useState(initialValue);
  const shown = sealedValue !== undefined && sealedValue !== null ? sealedValue : draft;

  return (
    <section
      aria-label="Nightly reflection"
      className="rounded-xl border border-line bg-surface p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="flex items-start gap-4">
        <ProofRing text={shown} />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="nightly-reflection"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim"
            >
              reflection
            </label>
            <span className="font-mono text-[11px] text-text-faint tabular-nums">
              {shown.trim().length}/500
            </span>
          </div>

          <textarea
            id="nightly-reflection"
            rows={3}
            maxLength={500}
            disabled={disabled}
            value={shown}
            placeholder={COPY.ritual.reflectionPlaceholder}
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              onDraftChange(next);
              if (error && onClearError) onClearError();
            }}
            className="w-full resize-y rounded-md border border-line bg-bg px-3 py-2.5 text-base leading-relaxed text-text placeholder:text-text-faint outline-none transition-[border-color,color] duration-[var(--duration-micro)] ease-[var(--ease-out)] focus:border-accent disabled:opacity-50"
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
});
