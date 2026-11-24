'use client';

import { useMemo } from 'react';
import { INSCRIPTION_NOTCHES, inscription } from '@/lib/viz/inscribe';

const SIZE = 56;
const C = SIZE / 2;
const BASE_R = 20;

export function ProofRing({ text }: { text: string }) {
  const notches = useMemo(() => inscription(text), [text]);

  const points = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i < INSCRIPTION_NOTCHES; i++) {
      const theta = (i / INSCRIPTION_NOTCHES) * Math.PI * 2 - Math.PI / 2;
      const amp = (notches[i] / 255) * 4.5;
      const r = BASE_R + amp;
      const x = C + Math.cos(theta) * r;
      const y = C + Math.sin(theta) * r;
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return pts.join(' ');
  }, [notches]);

  const hasText = text.trim().length > 0;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="size-14 shrink-0 select-none"
      role="img"
      aria-label={hasText ? 'Reflection proof ring inscribed' : 'Empty proof ring'}
    >
      <circle
        cx={C}
        cy={C}
        r={BASE_R}
        fill="none"
        stroke="var(--line)"
        strokeWidth={1}
      />
      <polygon
        points={points}
        fill="none"
        stroke={hasText ? 'var(--accent)' : 'var(--text-faint)'}
        strokeOpacity={hasText ? 0.85 : 0.45}
        strokeWidth={1.25}
      />
    </svg>
  );
}
