'use client';

const SATOR_LETTERS = 'SATORAREPOTENETOPERAROTAS';

type SatorGlyphProps = {
  animate?: boolean;
  caption?: string;
  compact?: boolean;
  className?: string;
};

export function SatorGlyph({
  animate = false,
  caption,
  compact = false,
  className = '',
}: SatorGlyphProps) {
  return (
    <div className={`inline-flex flex-col items-center gap-3 ${className}`}>
      <div
        role="img"
        aria-label={caption ?? 'TENET'}
        className={`grid grid-cols-5 font-mono leading-none tracking-[0.18em] ${
          compact ? 'gap-x-1 gap-y-0.5 text-[9px]' : 'gap-x-2.5 gap-y-1.5 text-xs'
        } ${animate ? 'transition-opacity duration-[var(--duration-ui)] ease-[var(--ease-out)]' : ''}`}
      >
        {Array.from(SATOR_LETTERS, (ch, idx) => (
          <span
            key={idx}
            className={`inline-flex items-center justify-center text-center select-none ${
              idx === 12 ? 'font-medium text-accent' : 'text-text-faint'
            }`}
          >
            {ch}
          </span>
        ))}
      </div>
      {caption ? (
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
          {caption}
        </span>
      ) : null}
    </div>
  );
}
