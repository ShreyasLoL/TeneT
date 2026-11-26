'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LADDER_PROFILES, isTouchDevice, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';

type Snapshot = {
  level: QualityLevel;
  p50: number;
  p95: number;
  jsMs: number;
  drawCalls: number;
  triangles: number;
  particles: number;
  dprMax: number;
  activity: string;
  mountCount: number;
  renderer: string;
  isSoftware: boolean;
  forcedSlow: boolean;
};

export function PerfOverlay() {
  const searchParams = useSearchParams();
  const enabled = process.env.NODE_ENV !== 'production' && searchParams.get('perf') === '1';

  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const setQuality = useTenetStore((s) => s.setQuality);

  const [snap, setSnap] = useState<Snapshot>({
    level,
    p50: 0,
    p95: 0,
    jsMs: 0,
    drawCalls: 0,
    triangles: 0,
    particles: LADDER_PROFILES[level].particles,
    dprMax: LADDER_PROFILES[level].dprMax,
    activity: 'still',
    mountCount: 0,
    renderer: 'unknown',
    isSoftware: false,
    forcedSlow: false,
  });

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const curLevel = useTenetStore.getState().quality.level as QualityLevel;
      const profile = profileForLevel(curLevel, isTouchDevice());
      setSnap({
        level: curLevel,
        p50: rig.p50FrameMs,
        p95: rig.p95FrameMs,
        jsMs: rig.jsFrameMs,
        drawCalls: rig.drawCalls,
        triangles: rig.triangles,
        particles: profile.particles,
        dprMax: profile.dprMax,
        activity: rig.activityLevel,
        mountCount: rig.mountCount,
        renderer: rig.rendererName,
        isSoftware: rig.isSoftwareRenderer,
        forcedSlow: rig.injectedFrameMs > 0,
      });
    }, 300);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <aside
      aria-label="Stage performance metrics"
      className="fixed bottom-4 left-4 z-50 w-72 rounded-xl border border-line bg-surface p-3 font-mono text-[11px] text-text-dim"
    >
      <div className="flex items-center justify-between border-b border-line pb-1.5 text-text">
        <span>STAGE PERF</span>
        <span className="text-accent">L{snap.level} · T{rig.bhTier}</span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
        <dt>p50 / p95</dt>
        <dd className="text-right text-text">
          {snap.p50.toFixed(1)} / {snap.p95.toFixed(1)} ms
        </dd>
        <dt>frame js</dt>
        <dd className="text-right text-text">{snap.jsMs.toFixed(1)} ms</dd>
        <dt>draw calls</dt>
        <dd className="text-right text-text">{snap.drawCalls}</dd>
        <dt>triangles</dt>
        <dd className="text-right text-text">{snap.triangles.toLocaleString()}</dd>
        <dt>particles</dt>
        <dd className="text-right text-text">{snap.particles.toLocaleString()}</dd>
        <dt>dpr cap</dt>
        <dd className="text-right text-text">{snap.dprMax}</dd>
        <dt>activity</dt>
        <dd className="text-right text-text">{snap.activity}</dd>
        <dt>mounts</dt>
        <dd className="text-right text-text">{snap.mountCount}</dd>
      </dl>

      {snap.isSoftware ? (
        <p className="mt-2 text-[10px] text-status-warning">
          software renderer ({snap.renderer})
        </p>
      ) : (
        <p className="mt-2 truncate text-[10px] text-text-faint">{snap.renderer}</p>
      )}

      <div className="mt-2 flex gap-2 border-t border-line pt-2">
        <button
          type="button"
          onClick={() => {
            rig.injectedFrameMs = rig.injectedFrameMs > 0 ? 0 : 28;
          }}
          className="flex-1 rounded border border-line px-2 py-1 text-[10px] uppercase tracking-[0.1em] hover:border-accent hover:text-text"
        >
          {snap.forcedSlow ? 'stop slow' : 'force slow'}
        </button>
        <button
          type="button"
          onClick={() => {
            rig.injectedFrameMs = 0;
            rig.manualTierOverride = false;
            setQuality({ level: 0 });
          }}
          className="rounded border border-line px-2 py-1 text-[10px] uppercase tracking-[0.1em] hover:text-text"
        >
          L0
        </button>
      </div>
      <div className="mt-1.5 flex gap-1">
        {([0, 1, 2, 3] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              rig.manualTierOverride = true;
              rig.bhTier = t;
              setQuality({ bhTier: t, ultraKerr: t === 3, lowPower: false });
            }}
            className="flex-1 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] hover:border-accent hover:text-text"
          >
            T{t}{t === 3 ? 'K' : ''}
          </button>
        ))}
      </div>
    </aside>
  );
}
