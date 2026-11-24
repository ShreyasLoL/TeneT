'use client';

type ChoiceSetProps = {
  value: string | undefined;
  options: ReadonlyArray<string>;
  disabled?: boolean;
  label: string;
  onChange: (next: string) => void;
};

export function ChoiceSet({
  value,
  options,
  disabled = false,
  label,
  onChange,
}: ChoiceSetProps) {
  if (options.length === 0) {
    return (
      <input
        type="text"
        disabled={disabled}
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-48 rounded-md border border-line bg-bg px-3 text-sm text-text outline-none focus:border-accent"
      />
    );
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt)}
            className={`min-h-11 rounded-md border px-3 font-mono text-xs transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${
              selected
                ? 'border-accent bg-surface text-accent'
                : 'border-line bg-bg text-text-dim hover:border-text-dim hover:text-text'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
