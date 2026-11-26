export const blackHoleDiskGlsl = /* glsl */ `
  float diskHash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float diskValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = diskHash21(i);
    float b = diskHash21(i + vec2(1.0, 0.0));
    float c = diskHash21(i + vec2(0.0, 1.0));
    float d = diskHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float diskFbm(float logR, float phi, float twist) {
    float sum = 0.0;
    float amp = 0.54;
    float fLog = logR * 9.0;
    float fAng = phi + twist;
    for (int i = 0; i < 3; i++) {
      vec2 p = vec2(cos(fAng) * 2.5 + fLog, sin(fAng) * 2.5 - fLog * 0.34);
      sum += amp * diskValueNoise(p);
      fLog *= 2.07;
      fAng *= 2.0;
      amp *= 0.5;
    }
    return sum;
  }

  // Two-phase Keplerian differential shear (period ~ r^1.5; ISCO ~6.8s, outer ~10x slower)
  float sampleDiskStructure(float r, float phi, float time, bool isPrimary) {
    float rClamped = max(r, 2.85);
    float omega = 0.92 * pow(rClamped / 3.0, -1.5);
    float logR = log(rClamped / 3.0);

    float phaseA = fract(time * 0.085);
    float phaseB = fract(time * 0.085 + 0.5);
    float blend = abs(2.0 * phaseA - 1.0);

    float angleOffsetA = (phaseA - 0.5) * omega * 11.76;
    float angleOffsetB = (phaseB - 0.5) * omega * 11.76;

    float density = 0.0;
    if (isPrimary) {
      float blurArc = clamp(0.11 * pow(3.2 / rClamped, 1.15), 0.015, 0.14);
      for (int k = -1; k <= 1; k++) {
        float dPhi = float(k) * blurArc;
        float nA = diskFbm(logR, phi - angleOffsetA + dPhi, logR * 2.15);
        float nB = diskFbm(logR, phi - angleOffsetB + dPhi, logR * 2.15);
        density += mix(nA, nB, blend);
      }
      density *= 0.333333;
    } else {
      float nA = diskFbm(logR, phi - angleOffsetA, logR * 2.15);
      float nB = diskFbm(logR, phi - angleOffsetB, logR * 2.15);
      density = mix(nA, nB, blend);
    }

    float rings = 0.68 + 0.32 * sin(logR * 26.0 + density * 4.5);
    float filaments = smoothstep(0.14, 0.86, density * 1.18) * rings;
    return mix(0.24, 1.48, filaments);
  }

  // Hybrid Novikov-Thorne thermal gradient + TENET Comb-jelly Orchid outer dissolve
  mediump vec3 evalDiskPalette(float r, float gEff, float mode, float hue) {
    float rNorm = clamp((r - 3.0) / 12.5, 0.0, 1.0);
    float ntRaw = pow(max(0.0, (1.0 - sqrt(3.0 / max(r, 3.005))) / pow(max(r, 3.0) / 3.0, 3.0)), 0.25);
    float tHeat = clamp((ntRaw / 0.588) * mix(1.0, gEff * 1.08, 0.72), 0.0, 1.0);

    mediump vec3 innerWhiteGold = vec3(1.00, 0.90, 0.80) + vec3(0.09, 0.01, 0.08) * smoothstep(0.75, 1.0, tHeat);
    mediump vec3 hotOrange = vec3(0.84, 0.20, 0.024);
    mediump vec3 deepEmber = vec3(0.28, 0.032, 0.018);
    mediump vec3 outerOrchid = mix(uAccent * 0.44, uAccentAbyss * 1.25, smoothstep(0.62, 1.0, rNorm));

    mediump vec3 base = mix(deepEmber, hotOrange, smoothstep(0.05, 0.44, tHeat));
    base = mix(base, uAmber * 1.12, smoothstep(0.42, 0.78, tHeat));
    base = mix(base, innerWhiteGold, smoothstep(0.76, 1.0, tHeat));
    base = mix(base, outerOrchid, smoothstep(0.46, 0.95, rNorm) * 0.68);

    // Strong spectral shift: approaching shifts pale-gold/rose/ice; receding dims to crimson-umber-abyss
    mediump vec3 blueShiftCol = mix(innerWhiteGold, mix(uColdBlue, vec3(0.88, 0.92, 1.0), 0.75), 0.32);
    mediump vec3 redShiftCol = mix(deepEmber, uAccentAbyss * 1.2, 0.62);
    base = mix(base, blueShiftCol, smoothstep(1.04, 1.42, gEff) * 0.45);
    base = mix(base, redShiftCol, smoothstep(0.95, 0.56, gEff) * 0.68);

    float retro = clamp(-mode, 0.0, 1.0) * hue;
    float prog = clamp(mode, 0.0, 1.0) * hue;
    mediump vec3 retroCol = mix(vec3(0.06, 0.28, 0.40), vec3(0.42, 0.82, 0.98), tHeat);
    mediump vec3 progCol = mix(uAccent * 0.78, vec3(1.0, 0.95, 0.88), tHeat);
    base = mix(base, retroCol, retro * 0.75);
    base = mix(base, progCol, prog * 0.72);
    return base;
  }

  void evalDiskCrossing(
    float rCross,
    vec3 pCross,
    vec3 rdCross,
    bool isTopFace,
    out mediump vec3 emission,
    out float opacity
  ) {
    float outerBound = isTopFace ? 15.5 : 10.5;
    float innerFade = smoothstep(2.84, 3.35, rCross);
    float outerFade = 1.0 - smoothstep(isTopFace ? 6.8 : 4.8, outerBound, rCross);
    float radialMask = innerFade * outerFade;
    if (radialMask <= 0.002) {
      emission = vec3(0.0);
      opacity = 0.0;
      return;
    }

    float phiDisk = atan(pCross.z, pCross.x);
    float dirSign = mix(1.0, -0.55, clamp(-uMode, 0.0, 1.0) * uHue) + clamp(uMode, 0.0, 1.0) * uHue * 0.9;
    float structure = sampleDiskStructure(rCross, phiDisk, uTime * dirSign, isTopFace);

    vec3 gasDir = normalize(vec3(pCross.z, 0.0, -pCross.x)) * sign(dirSign);
    float vOrb = sqrt(0.5 / max(rCross, 1.5));
    float cosEmit = dot(-rdCross, gasDir);
    float grav = sqrt(max(1.0 - 1.0 / max(rCross, 1.05), 0.06));
    float gPhys = grav / clamp(1.0 - vOrb * cosEmit, 0.44, 1.85);
    float gEff = mix(1.0, gPhys, uDopplerStrength);
    float beaming = clamp(pow(gEff, 3.8), 0.14, 2.75);

    float incSoft = smoothstep(0.010, 0.085, abs(rdCross.y));
    float imageWeight = isTopFace ? 1.0 : 0.62;

    float density = clamp(radialMask * structure * mix(0.68, 1.0, incSoft), 0.0, 1.0);
    mediump vec3 albedo = evalDiskPalette(rCross, gEff, uMode, uHue);

    // Dense inner plasma cleanly occludes background sky and lensed sub-images
    float frontOcc = smoothstep(2.9, 4.0, rCross) * (1.0 - smoothstep(6.5, 12.0, rCross));
    opacity = clamp(density * (0.64 + 0.34 * frontOcc) * imageWeight, 0.0, 0.985);
    emission = albedo * (density * beaming * imageWeight * 0.94 * (1.0 + uHold * 0.35));
  }
`;
