import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { dayKey } from '@/lib/domain/day';
import type { DayKey } from '@/lib/domain/types';

export type Mode = 'fork' | 'ritual' | 'orbit' | 'week' | 'time' | 'area';

export type Selection =
  | { kind: 'ring'; day: DayKey }
  | { kind: 'segment'; day: DayKey; key: string }
  | { kind: 'area'; slug: string }
  | null;

export type QualityState = {
  level: 0 | 1 | 2 | 3 | 4;
  bhTier: 0 | 1 | 2 | 3;
  ultraKerr: boolean;
  lowPower: boolean;
  reducedMotion: boolean;
  webgl: 'ok' | 'none' | 'lost';
};

export type LivePreview = {
  score: number | null;
  met: string[];
  unmet: string[];
};

export type RecapState = null | {
  day: DayKey;
  startedAt: number;
  skipped: boolean;
};

export interface TenetStore {
  mode: Mode;
  cursor: DayKey;
  selection: Selection;
  density: number;
  livePreview: LivePreview;
  recap: RecapState;
  introDone: boolean;
  quality: QualityState;
  alwaysAlive: boolean;
  soundEnabled: boolean;
  rolloverNotice: string | null;
  offlineOutboxCount: number;
  isOffline: boolean;
  paletteOpen: boolean;

  setMode: (mode: Mode) => void;
  setCursor: (day: DayKey) => void;
  select: (selection: Selection) => void;
  setDensity: (density: number) => void;
  setLivePreview: (preview: LivePreview) => void;
  startRecap: (day: DayKey) => void;
  skipRecap: () => void;
  endRecap: () => void;
  setIntroDone: (done: boolean) => void;
  setQuality: (partial: Partial<QualityState>) => void;
  setLowPower: (lowPower: boolean) => void;
  setAlwaysAlive: (alwaysAlive: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setRolloverNotice: (notice: string | null) => void;
  setOfflineState: (isOffline: boolean, outboxCount: number) => void;
  setPaletteOpen: (open: boolean) => void;
}

const LOW_POWER_KEY = 'tenet.lowPower';

function readInitialLowPower(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LOW_POWER_KEY) === '1';
  } catch {
    return false;
  }
}

export function modeForPathname(pathname: string): Mode {
  if (pathname.startsWith('/log')) return 'ritual';
  if (pathname.startsWith('/dashboard')) return 'orbit';
  if (pathname.startsWith('/weekly')) return 'week';
  if (pathname.startsWith('/time')) return 'time';
  if (pathname.startsWith('/area/')) return 'area';
  return 'fork';
}

export const useTenetStore = create<TenetStore>()(
  subscribeWithSelector((set) => ({
    mode: 'fork',
    cursor: dayKey(new Date()),
    selection: null,
    density: 0.1,
    livePreview: { score: null, met: [], unmet: [] },
    recap: null,
    introDone: false,
    quality: {
      level: 0,
      bhTier: 0,
      ultraKerr: false,
      lowPower: readInitialLowPower(),
      reducedMotion: false,
      webgl: 'ok',
    },
    alwaysAlive: false,
    soundEnabled: false,
    rolloverNotice: null,
    offlineOutboxCount: 0,
    isOffline: false,
    paletteOpen: false,

    setMode: (mode) => set({ mode }),
    setCursor: (cursor) => set({ cursor }),
    select: (selection) => set({ selection }),
    setDensity: (density) => set({ density: Math.min(1, Math.max(0, density)) }),
    setLivePreview: (livePreview) => set({ livePreview }),
    startRecap: (day) =>
      set({
        recap: { day, startedAt: Date.now(), skipped: false },
      }),
    skipRecap: () =>
      set((state) => (state.recap ? { recap: { ...state.recap, skipped: true } } : state)),
    endRecap: () => set({ recap: null }),
    setIntroDone: (introDone) => set({ introDone }),
    setQuality: (partial) =>
      set((state) => ({
        quality: { ...state.quality, ...partial },
      })),
    setLowPower: (lowPower) => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LOW_POWER_KEY, lowPower ? '1' : '0');
        } catch {
          // ignore storage failure
        }
      }
      set((state) => ({
        quality: {
          ...state.quality,
          lowPower,
          level: lowPower ? 4 : state.quality.level === 4 ? 0 : state.quality.level,
          bhTier: lowPower ? 0 : state.quality.bhTier,
        },
      }));
    },
    setAlwaysAlive: (alwaysAlive) => set({ alwaysAlive }),
    setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
    setRolloverNotice: (rolloverNotice) => set({ rolloverNotice }),
    setOfflineState: (isOffline, offlineOutboxCount) =>
      set({ isOffline, offlineOutboxCount }),
    setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  })),
);
