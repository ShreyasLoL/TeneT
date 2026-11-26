'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { getBhAssets, setBhAssets } from '@/stage/blackhole/assetStore';
import { BhPipelineRenderer, type BhTier } from '@/stage/blackhole/bhRenderer';
import { createBootstrapAssets } from '@/stage/blackhole/bootstrapAssets';
import { detectGpuCaps } from '@/stage/blackhole/gpuCaps';
import { loadCoreBhAssets, loadKerrLut, loadSkyTier } from '@/stage/blackhole/lutLoader';

declare global {
  interface Window {
    __TENET_BH__?: {
      getTier: () => BhTier;
      setTier: (tier: BhTier) => void;
      setCheatsEnabled: (enabled: boolean) => void;
      setSimTime: (t: number | null) => void;
      setCameraPose: (px: number, py: number, pz: number, tx?: number, ty?: number, tz?: number, fov?: number) => void;
      getVramMb: () => number;
      getInfo: () => Record<string, unknown>;
    };
  }
}

export function Postfx() {
  const { gl, scene, camera, size, invalidate } = useThree();
  const mode = useTenetStore((s) => s.mode);
  const storeTier = useTenetStore((s) => s.quality.bhTier);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const ultraKerr = useTenetStore((s) => s.quality.ultraKerr);

  const rendererRef = useRef<BhPipelineRenderer | null>(null);
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
    void pipe.compileAsync(gl);

    let cancelled = false;
    void loadCoreBhAssets(gl)
      .then((core) => {
        if (cancelled) return;
        loadedSkyRef.current = 'low';
        setBhAssets(core);
        invalidate();
      })
      .catch(() => {
        // Keep bootstrap assets alive if offline/fetch fails
      });

    if (typeof window !== 'undefined') {
      window.__TENET_BH__ = {
        getTier: () => rig.bhTier,
        setTier: (t: BhTier) => {
          rig.bhTier = t;
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
        getVramMb: () => (pipe.getEstimatedVramBytes() / (1024 * 1024)) + 12,
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
      rendererRef.current = null;
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
  }, 1);

  return null;
}
