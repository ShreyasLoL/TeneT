'use client';

import { useState } from 'react';

type MeasureFieldProps = {
  value: number | undefined;
  unit?: string;
  disabled?: boolean;
  label: string;
  onChange: (next: number) => void;
};

export function MeasureField({
  value,
  unit,
  disabled = false,
  label,
  onChange,
}: MeasureFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null ? draft : typeof value === 'number' ? String(value) : '';

  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        aria-label={label}
        value={shown}
        placeholder="—"
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const parsed = Number(text);
          if (text.trim() !== '' && Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        onBlur={() => setDraft(null)}
        className="h-11 w-28 rounded-md border border-line bg-bg px-3 text-right font-mono text-base text-text tabular-nums outline-none transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] focus:border-accent disabled:opacity-45"
      />
      {unit ? <span className="font-mono text-xs text-text-dim">{unit}</span> : null}
    </div>
  );
}
