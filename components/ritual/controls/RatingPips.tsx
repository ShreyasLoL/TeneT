'use client';

type RatingPipsProps = {
  value: number | undefined;
  disabled?: boolean;
  label: string;
  onChange: (next: number) => void;
};

const LEVELS = [1, 2, 3, 4, 5] as const;

export function RatingPips({ value, disabled = false, label, onChange }: RatingPipsProps) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      onChange(Number(e.key));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(5, (value ?? 0) + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(1, (value ?? 2) - 1));
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex items-center gap-1.5"
    >
      {LEVELS.map((n) => {
        const selected = value === n;
        const filled = typeof value === 'number' && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${label} ${n} of 5`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`inline-flex size-11 items-center justify-center rounded-md border font-mono text-sm tabular-nums transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${
              selected
                ? 'border-accent bg-surface text-accent'
                : filled
                  ? 'border-accent/45 bg-bg text-text'
                  : 'border-line bg-bg text-text-faint hover:border-text-dim hover:text-text'
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
