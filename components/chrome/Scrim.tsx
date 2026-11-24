'use client';

import type { ReactNode } from 'react';
import { useTenetStore } from '@/lib/store';

/**
 * Linear-gradient scrim behind foreground typography over the live canvas (no backdrop-blur).
 */
export function Scrim({
  children,
  className = '',
  direction = 'down',
}: {
  children: ReactNode;
  className?: string;
  direction?: 'down' | 'up' | 'radial';
}) {
  const density = useTenetStore((s) => s.density);
  const alpha = Math.min(0.88, 0.52 + density * 0.36);

  const background =
    direction === 'radial'
      ? `radial-gradient(ellipse at center, color-mix(in srgb, var(--bg) ${Math.round(
          alpha * 100,
        )}%, transparent) 0%, transparent 78%)`
      : direction === 'up'
        ? `linear-gradient(to top, color-mix(in srgb, var(--bg) ${Math.round(
            alpha * 100,
          )}%, transparent) 0%, transparent 100%)`
        : `linear-gradient(to bottom, color-mix(in srgb, var(--bg) ${Math.round(
            alpha * 100,
          )}%, transparent) 0%, transparent 100%)`;

  return (
    <div style={{ background }} className={className}>
      {children}
    </div>
  );
}
