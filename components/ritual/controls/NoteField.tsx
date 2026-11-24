'use client';

type NoteFieldProps = {
  value: string | undefined;
  disabled?: boolean;
  label: string;
  onChange: (next: string) => void;
};

export function NoteField({ value, disabled = false, label, onChange }: NoteFieldProps) {
  const current = value ?? '';

  return (
    <div className="w-full max-w-md space-y-1">
      <textarea
        rows={2}
        maxLength={2000}
        disabled={disabled}
        aria-label={label}
        value={current}
        placeholder="note"
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-md border border-line bg-bg px-3 py-2 text-sm text-text outline-none transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] focus:border-accent disabled:opacity-45"
      />
      <p className="text-right font-mono text-[11px] text-text-faint tabular-nums">
        {current.length}/2000
      </p>
    </div>
  );
}
