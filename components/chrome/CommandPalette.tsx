'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { useLogEntry, useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { activeTrackables } from '@/lib/domain/schedule';
import { validateTrackableValue } from '@/lib/domain/validateValue';
import { useTenetStore } from '@/lib/store';
import { resolveJumpPreview, resolveQuickLogPreview } from './paletteCommands';

export default function CommandPalette() {
  const router = useRouter();
  const today = useToday();
  const { data: state } = useTenetState();
  const logMutation = useLogEntry();

  const paletteOpen = useTenetStore((s) => s.paletteOpen);
  const setPaletteOpen = useTenetStore((s) => s.setPaletteOpen);
  const setCursor = useTenetStore((s) => s.setCursor);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const setLowPower = useTenetStore((s) => s.setLowPower);
  const alwaysAlive = useTenetStore((s) => s.alwaysAlive);
  const setAlwaysAlive = useTenetStore((s) => s.setAlwaysAlive);

  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (paletteOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [paletteOpen]);

  const activeToday = useMemo(
    () => (state ? activeTrackables(state.definitions.trackables, today) : []),
    [state, today],
  );

  const jumpPreview = useMemo(
    () => resolveJumpPreview(query, today, state),
    [query, state, today],
  );

  const quickLogPreview = useMemo(
    () => resolveQuickLogPreview(query, activeToday),
    [activeToday, query],
  );

  const close = () => {
    setFeedback(null);
    setQuery('');
    setPaletteOpen(false);
  };

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const runQuickLog = async () => {
    if (!quickLogPreview) return;
    const { trackable, rawVal } = quickLogPreview;
    const parsed = validateTrackableValue(trackable, rawVal);
    if (!parsed.ok) {
      setFeedback(parsed.message || COPY.status.invalidValue);
      return;
    }

    try {
      await logMutation.mutateAsync({
        day: today,
        key: trackable.key,
        version: trackable.version,
        value: parsed.data,
      });
      close();
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : COPY.status.databaseError);
    }
  };

  if (!paletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" onClick={close} className="fixed inset-0 bg-bg/78" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        className="fixed top-[16vh] left-1/2 z-50 w-[min(92vw,34rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none"
      >
        <Command label="Command palette" className="flex flex-col">
          <div className="border-b border-line px-4 py-3">
            <Command.Input
              autoFocus
              value={query}
              onValueChange={(val) => {
                setQuery(val);
                if (feedback) setFeedback(null);
              }}
              placeholder="go, jump (-7d, yesterday), or log..."
              className="w-full bg-transparent font-mono text-sm text-text placeholder:text-text-faint outline-none"
            />
          </div>

          {feedback ? (
            <p role="alert" className="border-b border-line px-4 py-2 font-mono text-xs text-status-danger">
              {feedback}
            </p>
          ) : null}

          <Command.List className="max-h-80 overflow-y-auto p-2 font-mono text-xs">
            <Command.Empty className="px-3 py-6 text-center text-text-faint">
              no matching command.
            </Command.Empty>

            {jumpPreview ? (
              <Command.Group heading="jump" className="mb-2 text-[10px] uppercase tracking-[0.14em] text-text-faint">
                <Command.Item
                  value={`jump ${jumpPreview.label} ${jumpPreview.day}`}
                  onSelect={() => {
                    setCursor(jumpPreview.day);
                    go('/time');
                  }}
                  className="mt-1 flex cursor-pointer items-center justify-between rounded-md px-3 py-2.5 text-xs normal-case tracking-normal text-text aria-selected:bg-bg aria-selected:text-accent"
                >
                  <span>jump to {jumpPreview.label}</span>
                  <span className="text-text-dim tabular-nums">{jumpPreview.day}</span>
                </Command.Item>
              </Command.Group>
            ) : null}

            {quickLogPreview ? (
              <Command.Group heading="log" className="mb-2 text-[10px] uppercase tracking-[0.14em] text-text-faint">
                <Command.Item
                  value={`log ${quickLogPreview.trackable.key} ${String(quickLogPreview.rawVal)}`}
                  onSelect={() => void runQuickLog()}
                  className="mt-1 flex cursor-pointer items-center justify-between rounded-md px-3 py-2.5 text-xs normal-case tracking-normal text-text aria-selected:bg-bg aria-selected:text-accent"
                >
                  <span>
                    log {quickLogPreview.trackable.label}: {String(quickLogPreview.rawVal)}
                  </span>
                  <span className="text-text-faint">tonight</span>
                </Command.Item>
              </Command.Group>
            ) : null}

            <Command.Group heading="go" className="mb-2 text-[10px] uppercase tracking-[0.14em] text-text-faint">
              {[
                { label: 'fork', href: '/' },
                { label: 'log tonight', href: '/log' },
                { label: 'dashboard orbit', href: '/dashboard' },
                { label: 'weekly mirror', href: '/weekly' },
                { label: 'time scrubber', href: '/time' },
                ...(state?.definitions.areas.map((a) => ({
                  label: `area: ${a.name.toLowerCase()}`,
                  href: `/area/${a.slug}`,
                })) ?? []),
              ].map((item) => (
                <Command.Item
                  key={item.href}
                  value={`go ${item.label}`}
                  onSelect={() => go(item.href)}
                  className="mt-0.5 flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs normal-case tracking-normal text-text-dim aria-selected:bg-bg aria-selected:text-text"
                >
                  <span>{item.label}</span>
                  <span className="text-text-faint">{item.href}</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="seal" className="mb-2 text-[10px] uppercase tracking-[0.14em] text-text-faint">
              <Command.Item
                value="seal tonight focus control"
                onSelect={() => {
                  close();
                  router.push('/log');
                  window.setTimeout(() => {
                    document.querySelector<HTMLElement>('[data-seal-trigger]')?.focus();
                  }, 220);
                }}
                className="mt-0.5 flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs normal-case tracking-normal text-text-dim aria-selected:bg-bg aria-selected:text-accent"
              >
                <span>focus seal control</span>
                <span className="text-text-faint">/log</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="settings" className="text-[10px] uppercase tracking-[0.14em] text-text-faint">
              <Command.Item
                value="toggle low power"
                onSelect={() => {
                  setLowPower(!lowPower);
                  close();
                }}
                className="mt-0.5 flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs normal-case tracking-normal text-text-dim aria-selected:bg-bg aria-selected:text-text"
              >
                <span>low power mode</span>
                <span className="text-accent">{lowPower ? 'on' : 'off'}</span>
              </Command.Item>
              <Command.Item
                value="toggle always alive ambient"
                onSelect={() => {
                  setAlwaysAlive(!alwaysAlive);
                  close();
                }}
                className="mt-0.5 flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs normal-case tracking-normal text-text-dim aria-selected:bg-bg aria-selected:text-text"
              >
                <span>always-alive ambient</span>
                <span className="text-accent">{alwaysAlive ? 'on' : 'off'}</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
