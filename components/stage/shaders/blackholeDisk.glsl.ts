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
    float fLog = logR * 8.6;
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

  // C1-smooth two-phase Keplerian differential shear (period ~ r^1.5; ISCO ~7.7s, outer ~12x slower)
  float sampleDiskStructure(float r, float phi, float time, bool isTopFace) {
    float rClamped = max(r, 2.85);
    float omega = 0.82 * pow(rClamped / 3.0, -1.5);
    float logR = log(rClamped / 3.0);

    float phaseA = fract(time * 0.042);
    float phaseB = fract(time * 0.042 + 0.5);
    float blend = 0.5 - 0.5 * cos(phaseA * 6.2831853);

    float span = 1.0 / 0.042;
    float angleOffsetA = (phaseA - 0.5) * omega * span;
    float angleOffsetB = (phaseB - 0.5) * omega * span;

    float density = 0.0;
    if (isTopFace) {
      float blurArc = clamp(0.11 * pow(3.2 / rClamped, 1.15), 0.012, 0.13);
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

    float rings = 0.68 + 0.32 * sin(logR * 25.0 + density * 4.4);
    float filaments = smoothstep(0.14, 0.88, density * 1.18) * rings;
    return mix(0.24, 1.48, filaments);
  }

  // Hybrid Novikov-Thorne thermal gradient + umber, rose-pink, orchid, and abyssal violet matter envelope
  mediump vec3 evalDiskPalette(float r, float gEff, float mode, float hue) {
    float rNorm = clamp((r - 3.0) / 15.5, 0.0, 1.0);
    float ntRaw = pow(max(0.0, (1.0 - sqrt(3.0 / max(r, 3.005))) / pow(max(r, 3.0) / 3.0, 3.0)), 0.25);
    float tHeat = clamp((ntRaw / 0.588) * mix(1.0, gEff * 1.08, 0.72), 0.0, 1.0);

    mediump vec3 innerWhiteGold = vec3(1.00, 0.90, 0.84) + vec3(0.10, 0.01, 0.09) * smoothstep(0.72, 1.0, tHeat);
    mediump vec3 hotOrange = vec3(0.84, 0.21, 0.030);
    mediump vec3 warmUmber = vec3(0.32, 0.068, 0.028);
    mediump vec3 dustyPink = mix(uAccent, vec3(0.95, 0.52, 0.78), 0.48);
    mediump vec3 outerEnvelope = mix(dustyPink * 0.42, uAccentAbyss * 1.35, smoothstep(0.55, 1.0, rNorm));

    mediump vec3 base = mix(warmUmber, hotOrange, smoothstep(0.05, 0.42, tHeat));
    base = mix(base, uAmber * 1.12, smoothstep(0.40, 0.76, tHeat));
    base = mix(base, innerWhiteGold, smoothstep(0.74, 1.0, tHeat));
    base = mix(base, outerEnvelope, smoothstep(0.36, 0.92, rNorm) * 0.76);
    base = mix(base, uAccentAbyss * 0.42, smoothstep(0.62, 1.0, rNorm) * 0.58);

    mediump vec3 blueShiftCol = mix(innerWhiteGold, mix(uColdBlue, vec3(0.90, 0.92, 1.0), 0.72), 0.28);
    mediump vec3 redShiftCol = mix(warmUmber, uAccentAbyss * 1.25, 0.58);
    base = mix(base, blueShiftCol, smoothstep(1.04, 1.42, gEff) * 0.42);
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
    float outerBound = isTopFace ? 17.6 : 10.8;
    float innerFade = smoothstep(2.84, 3.35, rCross);
    float outerRaw = 1.0 - smoothstep(isTopFace ? 5.6 : 4.8, outerBound, rCross);
    float outerFade = isTopFace ? outerRaw * outerRaw : outerRaw;
    float veilBoost = isTopFace
      ? smoothstep(7.2, 12.2, rCross) * pow(1.0 - smoothstep(11.8, outerBound, rCross), 2.0) * 0.095
      : 0.0;
    float radialMask = innerFade * max(outerFade, veilBoost);
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
    float imageWeight = isTopFace ? 1.0 : 0.60;

    float rimZone = isTopFace ? smoothstep(9.0, outerBound, rCross) : 0.0;
    float rimBreakup = mix(1.0, smoothstep(0.32, 1.05, structure), rimZone * 0.82);
    float density = clamp(radialMask * structure * rimBreakup * mix(0.68, 1.0, incSoft), 0.0, 1.0);
    mediump vec3 albedo = evalDiskPalette(rCross, gEff, uMode, uHue);

    float frontOcc = smoothstep(2.9, 4.0, rCross) * (1.0 - smoothstep(6.5, 12.5, rCross));
    opacity = clamp(density * (0.62 + 0.36 * frontOcc) * imageWeight, 0.0, 0.985);
    emission = albedo * (density * beaming * imageWeight * 0.94 * (1.0 + uHold * 0.35));
  }
`;
