'use client';

const SATOR_GRID = [
  ['S', 'A', 'T', 'O', 'R'],
  ['A', 'R', 'E', 'P', 'O'],
  ['T', 'E', 'N', 'E', 'T'],
  ['O', 'P', 'E', 'R', 'A'],
  ['R', 'O', 'T', 'A', 'S'],
] as const;

type SatorGlyphProps = {
  animate?: boolean;
  caption?: string;
  compact?: boolean;
  className?: string;
};

/**
 * 5x5 Sator palindrome square: the center N is the singularity axis.
 */
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
        }`}
      >
        {SATOR_GRID.flatMap((row, r) =>
          row.map((ch, c) => {
            const isCenter = r === 2 && c === 2;
            const dist = Math.abs(r - 2) + Math.abs(c - 2);
            return (
              <span
                key={`${r}-${c}`}
                style={
                  animate
                    ? {
                        transitionProperty: 'opacity',
                        transitionDuration: '280ms',
                        transitionTimingFunction: 'var(--ease-out)',
                        transitionDelay: `${dist * 70}ms`,
                      }
                    : undefined
                }
                className={`inline-flex items-center justify-center text-center select-none ${
                  isCenter ? 'font-medium text-accent' : 'text-text-faint'
                } ${animate ? 'animate-pulse' : ''}`}
              >
                {ch}
              </span>
            );
          }),
        )}
      </div>
      {caption ? (
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
          {caption}
        </span>
      ) : null}
    </div>
  );
}
