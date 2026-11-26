import { gsap } from 'gsap';
import { rig } from '@/lib/store/rig';
import {
  CAMERA_DISTANCE_DEFAULT,
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

  // Fluid 5.2s continuous activation scaled proportionally to --duration-hero
  const s = Math.max(0.32, (heroMs / 3500) * 5.2) / 5.2;
  const targetIstSec = readCurrentIstSeconds();
  const clockState = { sec: 0 };

  assemblyEl.style.willChange = 'transform, opacity';
  wordEl.style.willChange = 'transform, opacity';
  for (const sp of spans) sp.style.willChange = 'transform, opacity';
  if (hairlineEl) hairlineEl.style.willChange = 'transform, opacity';
  if (dialGroupEl) dialGroupEl.style.willChange = 'transform, opacity';
  if (statusEl) statusEl.style.willChange = 'transform, opacity';

  rig.introSky = 0;
  rig.introLens = 0;
  rig.introDisk = 0;
  rig.introRing = 0;
  rig.introProgress = 0;
  rig.introSpin = 4.8;
  rig.introTick = 1;

  rig.cameraOverride.active = true;
  rig.cameraOverride.px = 0;
  rig.cameraOverride.py = 0;
  rig.cameraOverride.pz = 7.4;
  rig.cameraOverride.tx = 0;
  rig.cameraOverride.ty = 0;
  rig.cameraOverride.tz = 0;
  rig.cameraOverride.fov = 47;

  rig.bhCam.distance = 34.5;
  rig.bhCam.inclination = CAMERA_INCLINATION_RAD + 0.04;
  rig.bhCam.azimuth = -0.025;
  rig.bhCam.roll = CAMERA_ROLL_RAD - 0.075;

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

  // Beat 1 (0.0-0.85s): Pure void -> sweeping hairline + symmetrical palindrome radial ticks
  if (hairlineEl) {
    tl.to(hairlineEl, { scaleX: 1, duration: 0.44 * s, ease: expoBezierEase }, 0);
    tl.to(hairlineEl, { rotation: 0, duration: 0.8 * s, ease: expoBezierEase }, 0.04 * s);
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

  // Beat 2-3 (0.75-3.95s): Overlapping continuous physical activation
  setStatusCue('STARFIELD // ONLINE', 0.75 * s);
  tl.to(rig, { introSky: 1, duration: 1.45 * s, ease: expoBezierEase }, 0.75 * s);
  if (hairlineEl) {
    tl.to(hairlineEl, { opacity: 0, scaleX: 0.35, duration: 0.45 * s, ease: expoBezierEase }, 0.8 * s);
  }
  if (dialGroupEl) {
    tl.to(dialGroupEl, { opacity: 0, scale: 0.72, duration: 0.58 * s, ease: expoBezierEase }, 0.82 * s);
  }
  tl.to(rig, { introTick: 0, duration: 1.05 * s, ease: expoBezierEase }, 0.8 * s);

  setStatusCue('GRAVITY // BENDING', 1.25 * s);
  tl.to(rig, { introLens: 1, duration: 1.95 * s, ease: expoBezierEase }, 1.25 * s);
  tl.to(rig, { introProgress: 0.88, duration: 1.85 * s, ease: expoBezierEase }, 1.25 * s);
  tl.to(rig, { introSpin: 0, duration: 2.15 * s, ease: expoBezierEase }, 1.25 * s);
  tl.to(rig.cameraOverride, { py: 0, pz: 8.8, duration: 1.75 * s, ease: expoBezierEase }, 1.25 * s);
  tl.to(
    rig.bhCam,
    {
      distance: 40.6,
      inclination: CAMERA_INCLINATION_RAD + 0.01,
      azimuth: -0.006,
      roll: CAMERA_ROLL_RAD - 0.015,
      duration: 1.95 * s,
      ease: expoBezierEase,
    },
    1.25 * s,
  );

  setStatusCue('ACCRETION // ACTIVE', 1.85 * s);
  tl.set(rig, { introDisk: 0.02 }, 1.8 * s);
  tl.to(rig, { introDisk: 1, duration: 1.85 * s, ease: expoBezierEase }, 1.85 * s);

  setStatusCue('HORIZON // STABLE', 2.65 * s);
  tl.to(rig, { introRing: 1, duration: 1.15 * s, ease: expoBezierEase }, 2.65 * s);

  spans.forEach((sp, idx) => {
    tl.to(
      sp,
      { y: 0, scale: 1, opacity: 1, duration: 0.56 * s, ease: expoBezierEase },
      (2.65 + idx * 0.068) * s,
    );
  });
  if (timerRingEl) {
    tl.to(timerRingEl, { opacity: 0.85, duration: 0.22 * s, ease: expoBezierEase }, 2.65 * s);
    tl.to(timerRingEl, { strokeDashoffset: 0, duration: 1.08 * s, ease: expoBezierEase }, 2.67 * s);
  }
  if (clockEl) {
    tl.to(clockEl, { y: 0, opacity: 1, duration: 0.34 * s, ease: expoBezierEase }, 2.68 * s);
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
      2.68 * s,
    );
  }
  if (nightEl) {
    tl.to(nightEl, { y: 0, opacity: 1, duration: 0.44 * s, ease: expoBezierEase }, 3.25 * s);
  }

  // Beat 4 (3.95-5.20s): Wordmark pulls into the horizon + brief pause -> live simulation continues
  tl.to(rig, { introProgress: 1, duration: 0.9 * s, ease: expoBezierEase }, 3.95 * s);
  tl.to(assemblyEl, { scale: 0.72, opacity: 0, duration: 0.62 * s, ease: expoBezierEase }, 3.95 * s);
  if (statusEl) {
    tl.to(statusEl, { opacity: 0, y: -2, duration: 0.42 * s, ease: expoBezierEase }, 3.95 * s);
  }
  tl.to(
    rig.cameraOverride,
    { py: 0, pz: 10.6, fov: 45, duration: 0.95 * s, ease: expoBezierEase },
    3.95 * s,
  );
  tl.to(
    rig.bhCam,
    {
      distance: CAMERA_DISTANCE_DEFAULT,
      inclination: CAMERA_INCLINATION_RAD,
      azimuth: 0,
      roll: CAMERA_ROLL_RAD,
      duration: 0.95 * s,
      ease: expoBezierEase,
    },
    3.95 * s,
  );
  tl.to({}, { duration: 0.25 * s }, 4.95 * s);

  return tl;
}
