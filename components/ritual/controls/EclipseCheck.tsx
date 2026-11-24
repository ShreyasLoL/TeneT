'use client';

type EclipseCheckProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
};

export function EclipseCheck({ checked, disabled = false, label, onChange }: EclipseCheckProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group relative inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
    >
      <span
        aria-hidden="true"
        className={`relative flex size-7 items-center justify-center rounded-full border transition-[border-color,background-color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)] group-active:scale-[0.96] ${
          checked
            ? 'border-accent bg-bg shadow-[0_0_16px_rgba(224,77,234,0.35)]'
            : 'border-text-faint/55 bg-transparent group-hover:border-text-dim'
        }`}
      >
        <span
          className={`size-5 rounded-full transition-[transform,opacity,background-color] duration-[var(--duration-micro)] ease-[var(--ease-out)] ${
            checked ? 'scale-100 bg-bg opacity-100 ring-1 ring-accent' : 'scale-75 opacity-0'
          }`}
        />
      </span>
    </button>
  );
}
