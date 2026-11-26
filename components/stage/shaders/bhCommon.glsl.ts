import { glslBhConstantsHeader } from '@/stage/blackhole/constants';

export const bhFullscreenVertexShader = /* glsl */ `
precision highp float;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const bhCommonGlsl = /* glsl */ `
${glslBhConstantsHeader}

#define BH_PI 3.14159265359
#define BH_TAU 6.28318530718

float bhBToLutU(float b) {
  float cb = clamp(b, 0.0, BH_LUT_B_MAX);
  if (cb <= BH_BC) {
    return BH_LUT_SPLIT_CAP * (cb / BH_BC);
  }
  float db = cb - BH_BC;
  if (db <= BH_LUT_STRONG_SPAN) {
    float t = log((db + BH_LUT_STRONG_EPS) / BH_LUT_STRONG_EPS) /
              log((BH_LUT_STRONG_SPAN + BH_LUT_STRONG_EPS) / BH_LUT_STRONG_EPS);
    return BH_LUT_SPLIT_CAP + (BH_LUT_SPLIT_STRONG - BH_LUT_SPLIT_CAP) * t;
  }
  float t = sqrt(max(0.0, (cb - (BH_BC + BH_LUT_STRONG_SPAN)) /
                          (BH_LUT_B_MAX - (BH_BC + BH_LUT_STRONG_SPAN))));
  return BH_LUT_SPLIT_STRONG + (1.0 - BH_LUT_SPLIT_STRONG) * t;
}

float bhObserverSliceCoord(float rObs) {
  // Maps observer radii [8, 14, 24, 40, 64] to [0.1, 0.3, 0.5, 0.7, 0.9]
  float s = 0.0;
  if (rObs <= 14.0) {
    s = clamp((rObs - 8.0) / 6.0, 0.0, 1.0);
    return mix(0.1, 0.3, s);
  }
  if (rObs <= 24.0) {
    s = clamp((rObs - 14.0) / 10.0, 0.0, 1.0);
    return mix(0.3, 0.5, s);
  }
  if (rObs <= 40.0) {
    s = clamp((rObs - 24.0) / 16.0, 0.0, 1.0);
    return mix(0.5, 0.7, s);
  }
  s = clamp((rObs - 40.0) / 24.0, 0.0, 1.0);
  return mix(0.7, 0.9, s);
}

vec2 bhSampleTransfer(sampler3D uTransferLut, float bLut, float phi, float rSlice) {
  float pCoord = clamp(phi / BH_LUT_PHI_MAX, 0.0, 1.0);
  return texture(uTransferLut, vec3(bLut, pCoord, rSlice)).rg;
}

float bhWeakFieldDeflection(float b) {
  float sb = max(b, 1.0);
  float mb = BH_M / sb;
  return 4.0 * mb + (15.0 * BH_PI / 4.0) * mb * mb + (128.0 / 3.0) * mb * mb * mb;
}

float bhLuminetG(
  float r,
  float b,
  float sinTheta0,
  float sinPsi,
  float spinSense,
  float rObs,
  float kerrMode
) {
  float rMinG = mix(BH_PHOTON_R + 0.001, 1.08, kerrMode);
  float safeR = max(rMinG, r);
  float gGrav = sqrt(max(1e-4, 1.0 - (3.0 * BH_M) / safeR));
  float omega = kerrMode > 0.5
    ? sqrt(BH_M) / (pow(safeR, 1.5) + BH_KERR_A * sqrt(BH_M))
    : sqrt(BH_M / (safeR * safeR * safeR));
  float obsLapse = sqrt(max(1e-4, 1.0 - BH_RS / max(BH_RS + 0.05, rObs)));
  float denom = max(0.22, 1.0 + spinSense * omega * b * sinTheta0 * sinPsi);
  return (gGrav / obsLapse) / denom;
}

mediump vec3 bhSampleBlackbody(sampler2D uBlackbodyLut, float tempNorm, float g) {
  float T = mix(BH_LUT_TEMP_MIN, BH_LUT_TEMP_PEAK, clamp(tempNorm, 0.0, 1.0)) * clamp(g, 0.2, 2.2);
  float u = clamp(
    log(max(T, BH_LUT_TEMP_MIN) / BH_LUT_TEMP_MIN) /
    log(BH_LUT_TEMP_MAX / BH_LUT_TEMP_MIN),
    0.0,
    1.0
  );
  return texture(uBlackbodyLut, vec2(u, 0.5)).rgb;
}
`;
