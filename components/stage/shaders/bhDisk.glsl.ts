export const bhDiskGlsl = /* glsl */ `
float bhNovikovThorne(float r, float rIn) {
  if (r <= rIn) return 0.0;
  float q = sqrt(clamp(rIn / r, 0.0, 1.0));
  float val = pow(max(0.0, (1.0 - q) / (r * r * r)), 0.25);
  float rPeak = (49.0 / 36.0) * rIn;
  float qPeak = sqrt(rIn / rPeak);
  float peak = pow(max(1e-6, (1.0 - qPeak) / (rPeak * rPeak * rPeak)), 0.25);
  return clamp(val / peak, 0.0, 1.0);
}

float bhDiskHalfHeight(float r, float rIn) {
  float t = clamp((r - rIn) / (BH_DISK_R_OUT - rIn), 0.0, 1.0);
  float hr = mix(BH_H_MIN, BH_H_MAX, sqrt(t));
  return r * hr;
}

float bhCheapOctave(float phi, float rNorm, float tPhase) {
  return 0.5 + 0.5 * sin(phi * 11.0 - rNorm * 28.0 - tPhase) * cos(phi * 5.0 + rNorm * 17.0);
}

vec3 bhSampleDiskNoise(
  sampler2D uTurbTex,
  sampler2D uDiskCacheTex,
  float r,
  float rIn,
  float phi,
  float time,
  float spinSense,
  float kerrMode,
  float useCache30Hz,
  float cacheSubDt,
  int blurTaps
) {
  float v = clamp(log(max(r, rIn) / rIn) / log(BH_DISK_R_TAPER / rIn), 0.0, 1.0);
  float geomOmega = kerrMode > 0.5
    ? sqrt(BH_M) / (pow(r, 1.5) + BH_KERR_A * sqrt(BH_M))
    : sqrt(BH_M / (r * r * r));
  float omega = geomOmega * BH_SCREEN_TIME_SCALE * spinSense;

  // Two-phase 24s time-wrap prevents differential shear over-winding at long runtimes
  float pWrap = 24.0;
  float t0 = fract(time / pWrap);
  float t1 = fract(time / pWrap + 0.5);
  float blendW = abs(2.0 * t0 - 1.0);
  float dPhiBlur = clamp(abs(omega) * 0.018, 0.002, 0.14);

  vec3 accum = vec3(0.0);
  float wSum = 0.0;
  for (int i = 0; i < 4; ++i) {
    if (i >= blurTaps) break;
    float fTap = blurTaps > 1 ? (float(i) / float(blurTaps - 1) - 0.5) * 2.0 : 0.0;
    float phiTap = phi + fTap * dPhiBlur;
    float tapW = 1.0 - 0.35 * abs(fTap);

    vec3 nSample;
    if (useCache30Hz > 0.5) {
      float uC = fract((phiTap - omega * cacheSubDt) / BH_TAU);
      nSample = texture(uDiskCacheTex, vec2(uC, v)).rgb;
    } else {
      float u0 = fract((phiTap - omega * (t0 * pWrap)) / BH_TAU);
      float u1 = fract((phiTap - omega * (t1 * pWrap)) / BH_TAU);
      vec3 s0 = texture(uTurbTex, vec2(u0, v)).rgb;
      vec3 s1 = texture(uTurbTex, vec2(u1, v)).rgb;
      nSample = mix(s0, s1, blendW);
    }
    accum += nSample * tapW;
    wSum += tapW;
  }
  vec3 turb = accum / max(wSum, 1e-4);
  float hi = bhCheapOctave(phi - omega * mod(time, pWrap), v, time * 0.4);
  turb.r = clamp(turb.r * 0.86 + hi * 0.18, 0.0, 1.35);
  return turb;
}

vec4 bhShadeDiskCrossing(
  float r,
  vec3 hitPos,
  vec3 rayDir,
  float b,
  float sinTheta0,
  float sinPsi,
  float rObs,
  float time,
  float spinSense,
  float kerrMode,
  float uHold,
  float uHeat,
  vec3 uOrchid,
  sampler2D uBlackbodyLut,
  sampler2D uTurbTex,
  sampler2D uDiskCacheTex,
  float useCache30Hz,
  float cacheSubDt,
  int blurTaps,
  out float outDiskPhi
) {
  float rIn = kerrMode > 0.5 ? BH_KERR_ISCO_R : BH_DISK_R_IN;
  outDiskPhi = atan(hitPos.z, hitPos.x);
  if (r < rIn * 0.96 || r > BH_DISK_R_TAPER) {
    return vec4(0.0);
  }

  float innerEdge = smoothstep(rIn * 0.96, rIn * 1.07, r);
  float outerEdge = 1.0 - smoothstep(BH_DISK_R_OUT * 0.82, BH_DISK_R_TAPER, r);
  float radialMask = innerEdge * outerEdge;
  if (radialMask <= 0.002) return vec4(0.0);

  vec3 turb = bhSampleDiskNoise(
    uTurbTex, uDiskCacheTex, r, rIn, outDiskPhi,
    time, spinSense, kerrMode, useCache30Hz, cacheSubDt, blurTaps
  );

  float g = bhLuminetG(r, b, sinTheta0, sinPsi, spinSense, rObs, kerrMode);
  float tNorm = bhNovikovThorne(r, rIn);
  mediump vec3 bbCol = bhSampleBlackbody(uBlackbodyLut, tNorm, g);

  // Subtle Tenet orchid crest strictly on hottest inner edge & seal-hold
  mediump float crestMask = smoothstep(0.78, 1.0, tNorm) * (0.10 + 0.35 * uHold);
  bbCol = mix(bbCol, uOrchid * 1.65, crestMask);

  // Observed specific intensity I_obs ~ g^3 * I_em (bolometric g^4)
  float g3 = g * g * g;
  float g4 = g3 * g;
  float filament = mix(0.28, 1.45, turb.r) * mix(0.65, 1.25, turb.g);
  float dustExt = mix(0.32, 1.0, turb.b);

  float tau0 = radialMask * (0.45 + 1.15 * tNorm) * mix(0.4, 1.2, turb.r);
  float absCos = max(0.09, abs(rayDir.y));
  float slabAlpha = clamp(1.0 - exp(-tau0 / absCos), 0.0, 0.98) * radialMask;

  mediump float emissive = (0.35 + 1.45 * tNorm) * filament * dustExt * (0.72 + 0.42 * uHeat + 0.55 * uHold);
  mediump vec3 rad = bbCol * emissive * mix(g3, g4, 0.45) * 0.92;
  return vec4(rad, slabAlpha);
}
`;
