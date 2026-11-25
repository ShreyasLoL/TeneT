import { gsap } from 'gsap';
import { rig } from '@/lib/store/rig';
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
  } = nodes;

  // Scale 4.0s choreography proportionally to --duration-hero (3500ms default -> 4.0s)
  const s = Math.max(0.32, (heroMs / 3500) * 4.0) / 4.0;
  const targetIstSec = readCurrentIstSeconds();
  const clockState = { sec: 0 };

  assemblyEl.style.willChange = 'transform, opacity';
  wordEl.style.willChange = 'transform, opacity';
  for (const sp of spans) sp.style.willChange = 'transform, opacity';
  if (hairlineEl) hairlineEl.style.willChange = 'transform, opacity';
  if (dialGroupEl) dialGroupEl.style.willChange = 'transform, opacity';

  rig.cameraOverride.active = true;
  rig.cameraOverride.px = 0;
  rig.cameraOverride.py = 0.82;
  rig.cameraOverride.pz = 4.15;
  rig.cameraOverride.tx = 0;
  rig.cameraOverride.ty = 0;
  rig.cameraOverride.tz = 0;
  rig.cameraOverride.fov = 48;

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

  const tl = gsap.timeline({ onComplete });

  // 1. 0.0-0.8s: Pure void -> 1px hairline sweeps + 60 radial ticks bloom from 12 o'clock
  if (hairlineEl) {
    tl.to(hairlineEl, { scaleX: 1, duration: 0.44 * s, ease: expoBezierEase }, 0);
    tl.to(hairlineEl, { rotation: 0, duration: 0.8 * s, ease: expoBezierEase }, 0.04 * s);
  }
  if (ticks.length > 0) {
    tl.to(
      ticks,
      { opacity: 0.92, duration: 0.24 * s, stagger: (0.58 * s) / 60, ease: expoBezierEase },
      0.08 * s,
    );
  }

  // 2. 0.8-2.0s: Ticks dissolve into spiraling Keplerian particles + time-lapse spin decelerates
  if (hairlineEl) {
    tl.to(hairlineEl, { opacity: 0, scaleX: 0.35, duration: 0.42 * s, ease: expoBezierEase }, 0.8 * s);
  }
  if (dialGroupEl) {
    tl.to(dialGroupEl, { opacity: 0, scale: 0.72, duration: 0.56 * s, ease: expoBezierEase }, 0.82 * s);
  }
  tl.to(rig, { introTick: 0, duration: 0.95 * s, ease: expoBezierEase }, 0.8 * s);
  tl.to(rig, { introProgress: 0.92, duration: 1.35 * s, ease: expoBezierEase }, 0.8 * s);
  tl.to(rig, { introSpin: 0, duration: 1.75 * s, ease: expoBezierEase }, 0.8 * s);
  tl.to(rig.cameraOverride, { py: 0.96, pz: 4.55, duration: 1.2 * s, ease: expoBezierEase }, 0.8 * s);

  // 3. 2.0-3.2s: TENET letter reveal + timer ring fill + HH:MM:SS IST count-up + NIGHT BEGINS
  spans.forEach((sp, idx) => {
    tl.to(
      sp,
      { y: 0, scale: 1, opacity: 1, duration: 0.54 * s, ease: expoBezierEase },
      (2.0 + idx * 0.068) * s,
    );
  });
  if (timerRingEl) {
    tl.to(timerRingEl, { opacity: 0.85, duration: 0.22 * s, ease: expoBezierEase }, 2.0 * s);
    tl.to(timerRingEl, { strokeDashoffset: 0, duration: 1.02 * s, ease: expoBezierEase }, 2.02 * s);
  }
  if (clockEl) {
    tl.to(clockEl, { y: 0, opacity: 1, duration: 0.32 * s, ease: expoBezierEase }, 2.04 * s);
    tl.to(
      clockState,
      {
        sec: targetIstSec,
        duration: 0.92 * s,
        ease: expoBezierEase,
        onUpdate: () => {
          clockEl.textContent = formatSecondsHms(clockState.sec);
        },
      },
      2.04 * s,
    );
  }
  if (nightEl) {
    tl.to(nightEl, { y: 0, opacity: 1, duration: 0.44 * s, ease: expoBezierEase }, 2.62 * s);
  }

  // 4. 3.2-4.0s: Wordmark scales/fades into the hole + camera pulls back to resting view
  tl.to(rig, { introProgress: 1, duration: 0.8 * s, ease: expoBezierEase }, 3.2 * s);
  tl.to(assemblyEl, { scale: 0.72, opacity: 0, duration: 0.56 * s, ease: expoBezierEase }, 3.2 * s);
  tl.to(
    rig.cameraOverride,
    { py: 1.18, pz: 5.45, fov: 46, duration: 0.8 * s, ease: expoBezierEase },
    3.2 * s,
  );

  return tl;
}
