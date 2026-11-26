import { glslBhConstantsHeader } from '@/stage/blackhole/constants';

export const bhParticlesSimFragmentShader = /* glsl */ `
precision highp float;

${glslBhConstantsHeader}

uniform sampler2D uStatePos; // (r, phi, z, ageFade)
uniform sampler2D uStateVel; // (vr, phiBase, seedRand, rInit)
uniform float uDt;
uniform float uSpinSense;
uniform float uKerrMode;
uniform float uTime;

in vec2 vUv;
layout(location = 0) out vec4 outPos;
layout(location = 1) out vec4 outVel;

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec4 pos = texelFetch(uStatePos, coord, 0);
  vec4 vel = texelFetch(uStateVel, coord, 0);

  float r = pos.x;
  float phiNorm = pos.y;
  float z = pos.z;
  float ageFade = pos.w;
  float seed = vel.z;
  float rInit = vel.w;

  float rIsco = uKerrMode > 0.5 ? BH_KERR_ISCO_R : BH_ISCO_R;
  float dt = min(uDt, 0.033333);

  if (r > rIsco) {
    // Stable Keplerian orbit with gentle viscous inward drift feeding ISCO plunge
    float geomOmega = uKerrMode > 0.5
      ? sqrt(BH_M) / (pow(r, 1.5) + BH_KERR_A * sqrt(BH_M))
      : sqrt(BH_M / (r * r * r));
    float omega = geomOmega * BH_SCREEN_TIME_SCALE * uSpinSense;
    phiNorm = fract(phiNorm + (omega * dt) / 6.28318530718);

    // Every 8th particle slowly drifts inward across ISCO to sustain continuous plunge stream
    float driftMask = step(0.84, seed);
    r -= (0.085 / max(1.0, r)) * driftMask * dt;
    // Vertical epicyclic oscillation
    z *= cos(omega * dt * 0.45);
    ageFade = min(1.0, ageFade + dt * 1.2);
  } else {
    // Relativistic plunge inside ISCO: accelerates inward then time-dilates/freezes as r -> rs
    float lapse = max(0.0, 1.0 - BH_RS / max(BH_RS + 0.002, r));
    float eIsco = 0.94280904; // 2*sqrt(2)/3
    float lIsco = 1.73205081 * BH_RS; // sqrt(3)*rs
    float drDtau = -max(0.045, pow(max(0.0, rIsco / max(r, BH_RS + 0.002) - 1.0), 1.5));
    float drDt = (lapse / eIsco) * drDtau * BH_SCREEN_TIME_SCALE * 0.42;
    float dphiDt = (lapse / eIsco) * (lIsco / max(1.0, r * r)) * BH_SCREEN_TIME_SCALE * uSpinSense;

    r = max(BH_RS + 0.003, r + drDt * dt);
    phiNorm = fract(phiNorm + (dphiDt * dt) / 6.28318530718);
    z *= (1.0 - clamp(dt * 1.4 * lapse, 0.0, 0.5));

    if (r < BH_RS + 0.22) {
      ageFade -= dt * 0.85;
    }

    // Recycle ONLY after fading out completely so particles never pop out
    if (ageFade <= 0.002) {
      r = mix(12.8, BH_DISK_R_TAPER, fract(seed * 13.37 + uTime * 0.07));
      phiNorm = fract(seed * 7.91 + uTime * 0.13);
      z = (fract(seed * 29.1) - 0.5) * r * 0.06;
      ageFade = 0.01;
      vel.x = 0.0;
    }
  }

  outPos = vec4(r, phiNorm, z, ageFade);
  outVel = vec4(vel.x, vel.y, seed, rInit);
}
`;
