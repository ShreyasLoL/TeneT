import {
  BH_CAMERA_INCLINATION_EDGE_RAD,
  BH_CAMERA_INCLINATION_REST_RAD,
  BH_CAMERA_REST_R,
  BH_CAMERA_START_R,
  BH_CAMERA_ZOOM_MIN_R,
} from './constants';

export type CameraSplineKnot = {
  s: number;
  logR: number;
  theta: number;
  phi: number;
  fov: number;
};

const DEG = Math.PI / 180;

export const INTRO_CAMERA_KNOTS: ReadonlyArray<CameraSplineKnot> = [
  { s: 0.0, logR: Math.log(BH_CAMERA_START_R), theta: 67.5 * DEG, phi: -0.26, fov: 49.0 },
  { s: 0.18, logR: Math.log(45.0), theta: 70.5 * DEG, phi: -0.18, fov: 47.0 },
  { s: 0.42, logR: Math.log(31.0), theta: 75.0 * DEG, phi: -0.04, fov: 45.0 },
  { s: 0.68, logR: Math.log(BH_CAMERA_ZOOM_MIN_R), theta: 80.0 * DEG, phi: 0.18, fov: 42.5 },
  { s: 0.86, logR: Math.log(19.5), theta: BH_CAMERA_INCLINATION_EDGE_RAD, phi: 0.36, fov: 41.0 },
  { s: 1.0, logR: Math.log(BH_CAMERA_REST_R), theta: BH_CAMERA_INCLINATION_REST_RAD, phi: 0.0, fov: 42.0 },
];

function catmullSlope(
  kPrev: CameraSplineKnot,
  kCur: CameraSplineKnot,
  kNext: CameraSplineKnot,
  field: 'logR' | 'theta' | 'phi' | 'fov',
): number {
  const dt = Math.max(1e-5, kNext.s - kPrev.s);
  return (kNext[field] - kPrev[field]) / dt;
}

function evalHermite1D(
  p0: number,
  m0: number,
  p1: number,
  m1: number,
  ds: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * ds * m0 + h01 * p1 + h11 * ds * m1;
}

export type CameraSplineSample = {
  x: number;
  y: number;
  z: number;
  fov: number;
  r: number;
  theta: number;
  phi: number;
};

/**
 * Evaluates C1-continuous 5-phase intro camera spline into `out` (zero allocation).
 */
export function evalIntroCameraSpline(progress: number, out: CameraSplineSample): CameraSplineSample {
  const s = Math.max(0, Math.min(1, progress));
  const knots = INTRO_CAMERA_KNOTS;
  let seg = knots.length - 2;
  for (let i = 0; i < knots.length - 1; i++) {
    if (s <= knots[i + 1].s) {
      seg = i;
      break;
    }
  }

  const k0 = knots[seg];
  const k1 = knots[seg + 1];
  const kPrev = knots[Math.max(0, seg - 1)];
  const kNext = knots[Math.min(knots.length - 1, seg + 2)];
  const ds = Math.max(1e-5, k1.s - k0.s);
  const t = (s - k0.s) / ds;

  const slope0 = (f: 'logR' | 'theta' | 'phi' | 'fov') =>
    seg === 0 ? (k1[f] - k0[f]) / ds : catmullSlope(kPrev, k0, k1, f);
  const slope1 = (f: 'logR' | 'theta' | 'phi' | 'fov') =>
    seg === knots.length - 2 ? (k1[f] - k0[f]) / ds : catmullSlope(k0, k1, kNext, f);

  const logR = evalHermite1D(k0.logR, slope0('logR'), k1.logR, slope1('logR'), ds, t);
  const theta = evalHermite1D(k0.theta, slope0('theta'), k1.theta, slope1('theta'), ds, t);
  const phi = evalHermite1D(k0.phi, slope0('phi'), k1.phi, slope1('phi'), ds, t);
  const fov = evalHermite1D(k0.fov, slope0('fov'), k1.fov, slope1('fov'), ds, t);

  const r = Math.exp(logR);
  const sinT = Math.sin(theta);
  out.r = r;
  out.theta = theta;
  out.phi = phi;
  out.fov = fov;
  out.x = r * sinT * Math.sin(phi);
  out.y = r * Math.cos(theta);
  out.z = r * sinT * Math.cos(phi);
  return out;
}

export function sphericalPoseToCartesian(
  r: number,
  inclinationFromPoleRad: number,
  azimuthRad: number = 0,
): [number, number, number] {
  const sinT = Math.sin(inclinationFromPoleRad);
  return [
    r * sinT * Math.sin(azimuthRad),
    r * Math.cos(inclinationFromPoleRad),
    r * sinT * Math.cos(azimuthRad),
  ];
}
