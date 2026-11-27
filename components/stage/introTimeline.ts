import { gsap } from 'gsap';
import { rig } from '@/lib/store/rig';
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_FOV_DEG,
  CAMERA_INCLINATION_RAD,
  CAMERA_ROLL_RAD,
} from './blackhole/constants';
import { expoBezierEase } from './expoBezier';
import { formatSecondsHms, readCurrentIstSeconds } from './IntroDial';

export type IntroDomNodes = {
  assemblyEl: HTMLDivElement;
  wordEl: HTMLDivElement;
  spans: HTMLSpanElement[];
  hairlineEl: HTMLDivElement | null;
  dialGroupEl: SVGGElement | null;
  ticks: SVGLineElement[];
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
    clockEl,
    nightEl,
    statusEl,
  } = nodes;

  // Fluid ~7.1s timeline: minimal symmetrical palindrome dial in Act I, unobstructed singularity Acts II-V
  const s = Math.max(0.32, (heroMs / 3500) * 7.1) / 7.1;
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
  spans.forEach((sp, idx) => {
    const offset = idx === 0 ? -18 : idx === 1 ? -10 : idx === 3 ? 10 : idx === 4 ? 18 : 0;
    gsap.set(sp, {
      x: offset,
      y: idx === 2 ? 4 : 0,
      scale: 0.94,
      rotation: idx >= 3 ? 180 : 0,
      transformOrigin: '50% 45%',
      opacity: 0,
    });
  });
  if (hairlineEl) gsap.set(hairlineEl, { scaleX: 0, rotation: -35, opacity: 0.88 });
  if (dialGroupEl) gsap.set(dialGroupEl, { scale: 1, opacity: 1, transformOrigin: '50% 50%' });
  if (ticks.length > 0) gsap.set(ticks, { opacity: 0 });
  if (clockEl) {
    clockEl.textContent = '00:00:00 IST';
    gsap.set(clockEl, { y: 5, opacity: 0 });
  }
  if (nightEl) gsap.set(nightEl, { y: 5, opacity: 0 });
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

  // Act I (0.00-2.45s): Minimal symmetrical dial + palindrome T E N E_inv T_inv + IST time + night begins
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

  // Symmetrical palindrome unfold from center 'N' outward
  if (spans[2]) {
    tl.to(spans[2], { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.50 * s, ease: expoBezierEase }, 0.42 * s);
  }
  const innerPair = [spans[1], spans[3]].filter((el): el is HTMLSpanElement => Boolean(el));
  if (innerPair.length > 0) {
    tl.to(innerPair, { x: 0, scale: 1, opacity: 1, duration: 0.52 * s, ease: expoBezierEase }, 0.56 * s);
  }
  const outerPair = [spans[0], spans[4]].filter((el): el is HTMLSpanElement => Boolean(el));
  if (outerPair.length > 0) {
    tl.to(outerPair, { x: 0, scale: 1, opacity: 1, duration: 0.54 * s, ease: expoBezierEase }, 0.70 * s);
  }

  if (clockEl) {
    tl.to(clockEl, { y: 0, opacity: 1, duration: 0.36 * s, ease: expoBezierEase }, 0.48 * s);
    tl.to(
      clockState,
      {
        sec: targetIstSec,
        duration: 1.02 * s,
        ease: expoBezierEase,
        onUpdate: () => {
          clockEl.textContent = formatSecondsHms(clockState.sec);
        },
      },
      0.48 * s,
    );
  }
  if (nightEl) {
    tl.to(nightEl, { y: 0, opacity: 1, duration: 0.44 * s, ease: expoBezierEase }, 1.12 * s);
  }

  // Entire dial + palindrome signature closes gracefully back into the dark void before cosmos opens
  tl.to(assemblyEl, { scale: 0.86, opacity: 0, duration: 0.55 * s, ease: expoBezierEase }, 1.90 * s);
  tl.to(rig, { introTick: 0, duration: 0.75 * s, ease: expoBezierEase }, 1.95 * s);

  // Act II (2.20-3.95s): Unobstructed negative-space lensing anomaly + bright open-iris sky
  setStatusCue('LENSING // ANOMALY', 2.25 * s);
  tl.to(rig, { introSky: 2.8, duration: 1.25 * s, ease: expoBezierEase }, 2.20 * s);
  tl.to(rig, { introShadow: 1.0, duration: 0.95 * s, ease: expoBezierEase }, 2.20 * s);
  tl.to(rig, { introLens: 1.22, duration: 1.65 * s, ease: expoBezierEase }, 2.20 * s);
  tl.to(
    rig.bhCam,
    {
      distance: 30.0,
      azimuth: -0.025,
      roll: CAMERA_ROLL_RAD - 0.06,
      duration: 1.65 * s,
      ease: 'power2.inOut',
    },
    2.20 * s,
  );
  tl.to(rig.cameraOverride, { pz: 7.0, duration: 1.65 * s, ease: 'power2.inOut' }, 2.20 * s);

  // Act III (3.90-4.68s): Starter crank tremor + ember wrap around ISCO + first outer star pull
  setStatusCue('SINGULARITY // ACTIVE', 3.90 * s);
  tl.to(rig, { introTremor: 0.52, duration: 0.18 * s, ease: 'power2.out' }, 3.90 * s);
  tl.to(rig, { introTremor: 0.16, duration: 0.48 * s, ease: 'power2.out' }, 4.08 * s);
  tl.to(rig, { introDiskSweep: 0.42, duration: 0.38 * s, ease: 'power2.out' }, 3.92 * s);
  tl.to(rig, { introDiskSweep: 0.34, duration: 0.32 * s, ease: 'power2.inOut' }, 4.30 * s);
  tl.to(rig, { introDisk: 0.24, duration: 0.26 * s, ease: 'power2.out' }, 3.94 * s);
  tl.to(rig, { introDisk: 0.10, duration: 0.38 * s, ease: 'power2.inOut' }, 4.20 * s);
  tl.to(rig, { introRing: 0.36, duration: 0.22 * s, ease: 'power2.out' }, 3.96 * s);
  tl.to(rig, { introRing: 0.14, duration: 0.40 * s, ease: 'power2.inOut' }, 4.18 * s);
  tl.to(rig, { introProgress: 0.16, duration: 0.65 * s, ease: expoBezierEase }, 3.94 * s);
  tl.to(rig, { introSpin: -6.2, duration: 0.65 * s, ease: 'power1.inOut' }, 3.94 * s);

  // Act IV (4.62-6.80s): Full unobstructed ignition roar, sky iris dim, inward pull & revolution
  setStatusCue('ACCRETION // IGNITION', 4.62 * s);
  tl.to(rig, { introTremor: 1.0, duration: 0.16 * s, ease: 'power3.out' }, 4.62 * s);
  tl.to(rig, { introTremor: 0, duration: 0.95 * s, ease: 'power2.out' }, 4.78 * s);
  tl.to(rig, { introDiskSweep: 1.0, duration: 1.35 * s, ease: expoBezierEase }, 4.62 * s);
  tl.to(rig, { introDisk: 1.32, duration: 0.58 * s, ease: 'power3.out' }, 4.62 * s);
  tl.to(rig, { introDisk: 1.0, duration: 1.15 * s, ease: expoBezierEase }, 5.20 * s);
  tl.to(rig, { introRing: 1.38, duration: 0.52 * s, ease: 'power3.out' }, 4.64 * s);
  tl.to(rig, { introRing: 1.0, duration: 1.10 * s, ease: expoBezierEase }, 5.16 * s);
  tl.to(rig, { introLens: 1.0, duration: 1.10 * s, ease: expoBezierEase }, 4.68 * s);
  tl.to(rig, { introSky: 0.72, duration: 0.72 * s, ease: 'power2.out' }, 4.64 * s);
  tl.to(rig, { introSky: 1.0, duration: 1.45 * s, ease: expoBezierEase }, 5.52 * s);
  tl.to(rig, { introProgress: 1.0, duration: 1.75 * s, ease: expoBezierEase }, 4.62 * s);
  tl.to(rig, { introSpin: 0, duration: 2.10 * s, ease: expoBezierEase }, 4.62 * s);

  setStatusCue('HORIZON // ACTIVE', 5.85 * s);
  tl.to(
    rig.bhCam,
    {
      distance: CAMERA_DISTANCE_DEFAULT,
      fov: CAMERA_FOV_DEG,
      inclination: CAMERA_INCLINATION_RAD,
      azimuth: 0,
      roll: CAMERA_ROLL_RAD,
      duration: 2.00 * s,
      ease: expoBezierEase,
    },
    4.68 * s,
  );
  tl.to(
    rig.cameraOverride,
    { py: 0, pz: 10.6, fov: 45, duration: 2.00 * s, ease: expoBezierEase },
    4.68 * s,
  );

  // Clean fade of status cue & calm breath before UI materializes
  if (statusEl) {
    tl.to(statusEl, { opacity: 0, y: -2, duration: 0.42 * s, ease: expoBezierEase }, 6.55 * s);
  }
  tl.to({}, { duration: 0.30 * s }, 6.80 * s);

  return tl;
}
