'use client';

import { Button } from '@/components/ui/button';
import { COPY } from '@/lib/copy';
import { useTenetStore } from '@/lib/store';

export function LowPowerToggle() {
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const setLowPower = useTenetStore((s) => s.setLowPower);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={lowPower}
      title={COPY.status.lowPowerDetail}
      onClick={() => setLowPower(!lowPower)}
      className={`min-h-9 px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] ${
        lowPower ? 'text-accent' : 'text-text-dim hover:text-text'
      }`}
    >
      {COPY.status.lowPower}
      {lowPower ? ' · on' : ''}
    </Button>
  );
}
