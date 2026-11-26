'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { getBhAssets, setBhAssets } from '@/stage/blackhole/assetStore';
import { BhPipelineRenderer, type BhTier } from '@/stage/blackhole/bhRenderer';
import { createBootstrapAssets } from '@/stage/blackhole/bootstrapAssets';
import { detectGpuCaps } from '@/stage/blackhole/gpuCaps';
import { loadCoreBhAssets, loadKerrLut, loadLightweightT0Assets, loadSkyTier } from '@/stage/blackhole/lutLoader';
import { GpuTimerRing } from '@/stage/blackhole/qualityController';

declare global {
  interface Window {
    __TENET_BH__?: {
      getTier: () => BhTier;
      setTier: (tier: BhTier) => Promise<void> | void;
      setCheatsEnabled: (enabled: boolean) => void;
      setSimTime: (t: number | null) => void;
      setCameraPose: (px: number, py: number, pz: number, tx?: number, ty?: number, tz?: number, fov?: number) => void;
      renderDeterministicFrames: (count?: number, dtSec?: number) => void;
      getVramMb: () => number;
      getInfo: () => Record<string, unknown>;
    };
  }
}

export function Postfx() {
  const { gl, scene, camera, size, invalidate, advance } = useThree();
  const mode = useTenetStore((s) => s.mode);
  const storeTier = useTenetStore((s) => s.quality.bhTier);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const ultraKerr = useTenetStore((s) => s.quality.ultraKerr);

  const rendererRef = useRef<BhPipelineRenderer | null>(null);
  const gpuTimerRef = useRef<GpuTimerRing | null>(null);
  const simOverrideRef = useRef<number | null>(null);
  const loadedSkyRef = useRef<'bootstrap' | 'low' | 'mid' | 'high'>('bootstrap');
  const kerrRequestedRef = useRef(false);

  useEffect(() => {
    const caps = detectGpuCaps(gl.getContext() as WebGL2RenderingContext);
    rig.rendererName = caps.rendererName;
    rig.isSoftwareRenderer = caps.isSoftwareRenderer;

    const bootstrap = createBootstrapAssets();
    setBhAssets(bootstrap);

    const pipe = new BhPipelineRenderer(size.width, size.height, caps);
    rendererRef.current = pipe;
    const gpuTimer = new GpuTimerRing(gl.getContext() as WebGL2RenderingContext, caps.disjointTimerQuery);
    gpuTimerRef.current = gpuTimer;
    void pipe.compileAsync(gl, false);

    let cancelled = false;
    let corePromise: Promise<void> | null = null;
    const ensureFullCoreAssets = () => {
      if (!corePromise) {
        corePromise = (async () => {
          const core = await loadCoreBhAssets(gl);
          if (cancelled) return;
          await pipe.compileHeroAsync(gl);
          if (cancelled) return;
          loadedSkyRef.current = 'low';
          setBhAssets(core);
          invalidate();
        })().catch(() => {});
      }
      return corePromise;
    };

    const bootTimer = window.setTimeout(() => {
      if (cancelled) return;
      const isSlowOrLow =
        useTenetStore.getState().quality.lowPower ||
        (rig.p95FrameMs > 32 && !rig.manualTierOverride);
      if (isSlowOrLow) {
        void loadLightweightT0Assets(gl)
          .then((lite) => {
            if (!cancelled) {
              setBhAssets(lite);
              invalidate();
            }
          })
          .catch(() => {});
      } else {
        void ensureFullCoreAssets();
      }
    }, 360);

    if (typeof window !== 'undefined') {
      window.__TENET_BH__ = {
        getTier: () => rig.bhTier,
        setTier: async (t: BhTier) => {
          rig.manualTierOverride = true;
          rig.bhTier = t;
          if (t >= 1) await ensureFullCoreAssets();
          useTenetStore.getState().setQuality({ bhTier: t, ultraKerr: t === 3 });
          invalidate();
        },
        setCheatsEnabled: (enabled: boolean) => {
          rig.bhCheatsEnabled = enabled;
          invalidate();
        },
        setSimTime: (t: number | null) => {
          simOverrideRef.current = t;
          invalidate();
        },
        setCameraPose: (px, py, pz, tx = 0, ty = 0, tz = 0, fov = 42) => {
          rig.cameraOverride.active = true;
          rig.cameraOverride.px = px;
          rig.cameraOverride.py = py;
          rig.cameraOverride.pz = pz;
          rig.cameraOverride.tx = tx;
          rig.cameraOverride.ty = ty;
          rig.cameraOverride.tz = tz;
          rig.cameraOverride.fov = fov;
          camera.position.set(px, py, pz);
          camera.lookAt(tx, ty, tz);
          invalidate();
        },
        renderDeterministicFrames: (count = 8, dtSec = 1 / 60) => {
          const base = simOverrideRef.current ?? rig.elapsedTime;
          for (let i = 0; i < count; i++) {
            const t = base + i * dtSec;
            advance(t * 1000);
          }
        },
        getVramMb: () => (pipe.getEstimatedVramBytes() / (1024 * 1024)) + (rig.bhTier >= 2 ? 20 : 6),
        getInfo: () => ({
          tier: rig.bhTier,
          cheats: rig.bhCheatsEnabled,
          renderScale: rig.bhRenderScale,
          camMotion: rig.bhCamMotion,
          drawCalls: rig.drawCalls,
          triangles: rig.triangles,
          p95: rig.p95FrameMs,
        }),
      };
    }

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimer);
      rendererRef.current = null;
      gpuTimerRef.current?.dispose();
      gpuTimerRef.current = null;
      pipe.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  // Progressive lazy upgrade for high-res sky & Kerr LUT when tier rises
  useEffect(() => {
    const active = lowPower ? 0 : ultraKerr ? 3 : storeTier;
    rig.bhTier = active as BhTier;

    const assets = getBhAssets();
    if (!assets || assets.isBootstrap) return;

    const targetSky: 'mid' | 'high' | null =
      active >= 2 && loadedSkyRef.current !== 'high'
        ? 'high'
        : active === 1 && loadedSkyRef.current === 'low'
          ? 'mid'
          : null;

    if (targetSky) {
      loadedSkyRef.current = targetSky;
      void loadSkyTier(gl, targetSky).then((tex) => {
        const cur = getBhAssets();
        if (!cur) return;
        cur.skyCube = tex as typeof cur.skyCube;
        cur.skyTier = targetSky;
        setBhAssets(cur);
        invalidate();
      });
    }

    if (active === 3 && !assets.kerrLut && !kerrRequestedRef.current) {
      kerrRequestedRef.current = true;
      void loadKerrLut(gl).then((lut) => {
        const cur = getBhAssets();
        if (!cur) return;
        cur.kerrLut = lut;
        setBhAssets(cur);
        invalidate();
      });
    }
  }, [gl, invalidate, lowPower, storeTier, ultraKerr]);

  useFrame((_state, delta) => {
    const pipe = rendererRef.current;
    const assets = getBhAssets();
    if (!pipe || !assets) return;

    const dt = Math.min(delta, 1 / 30);
    const simTime = simOverrideRef.current !== null ? simOverrideRef.current : rig.elapsedTime;
    const spinSense = rig.forkMode < -0.05 ? -1 : 1;
    const heat = rig.forkMode > 0 ? rig.forkMode * rig.forkWarp : rig.forkMode * 0.5;
    const exposure = (mode === 'ritual' && rig.sealHold < 0.02 ? 0.45 : 1.0) * rig.bhExposureScale;
    const isIdleReduced = rig.activityLevel === 'still' && !rig.introActive && !rig.forkActive;

    gpuTimerRef.current?.beginFrame();
    pipe.render(gl, scene, camera, assets, {
      dt,
      simTime,
      tier: rig.bhTier as BhTier,
      cheatsEnabled: rig.bhCheatsEnabled,
      camMotion: rig.bhCamMotion,
      renderScale: rig.bhRenderScale,
      idleReducedRes: isIdleReduced,
      spinSense,
      hold: rig.sealHold,
      heat,
      exposureScale: exposure * Math.min(1, rig.introProgress * 1.35 + 0.05),
      spike: rig.recapSpike + rig.turnstilePulse * 0.35,
      viewportW: size.width,
      viewportH: size.height,
      dpr: gl.getPixelRatio(),
    });
    gpuTimerRef.current?.endFrame();
    if (gpuTimerRef.current && gpuTimerRef.current.latestMs > 0) {
      rig.gpuFrameMs = gpuTimerRef.current.latestMs;
    }
  }, 1);

  return null;
}
