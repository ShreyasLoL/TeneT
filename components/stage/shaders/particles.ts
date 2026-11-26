import { gradientCurlGlsl } from './noise';

export const particlesVertexShader = /* glsl */ `
  precision highp float;

  in vec4 aSeed;     // x: aBase, y: eccRand, z: phase, w: inclRand
  in vec2 aMeta;     // x: cohort slot 0..15, y: area (0..2) or 10+area for dust shell

  uniform sampler2D uCohortTex; // 16x1 RGBA Float: r=dirSmooth, g=weight, b=areaIdx, a=Phi_c
  uniform float uDpr;
  uniform float uIntro;         // 0=void -> spiral infall -> 1=settled
  uniform float uSpin;          // time-lapse angular wind-down offset
  uniform float uTick;          // 1=60 radial clock ticks -> 0=Keplerian disk
  uniform float uTime;
  uniform float uHold;          // 0..1 seal hold tightening
  uniform float uMode;          // -1 retrograde, 0 landing, +1 prograde
  uniform float uWarp;          // 0..1 dive through hole into star system
  uniform float uHue;           // 0..1 palette lerp
  uniform float uLive;
  uniform float uBrightness;
  uniform float uFocusArea;
  uniform float uRecapJudge;
  uniform float uRecapSpike;

  out float vAlpha;
  out float vRadiusNorm;
  out float vDoppler;
  out float vShell;
  out float vMemoryBody;
  out float vStarBright;

  const float TAU = 6.28318530718;
  const float R_IN = 0.66;
  const float R_SPAN = 1.82;
  const float A0 = 1.45;

  ${gradientCurlGlsl}

  void main() {
    float aCohort = aMeta.x;
    float isShell = step(5.0, aMeta.y);
    float aArea = aMeta.y - isShell * 10.0;

    int slot = int(clamp(floor(aCohort + 0.5), 0.0, 15.0));
    vec4 cohortData = texelFetch(uCohortTex, ivec2(slot, 0), 0);
    float dirSmooth = cohortData.r;
    float phiC = cohortData.a;

    float retro = clamp(-uMode, 0.0, 1.0);
    float prog = clamp(uMode, 0.0, 1.0);
    float retroWarp = retro * uWarp;
    float progWarp = prog * uWarp;

    float satisfied = clamp(dirSmooth * 0.5 + 0.5, 0.0, 1.0);
    float coherence = clamp(mix(uLive * satisfied, 0.25, isShell) + retroWarp * 0.75, 0.0, 1.0);

    float area0 = 1.0 - step(0.5, aArea);
    float area1 = step(0.5, aArea) * (1.0 - step(1.5, aArea));
    float baseEcc = mix(area0 * 0.03 + area1 * 0.10 + (1.0 - area0 - area1) * 0.18, 0.24, isShell);
    float flatInclScale = mix(0.22, 1.0, max(retroWarp, progWarp));
    float baseIncl = mix(
      (area0 * 0.03 + area1 * 0.09 + (1.0 - area0 - area1) * 0.18) * flatInclScale,
      1.15,
      isShell
    );
    float ecc = mix(min(0.32, baseEcc + 0.08), baseEcc * 0.5, coherence) * (0.65 + 0.65 * aSeed.y);
    float cloudPuff = 1.0 - smoothstep(0.08, 0.92, uIntro);
    float incl = mix(baseIncl, baseIncl * 0.22, coherence) * (aSeed.w * 2.0 - 1.0) + cloudPuff * (aSeed.w * 2.0 - 1.0) * 1.15;

    float shellRadius = mix(0.72, 1.65, aSeed.y);
    float aTarget = mix(aSeed.x, shellRadius, isShell);
    float a = mix(aTarget, R_IN * 0.94, uHold * 0.48 * (1.0 - isShell * 0.6));

    float quantizedRing = floor(a * 2.4 + 0.5) / 2.4;
    a = mix(a, quantizedRing * 0.85, retroWarp * 0.72);
    a *= mix(1.42, 1.0, max(retroWarp, progWarp)) * (1.0 + progWarp * (0.65 + aSeed.y * 0.95));
    a *= 1.0 + cloudPuff * (0.55 + aSeed.y * 0.45);

    float aRatio = max(0.22, a / A0);
    float omegaFactor = (inversesqrt(aRatio) / aRatio) * mix(1.25, 0.38, isShell);

    float stagger = clamp((a - R_IN) / 5.5, 0.0, 1.0) * 0.18;
    float infallWindup = -uSpin * omegaFactor * 0.55;

    float journeySpin = progWarp * 3.8 * omegaFactor - retroWarp * 1.6 * omegaFactor;
    float M = aSeed.z * TAU + omegaFactor * phiC + journeySpin - infallWindup;

    float E = M + ecc * sin(M) + 0.5 * ecc * ecc * sin(2.0 * M);
    E = E - (E - ecc * sin(E) - M) / max(0.2, 1.0 - ecc * cos(E));
    E = E - (E - ecc * sin(E) - M) / max(0.2, 1.0 - ecc * cos(E));

    float cosE = cos(E);
    float sinE = sin(E);
    float bScale = sqrt(max(0.05, 1.0 - ecc * ecc));
    vec3 orbitPos = vec3(a * (cosE - ecc), 0.0, a * bScale * sinE);

    float node = aCohort * 0.39 + aSeed.w * 1.4;
    float cn = cos(node);
    float sn = sin(node);
    float ci = cos(incl);
    float si = sin(incl);

    vec3 tilted = vec3(
      orbitPos.x * cn - orbitPos.z * sn,
      orbitPos.z * si,
      orbitPos.x * sn + orbitPos.z * cn
    );
    tilted.y = tilted.y * ci + orbitPos.z * si * 0.32;

    vec3 diskPos = tilted + sampleCurl3(tilted * 0.52, phiC * 0.05 + uTime * 0.22, 0.45, 0.28) * (1.0 - coherence * 0.72) * (1.0 - isShell * 0.4);
    diskPos.z += progWarp * (aSeed.z - 0.35) * 4.2;

    // Loose 3D cloud settles directly along tilted Keplerian orbits (no spoke snap)
    vec3 finalPos = diskPos;

    vec3 localTang = vec3(-sinE, 0.0, bScale * cosE);
    vec3 worldTang = normalize(vec3(
      localTang.x * cn - localTang.z * sn,
      localTang.z * si * 0.4,
      localTang.x * sn + localTang.z * cn
    ) + vec3(0.0001));

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    vec3 viewDir = normalize(-mvPosition.xyz);
    vDoppler = dot(mat3(modelViewMatrix) * worldTang, viewDir) * dirSmooth;

    float hasFocus = step(-0.5, uFocusArea);
    float focusMatch = 1.0 - step(0.3, abs(aArea - uFocusArea));
    float focusDim = mix(1.0, mix(0.24, 1.18, focusMatch), hasFocus);

    float hasJudge = step(-0.5, uRecapJudge);
    float judgeMatch = 1.0 - step(0.3, abs(aCohort - uRecapJudge));
    float recapBoost = mix(1.0, mix(0.65, 1.45 + uRecapSpike * 0.5, judgeMatch), hasJudge);

    float isMemoryBody = step(0.968, aSeed.y) * (1.0 - isShell);
    float bodyBoost = 1.0 + isMemoryBody * retroWarp * 1.35 + progWarp * 0.32;

    float depthScale = clamp(10.6 / max(1.2, -mvPosition.z), 0.55, 3.0);
    float basePt = mix(0.88 + 1.20 * aSeed.y * (0.5 + 0.5 * satisfied), 0.75 + 0.65 * aSeed.y, isShell);
    gl_PointSize = clamp(basePt * bodyBoost * depthScale * uDpr, 0.75 * uDpr, 5.2 * uDpr);
    gl_Position = projectionMatrix * mvPosition;

    float introGlow = smoothstep(stagger * 1.8, 0.72 + stagger * 0.4, uIntro);
    float radialFade = mix(pow(1.0 - clamp((a - R_IN * 1.42) / (R_SPAN * 1.42), 0.0, 1.0), 1.35), 0.22, isShell);
    radialFade = mix(radialFade, 0.78, max(retroWarp, progWarp) * 0.65);

    // Occlude dust particles behind the black hole shadow AND inner horizon silhouette
    float behindHole = step(-10.4, -mvPosition.z);
    float shadowMask = mix(1.0, smoothstep(0.95, 1.25, length(mvPosition.xy)), behindHole * (1.0 - max(retroWarp, progWarp)));
    float shellMask = mix(1.0, smoothstep(0.98, 1.45, length(mvPosition.xy)), isShell * (1.0 - max(retroWarp, progWarp))) * shadowMask;

    vRadiusNorm = clamp((a - R_IN) / R_SPAN, 0.0, 1.0);
    vShell = isShell;
    vMemoryBody = isMemoryBody * retroWarp;
    vStarBright = aSeed.y * (1.0 - isShell);
    vAlpha = clamp((0.24 + 0.58 * satisfied) * uBrightness * focusDim * recapBoost * introGlow * radialFade * shellMask, 0.0, 0.98);
  }
`;

export const particlesFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uAmber;
  uniform vec3 uOrchid;
  uniform vec3 uViolet;
  uniform vec3 uColdBlue;
  uniform float uHold;
  uniform float uMode;
  uniform float uHue;

  in float vAlpha;
  in float vRadiusNorm;
  in float vDoppler;
  in float vShell;
  in float vMemoryBody;
  in float vStarBright;

  out vec4 fragColor;

  vec3 blackbodyDiskRamp(float t, float doppler) {
    vec3 whiteHot = vec3(1.0, 0.94, 0.84);
    vec3 orangeDeep = vec3(0.74, 0.13, 0.018);
    vec3 deepVioletRim = uViolet * 0.22;

    vec3 col = mix(whiteHot, uAmber, smoothstep(0.0, 0.30, t));
    col = mix(col, orangeDeep, smoothstep(0.26, 0.70, t));
    col = mix(col, deepVioletRim, smoothstep(0.68, 1.0, t));

    float blueShift = smoothstep(0.04, 0.78, doppler);
    vec3 coldShift = mix(uColdBlue, vec3(0.56, 0.84, 1.0), 1.0 - t * 0.55);
    return mix(col, coldShift, blueShift * 0.72);
  }

  vec3 retrogradePalette(float t) {
    vec3 ice = vec3(0.42, 0.80, 0.98);
    vec3 teal = vec3(0.04, 0.36, 0.46);
    vec3 slateViolet = mix(vec3(0.12, 0.11, 0.24), uOrchid * 0.22, 0.15);
    return mix(mix(ice, teal, clamp(t / 0.30, 0.0, 1.0)), mix(teal, slateViolet, clamp((t - 0.30) / 0.70, 0.0, 1.0)), step(0.30, t));
  }

  vec3 progradePalette(float t) {
    vec3 whiteHot = vec3(1.0, 0.98, 0.92);
    vec3 inner = mix(whiteHot, uAmber, clamp(t / 0.30, 0.0, 1.0));
    vec3 mid = mix(uAmber, uOrchid, clamp((t - 0.30) / 0.42, 0.0, 1.0));
    vec3 outer = mix(uOrchid, uAmber * 0.45, clamp((t - 0.72) / 0.28, 0.0, 1.0));
    return mix(mix(inner, mid, step(0.30, t)), outer, step(0.72, t));
  }

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d2 = dot(c, c);
    float radialWindow = smoothstep(0.25, 0.015, d2);

    // Soft Gaussian falloff + subtle diffraction spikes on the brightest inner particles
    float gauss = exp(-d2 * 22.0) * radialWindow;
    float spikeGate = smoothstep(0.88, 0.99, vStarBright) * radialWindow;
    float spikes =
      (exp(-abs(c.y) * 34.0) * exp(-abs(c.x) * 6.0) +
        exp(-abs(c.x) * 34.0) * exp(-abs(c.y) * 6.0)) *
      0.36 *
      spikeGate;
    float core = mix(gauss + spikes, exp(-d2 * 12.0) * radialWindow, vMemoryBody);

    float retro = clamp(-uMode, 0.0, 1.0) * uHue;
    float prog = clamp(uMode, 0.0, 1.0) * uHue;

    float dopplerGain = clamp(1.0 + vDoppler * 0.55, 0.36, 1.85) + prog * 0.35;
    float rTemp = clamp(vRadiusNorm - vDoppler * 0.08 - uHold * 0.08, 0.0, 1.0);

    vec3 diskCol = blackbodyDiskRamp(rTemp, vDoppler);
    diskCol = mix(diskCol, retrogradePalette(rTemp), retro);
    diskCol = mix(diskCol, progradePalette(rTemp), prog);
    diskCol = mix(diskCol, vec3(0.68, 0.90, 1.0), vMemoryBody * 0.75);

    vec3 dustWarmUmber = mix(uAmber * 0.52, vec3(0.32, 0.06, 0.025), smoothstep(0.0, 0.5, vRadiusNorm));
    vec3 dustRoseViolet = mix(uOrchid * 0.48, uViolet * 0.85, smoothstep(0.4, 1.0, vRadiusNorm));
    vec3 lensDustCol = mix(dustWarmUmber, dustRoseViolet, smoothstep(-0.35, 0.55, -vDoppler));
    lensDustCol = mix(mix(lensDustCol, vec3(0.08, 0.30, 0.40), retro), uAmber * 0.75, prog);
    float horizonDim = 0.55 + 0.45 * smoothstep(0.0, 0.14, vRadiusNorm);
    vec3 col = mix(diskCol, lensDustCol, vShell) * dopplerGain * horizonDim;

    float outA = clamp(core * vAlpha, 0.0, 1.0);
    if (outA < 0.002) discard;

    fragColor = vec4(col * 1.18, outA);
  }
`;
