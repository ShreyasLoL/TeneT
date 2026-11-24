'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { useTenetStore } from '@/lib/store';
import { LowPowerToggle } from './LowPowerToggle';
import { Scrim } from './Scrim';

function formatLogicalDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const weekday = utc.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const month = utc.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${d} ${month}`.toLowerCase();
}

const NAV_LINKS = [
  { href: '/log', label: 'log' },
  { href: '/dashboard', label: 'orbit' },
  { href: '/weekly', label: 'week' },
  { href: '/time', label: 'time' },
] as const;

export function Nav() {
  const pathname = usePathname();
  const today = useToday();
  const setPaletteOpen = useTenetStore((s) => s.setPaletteOpen);
  const rolloverNotice = useTenetStore((s) => s.rolloverNotice);
  const setRolloverNotice = useTenetStore((s) => s.setRolloverNotice);

  const dayLabel = useMemo(() => formatLogicalDayLabel(today), [today]);

  return (
    <header className="sticky top-0 z-30 w-full">
      <Scrim direction="down" className="border-b border-line/80 px-4 sm:px-8">
        <nav
          aria-label="Primary"
          className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2.5 font-mono text-xs uppercase tracking-[0.22em] text-text transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:text-accent"
            >
              <span className="inline-block size-2 rounded-full bg-accent" aria-hidden="true" />
              <span>{COPY.brand}</span>
            </Link>
            <div className="hidden items-center gap-1 sm:flex">
              {NAV_LINKS.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex min-h-10 items-center px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] ${
                      active ? 'text-accent' : 'text-text-dim hover:text-text'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-text-dim tabular-nums md:inline">
            {dayLabel}
          </span>

          <div className="flex items-center gap-1">
            <LowPowerToggle />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              className="inline-flex min-h-10 min-w-11 items-center justify-center rounded-md border border-line bg-surface px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:text-text"
            >
              ⌘K
            </button>
          </div>
        </nav>

        <div className="flex items-center justify-center gap-2 pb-2 sm:hidden">
          {NAV_LINKS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-9 items-center px-2 font-mono text-[11px] uppercase tracking-[0.12em] ${
                  active ? 'text-accent' : 'text-text-dim'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {rolloverNotice ? (
          <div
            role="status"
            aria-live="polite"
            className="mx-auto flex max-w-6xl items-center justify-between border-t border-line py-2 font-mono text-xs text-text-dim"
          >
            <span>{rolloverNotice}</span>
            <button
              type="button"
              onClick={() => setRolloverNotice(null)}
              className="ml-4 text-[11px] uppercase tracking-[0.12em] text-text-faint hover:text-text"
            >
              dismiss
            </button>
          </div>
        ) : null}
      </Scrim>
    </header>
  );
}
