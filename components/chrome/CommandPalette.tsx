'use client';

import { Dialog } from '@base-ui/react/dialog';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { useLogEntry, useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { addDays, isDayKey } from '@/lib/domain/day';
import { activeTrackables } from '@/lib/domain/schedule';
import { validateTrackableValue } from '@/lib/domain/validateValue';
import { useTenetStore } from '@/lib/store';

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

  const jumpPreview = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    if (q === 'yesterday') return { label: 'yesterday', day: addDays(today, -1) };
    if (q === 'today') return { label: 'today', day: today };
    const rel = q.match(/^-(\d+)d$/);
    if (rel) {
      const n = Number(rel[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 400) {
        return { label: `${n} days ago`, day: addDays(today, -n) };
      }
    }
    if (isDayKey(q)) return { label: q, day: q };
    if (q.startsWith('last ') && state) {
      const targetKey = q.slice(5).trim();
      const matchedTrackable = state.definitions.trackables.find(
        (t) =>
          t.key.toLowerCase().includes(targetKey) ||
          t.label.toLowerCase().includes(targetKey),
      );
      if (matchedTrackable) {
        const lastSealed = [...state.days]
          .reverse()
          .find((d) => d.results.some((r) => r.key === matchedTrackable.key && r.satisfied));
        if (lastSealed) {
          return { label: `last ${matchedTrackable.label}`, day: lastSealed.day };
        }
      }
    }
    return null;
  }, [query, state, today]);

  const quickLogPreview = useMemo(() => {
    const q = query.trim();
    if (!q || activeToday.length === 0) return null;
    const parts = q.split(/\s+/);
    const term = parts[0].toLowerCase();
    const t = activeToday.find(
      (item) => item.key.toLowerCase() === term || item.label.toLowerCase().startsWith(term),
    );
    if (!t) return null;

    let rawVal: unknown;
    if (t.kind === 'check') {
      if (parts.length === 1) rawVal = true;
      else if (parts[1] === 'true' || parts[1] === 'yes' || parts[1] === '1') rawVal = true;
      else if (parts[1] === 'false' || parts[1] === 'no' || parts[1] === '0') rawVal = false;
      else rawVal = parts[1];
    } else if (t.kind === 'count' || t.kind === 'queue' || t.kind === 'duration' || t.kind === 'measure' || t.kind === 'rating') {
      if (parts.length < 2) return null;
      const num = Number(parts[1]);
      rawVal = Number.isFinite(num) ? num : parts[1];
    } else {
      rawVal = parts.slice(1).join(' ');
    }

    return { trackable: t, rawVal };
  }, [activeToday, query]);

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
      if (error instanceof ApiError) {
        setFeedback(error.message);
      } else {
        setFeedback(COPY.status.databaseError);
      }
    }
  };

  return (
    <Dialog.Root
      open={paletteOpen}
      onOpenChange={(open) => {
        if (!open) close();
        else setPaletteOpen(true);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-bg/75" />
        <Dialog.Popup className="fixed top-[18vh] left-1/2 z-50 w-[min(92vw,34rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
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
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
