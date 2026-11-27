import { gsap } from 'gsap';
import { rig } from '@/lib/store/rig';
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_FOV_DEG,
  CAMERA_INCLINATION_RAD,
  CAMERA_ROLL_RAD,
} from './blackhole/constants';
import { expoBezierEase } from './expoBezier';
import { formatSecondsHms, readCurrentIstSeconds, TIMER_RING_CIRC } from './IntroDial';

export type IntroDomNodes = {
  assemblyEl: HTMLDivElement;
  wordEl: HTMLDivElement;
  spans: HTMLSpanElement[];
  hairlineEl: HTMLDivElement | null;
  dialGroupEl: SVGGElement | null;
  ticks: SVGLineElement[];
  timerRingEl: SVGCircleElement | null;
  clockEl: HTMLSpanElement | null;
  nightEl: HTMLSpanElement | null;
  statusEl: HTMLSpanElement | null;
};

export function buildIntroTimeline(
  nodes: IntroDomNodes,
  heroMs: number,
  onComplete: () => void,
): ReturnType<typeof gsap.timeline> {
  const {
    assemblyEl,
    wordEl,
    spans,
    hairlineEl,
    dialGroupEl,
    ticks,
    timerRingEl,
    clockEl,
    nightEl,
    statusEl,
  } = nodes;

  // Fluid 7.4s Cold-Start Singularity arc scaled proportionally to --duration-hero
  const s = Math.max(0.32, (heroMs / 3500) * 7.4) / 7.4;
  const targetIstSec = readCurrentIstSeconds();
  const clockState = { sec: 0 };

  assemblyEl.style.willChange = 'transform, opacity';
  wordEl.style.willChange = 'transform, opacity';
  for (const sp of spans) sp.style.willChange = 'transform, opacity';
  if (hairlineEl) hairlineEl.style.willChange = 'transform, opacity';
  if (dialGroupEl) dialGroupEl.style.willChange = 'transform, opacity';
  if (statusEl) statusEl.style.willChange = 'transform, opacity';

  rig.introSky = 0;
  rig.introShadow = 0;
  rig.introLens = 0;
  rig.introDisk = 0;
  rig.introDiskSweep = 0;
  rig.introRing = 0;
  rig.introTremor = 0;
  rig.introProgress = 0;
  rig.introSpin = -7.0;
  rig.introTick = 1;

  rig.cameraOverride.active = true;
  rig.cameraOverride.px = 0;
  rig.cameraOverride.py = 0;
  rig.cameraOverride.pz = 7.8;
  rig.cameraOverride.tx = 0;
  rig.cameraOverride.ty = 0;
  rig.cameraOverride.tz = 0;
  rig.cameraOverride.fov = 44;

  rig.bhCam.distance = 44.0;
  rig.bhCam.fov = 32.0;
  rig.bhCam.inclination = CAMERA_INCLINATION_RAD + 0.07;
  rig.bhCam.azimuth = -0.14;
  rig.bhCam.roll = CAMERA_ROLL_RAD - 0.10;

  gsap.set(assemblyEl, { scale: 1, opacity: 1 });
  gsap.set(wordEl, { scale: 1, opacity: 1 });
  gsap.set(spans, { y: 14, scale: 0.95, opacity: 0 });
  if (hairlineEl) gsap.set(hairlineEl, { scaleX: 0, rotation: -35, opacity: 0.9 });
  if (dialGroupEl) gsap.set(dialGroupEl, { scale: 1, opacity: 1, transformOrigin: '50% 50%' });
  if (ticks.length > 0) gsap.set(ticks, { opacity: 0 });
  if (timerRingEl) gsap.set(timerRingEl, { opacity: 0, strokeDashoffset: TIMER_RING_CIRC });
  if (clockEl) {
    clockEl.textContent = '00:00:00 IST';
    gsap.set(clockEl, { y: 6, opacity: 0 });
  }
  if (nightEl) gsap.set(nightEl, { y: 6, opacity: 0 });
  if (statusEl) {
    statusEl.textContent = '';
    gsap.set(statusEl, { y: 4, opacity: 0 });
  }

  const tl = gsap.timeline({ onComplete });

  const setStatusCue = (label: string, at: number) => {
    if (!statusEl) return;
    tl.to(statusEl, { opacity: 0, y: -2, duration: 0.14 * s, ease: expoBezierEase }, Math.max(0, at - 0.14 * s));
    tl.call(
      () => {
        statusEl.textContent = label;
      },
      [],
      at,
    );
    tl.fromTo(
      statusEl,
      { y: 4, opacity: 0 },
      { y: 0, opacity: 0.82, duration: 0.28 * s, ease: expoBezierEase },
      at,
    );
  };

  // Act I (0.00-1.05s): Minimal pure void -> sweeping hairline + symmetrical palindrome radial ticks
  if (hairlineEl) {
    tl.to(hairlineEl, { scaleX: 1, duration: 0.44 * s, ease: expoBezierEase }, 0);
    tl.to(hairlineEl, { rotation: 0, duration: 0.82 * s, ease: expoBezierEase }, 0.04 * s);
  }
  if (ticks.length > 0) {
    for (let k = 0; k <= 15; k++) {
      const pair = [k, (60 - k) % 60, 30 - k, 30 + k];
      const targets: SVGLineElement[] = [];
      for (const idx of pair) {
        const el = ticks[idx];
        if (el && !targets.includes(el)) targets.push(el);
      }
      if (targets.length > 0) {
        tl.to(
          targets,
          { opacity: 0.96, duration: 0.22 * s, ease: expoBezierEase },
          (0.06 + (k * 0.58) / 16) * s,
        );
      }
    }
  }

  // Act II (0.95-2.70s): Invisible singularity in negative space, detected ONLY by high lensing + bright open-iris sky
  if (hairlineEl) {
    tl.to(hairlineEl, { opacity: 0, scaleX: 0.35, duration: 0.45 * s, ease: expoBezierEase }, 0.95 * s);
  }
  if (dialGroupEl) {
    tl.to(dialGroupEl, { opacity: 0, scale: 0.72, duration: 0.56 * s, ease: expoBezierEase }, 0.96 * s);
  }
  tl.to(rig, { introTick: 0, duration: 0.90 * s, ease: expoBezierEase }, 0.95 * s);

  setStatusCue('LENSING // ANOMALY', 1.05 * s);
  tl.to(rig, { introSky: 2.8, duration: 1.25 * s, ease: expoBezierEase }, 1.00 * s);
  tl.to(rig, { introShadow: 1.0, duration: 0.95 * s, ease: expoBezierEase }, 1.00 * s);
  tl.to(rig, { introLens: 1.22, duration: 1.65 * s, ease: expoBezierEase }, 1.00 * s);
  tl.to(
    rig.bhCam,
    {
      distance: 30.0,
      azimuth: -0.025,
      roll: CAMERA_ROLL_RAD - 0.06,
      duration: 1.65 * s,
      ease: 'power2.inOut',
    },
    1.00 * s,
  );
  tl.to(rig.cameraOverride, { pz: 7.0, duration: 1.65 * s, ease: 'power2.inOut' }, 1.00 * s);

  // Act III (2.65-3.45s): Starter crank tremor + ember wrap around ISCO + first outer star pull
  setStatusCue('SINGULARITY // ACTIVE', 2.65 * s);
  tl.to(rig, { introTremor: 0.52, duration: 0.18 * s, ease: 'power2.out' }, 2.65 * s);
  tl.to(rig, { introTremor: 0.16, duration: 0.48 * s, ease: 'power2.out' }, 2.83 * s);
  tl.to(rig, { introDiskSweep: 0.42, duration: 0.38 * s, ease: 'power2.out' }, 2.66 * s);
  tl.to(rig, { introDiskSweep: 0.34, duration: 0.32 * s, ease: 'power2.inOut' }, 3.04 * s);
  tl.to(rig, { introDisk: 0.24, duration: 0.26 * s, ease: 'power2.out' }, 2.68 * s);
  tl.to(rig, { introDisk: 0.10, duration: 0.38 * s, ease: 'power2.inOut' }, 2.94 * s);
  tl.to(rig, { introRing: 0.36, duration: 0.22 * s, ease: 'power2.out' }, 2.70 * s);
  tl.to(rig, { introRing: 0.14, duration: 0.40 * s, ease: 'power2.inOut' }, 2.92 * s);
  tl.to(rig, { introProgress: 0.16, duration: 0.65 * s, ease: expoBezierEase }, 2.68 * s);
  tl.to(rig, { introSpin: -6.2, duration: 0.65 * s, ease: 'power1.inOut' }, 2.68 * s);

  // Act IV (3.40-5.55s): Full 360 wrap + radial ignition roar, sky iris dim, inward pull & revolution
  setStatusCue('ACCRETION // IGNITION', 3.40 * s);
  tl.to(rig, { introTremor: 1.0, duration: 0.16 * s, ease: 'power3.out' }, 3.40 * s);
  tl.to(rig, { introTremor: 0, duration: 0.95 * s, ease: 'power2.out' }, 3.56 * s);
  tl.to(rig, { introDiskSweep: 1.0, duration: 1.35 * s, ease: expoBezierEase }, 3.40 * s);
  tl.to(rig, { introDisk: 1.32, duration: 0.58 * s, ease: 'power3.out' }, 3.40 * s);
  tl.to(rig, { introDisk: 1.0, duration: 1.15 * s, ease: expoBezierEase }, 3.98 * s);
  tl.to(rig, { introRing: 1.38, duration: 0.52 * s, ease: 'power3.out' }, 3.42 * s);
  tl.to(rig, { introRing: 1.0, duration: 1.10 * s, ease: expoBezierEase }, 3.94 * s);
  tl.to(rig, { introLens: 1.0, duration: 1.10 * s, ease: expoBezierEase }, 3.45 * s);
  tl.to(rig, { introSky: 0.72, duration: 0.72 * s, ease: 'power2.out' }, 3.42 * s);
  tl.to(rig, { introSky: 1.0, duration: 1.45 * s, ease: expoBezierEase }, 4.30 * s);
  tl.to(rig, { introProgress: 0.94, duration: 1.70 * s, ease: expoBezierEase }, 3.40 * s);
  tl.to(rig, { introSpin: 0, duration: 2.15 * s, ease: expoBezierEase }, 3.40 * s);
  tl.to(
    rig.bhCam,
    {
      distance: 40.8,
      fov: 34.0,
      inclination: CAMERA_INCLINATION_RAD + 0.012,
      azimuth: -0.005,
      roll: CAMERA_ROLL_RAD - 0.015,
      duration: 1.85 * s,
      ease: expoBezierEase,
    },
    3.45 * s,
  );
  tl.to(rig.cameraOverride, { pz: 9.6, duration: 1.85 * s, ease: expoBezierEase }, 3.45 * s);

  // Act V (4.75-7.50s): TENET wordmark + timer ring + IST clock + Horizon Active -> seamless settle
  setStatusCue('HORIZON // ACTIVE', 4.75 * s);
  spans.forEach((sp, idx) => {
    tl.to(
      sp,
      { y: 0, scale: 1, opacity: 1, duration: 0.56 * s, ease: expoBezierEase },
      (4.75 + idx * 0.068) * s,
    );
  });
  if (timerRingEl) {
    tl.to(timerRingEl, { opacity: 0.85, duration: 0.22 * s, ease: expoBezierEase }, 4.75 * s);
    tl.to(timerRingEl, { strokeDashoffset: 0, duration: 1.08 * s, ease: expoBezierEase }, 4.77 * s);
  }
  if (clockEl) {
    tl.to(clockEl, { y: 0, opacity: 1, duration: 0.34 * s, ease: expoBezierEase }, 4.78 * s);
    tl.to(
      clockState,
      {
        sec: targetIstSec,
        duration: 0.96 * s,
        ease: expoBezierEase,
        onUpdate: () => {
          clockEl.textContent = formatSecondsHms(clockState.sec);
        },
      },
      4.78 * s,
    );
  }
  if (nightEl) {
    tl.to(nightEl, { y: 0, opacity: 1, duration: 0.44 * s, ease: expoBezierEase }, 5.35 * s);
  }

  tl.to(rig, { introProgress: 1.0, duration: 0.95 * s, ease: expoBezierEase }, 6.15 * s);
  tl.to(assemblyEl, { scale: 0.72, opacity: 0, duration: 0.65 * s, ease: expoBezierEase }, 6.15 * s);
  if (statusEl) {
    tl.to(statusEl, { opacity: 0, y: -2, duration: 0.45 * s, ease: expoBezierEase }, 6.15 * s);
  }
  tl.to(
    rig.cameraOverride,
    { py: 0, pz: 10.6, fov: 45, duration: 1.00 * s, ease: expoBezierEase },
    6.15 * s,
  );
  tl.to(
    rig.bhCam,
    {
      distance: CAMERA_DISTANCE_DEFAULT,
      fov: CAMERA_FOV_DEG,
      inclination: CAMERA_INCLINATION_RAD,
      azimuth: 0,
      roll: CAMERA_ROLL_RAD,
      duration: 1.00 * s,
      ease: expoBezierEase,
    },
    6.15 * s,
  );
  tl.to({}, { duration: 0.30 * s }, 7.20 * s);

  return tl;
}
