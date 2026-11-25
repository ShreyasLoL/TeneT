'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { modeForPathname, useTenetStore } from '@/lib/store';

const LazyCommandPalette = dynamic(() => import('@/components/chrome/CommandPalette'), {
  ssr: false,
  loading: () => null,
});

const LazyRecapOverlay = dynamic(
  () => import('@/components/ritual/RecapOverlay').then((m) => ({ default: m.RecapOverlay })),
  { ssr: false, loading: () => null },
);

const LazyPerfOverlay = dynamic(
  () => import('@/components/dev/PerfOverlay').then((m) => ({ default: m.PerfOverlay })),
  { ssr: false, loading: () => null },
);

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
    if (process.env.NODE_ENV !== 'production') {
      void import('@/lib/api/fixtures').then((m) => m.isFixtureMode());
    }
  }, [pathname]);

  useEffect(() => {
    setMode(modeForPathname(pathname));
  }, [pathname, setMode]);

  useEffect(() => {
    if (prevDayRef.current !== today) {
      prevDayRef.current = today;
      setCursor(today);
      setRolloverNotice(COPY.status.rolloverNotice);
      void import('@/components/stage/Turnstile').then((m) =>
        m.triggerTurnstile(useTenetStore.getState().quality.reducedMotion),
      );
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
        return;
      }
      if (event.key === 'Escape' && useTenetStore.getState().paletteOpen) {
        event.preventDefault();
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setPaletteOpen]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const paletteOpen = useTenetStore((s) => s.paletteOpen);
  const hasRecap = useTenetStore((s) => s.recap !== null);
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
        {hasRecap ? <LazyRecapOverlay /> : null}
        {paletteOpen ? <LazyCommandPalette /> : null}
        {process.env.NODE_ENV !== 'production' ? <LazyPerfOverlay /> : null}
      </Suspense>
      {children}
    </QueryClientProvider>
  );
}
