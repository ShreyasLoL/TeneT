import { glslBhConstantsHeader } from '@/stage/blackhole/constants';

export const bhDiskCacheFragmentShader = /* glsl */ `
precision highp float;

${glslBhConstantsHeader}

uniform sampler2D uDiskTurbulence;
uniform float uTime;
uniform float uSpinSense;
uniform float uKerrMode;

in vec2 vUv; // x: phi / 2PI, y: log(r / rIn) / log(rTaper / rIn)
out vec4 fragColor;

void main() {
  float rIn = uKerrMode > 0.5 ? BH_KERR_ISCO_R : BH_DISK_R_IN;
  float r = rIn * exp(vUv.y * log(BH_DISK_R_TAPER / rIn));
  float phi = vUv.x * 6.28318530718;

  float geomOmega = uKerrMode > 0.5
    ? sqrt(BH_M) / (pow(r, 1.5) + BH_KERR_A * sqrt(BH_M))
    : sqrt(BH_M / (r * r * r));
  float omega = geomOmega * BH_SCREEN_TIME_SCALE * uSpinSense;

  float pWrap = 24.0;
  float t0 = fract(uTime / pWrap);
  float t1 = fract(uTime / pWrap + 0.5);
  float blendW = abs(2.0 * t0 - 1.0);

  float u0 = fract((phi - omega * (t0 * pWrap)) / 6.28318530718);
  float u1 = fract((phi - omega * (t1 * pWrap)) / 6.28318530718);
  vec3 s0 = texture(uDiskTurbulence, vec2(u0, vUv.y)).rgb;
  vec3 s1 = texture(uDiskTurbulence, vec2(u1, vUv.y)).rgb;
  fragColor = vec4(mix(s0, s1, blendW), 1.0);
}
`;
