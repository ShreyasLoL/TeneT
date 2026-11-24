'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { PerfOverlay } from '@/components/dev/PerfOverlay';
import { RecapOverlay } from '@/components/ritual/RecapOverlay';
import { triggerTurnstile } from '@/components/stage/Turnstile';
import { isFixtureMode } from '@/lib/api/fixtures';
import { useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { modeForPathname, useTenetStore } from '@/lib/store';

function RuntimeEffects() {
  const pathname = usePathname();
  const today = useToday();
  const queryClient = useQueryClient();

  const setMode = useTenetStore((s) => s.setMode);
  const setCursor = useTenetStore((s) => s.setCursor);
  const setQuality = useTenetStore((s) => s.setQuality);
  const setRolloverNotice = useTenetStore((s) => s.setRolloverNotice);
  const setPaletteOpen = useTenetStore((s) => s.setPaletteOpen);

  const prevDayRef = useRef(today);

  useEffect(() => {
    isFixtureMode();
  }, [pathname]);

  useEffect(() => {
    setMode(modeForPathname(pathname));
  }, [pathname, setMode]);

  useEffect(() => {
    if (prevDayRef.current !== today) {
      prevDayRef.current = today;
      setCursor(today);
      setRolloverNotice(COPY.status.rolloverNotice);
      triggerTurnstile(useTenetStore.getState().quality.reducedMotion);
      void queryClient.invalidateQueries({ queryKey: ['tenet'] });
    }
  }, [queryClient, setCursor, setRolloverNotice, today]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyPref = () => setQuality({ reducedMotion: mq.matches });
    applyPref();
    mq.addEventListener('change', applyPref);
    return () => mq.removeEventListener('change', applyPref);
  }, [setQuality]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(!useTenetStore.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setPaletteOpen]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <RuntimeEffects />
        <RecapOverlay />
        {process.env.NODE_ENV !== 'production' ? <PerfOverlay /> : null}
      </Suspense>
      {children}
    </QueryClientProvider>
  );
}
