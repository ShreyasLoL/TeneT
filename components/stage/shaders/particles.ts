export const particlesVertexShader = /* glsl */ `
  in vec4 aSeed;     // x: aBase, y: eccRand, z: phase, w: inclRand
  in vec2 aMeta;     // x: cohort slot 0..15, y: area (0..2) or 10+area for dust shell

  uniform sampler2D uCohortTex; // 16x1 RGBA Float: r=dirSmooth, g=weight, b=areaIdx, a=Phi_c
  uniform float uDpr;
  uniform float uHoleScale;
  uniform float uIntro;         // 0=scattered dark -> spiral infall -> 1=Keplerian disk
  uniform float uTime;
  uniform float uHold;          // 0..1 seal hold tightening
  uniform float uLive;
  uniform float uBrightness;
  uniform float uFocusArea;
  uniform float uRecapJudge;
  uniform float uRecapSpike;

  out float vAlpha;
  out float vRadiusNorm;
  out float vDoppler;
  out float vShell;

  const float TAU = 6.28318530718;
  const float R_IN = 1.02;
  const float R_SPAN = 5.8;
  const float A0 = 2.6;

  vec3 curlOffset(vec3 p, float t) {
    float s1 = sin(p.y * 1.3 + t) * cos(p.z * 1.1 - t * 0.7);
    float s2 = sin(p.z * 1.2 - t * 0.8) * cos(p.x * 1.4 + t * 0.6);
    float s3 = sin(p.x * 1.1 + t * 0.5) * cos(p.y * 1.3 - t * 0.9);
    return vec3(s1, s2, s3) * 0.28;
  }

  void main() {
    float aCohort = aMeta.x;
    float isShell = step(5.0, aMeta.y);
    float aArea = aMeta.y - isShell * 10.0;

    int slot = int(clamp(floor(aCohort + 0.5), 0.0, 15.0));
    vec4 cohortData = texelFetch(uCohortTex, ivec2(slot, 0), 0);
    float dirSmooth = cohortData.r;
    float phiC = cohortData.a;

    float satisfied = clamp(dirSmooth * 0.5 + 0.5, 0.0, 1.0);
    float coherence = mix(uLive * satisfied, 0.25, isShell);

    float baseEcc = isShell > 0.5 ? 0.28 : (aArea < 0.5 ? 0.04 : (aArea < 1.5 ? 0.14 : 0.28));
    float baseIncl = isShell > 0.5 ? 1.25 : (aArea < 0.5 ? 0.045 : (aArea < 1.5 ? 0.14 : 0.34));
    float ecc = mix(min(0.45, baseEcc + 0.12), baseEcc * 0.5, coherence) * (0.65 + 0.65 * aSeed.y);
    float incl = mix(baseIncl, baseIncl * 0.22, coherence) * (aSeed.w * 2.0 - 1.0);

    float shellRadius = mix(3.4, 10.5, aSeed.y);
    float aTarget = mix(aSeed.x, shellRadius, isShell);
    float a = mix(aTarget, R_IN * 0.94, uHold * 0.48 * (1.0 - isShell * 0.6));

    // Differential Keplerian rotation: inner particles orbit faster (omega ~ a^-1.5)
    float aRatio = max(0.22, a / A0);
    float omegaFactor = (inversesqrt(aRatio) / aRatio) * mix(1.25, 0.38, isShell);

    // Intro spiral infall (all in vertex shader, 0 per-particle JS):
    // Inner particles settle slightly earlier than outer halo particles (organic wave, zero hard gaps)
    float stagger = clamp((a - R_IN) / 9.5, 0.0, 1.0) * 0.18;
    float introLocal = smoothstep(stagger, min(1.0, 0.88 + stagger * 0.65), uIntro);
    float infallWindup = (1.0 - introLocal) * (4.4 + aSeed.z * 2.4);

    float M = aSeed.z * TAU + omegaFactor * phiC - infallWindup;

    // Two Newton-Raphson steps for Kepler's equation E - e*sin(E) = M
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

    vec3 diskPos = tilted + curlOffset(tilted * 0.38, phiC * 0.05 + uTime * 0.24) * (1.0 - coherence) * (1.0 - isShell * 0.4);

    // Spiral inward from scattered spawn cloud into diskPos
    vec3 finalPos = diskPos;
    if (uIntro < 0.999) {
      float spinAngle = (1.0 - introLocal) * (2.6 + aSeed.y * 1.8);
      float cs = cos(spinAngle);
      float ss = sin(spinAngle);
      vec3 spunSpawn = vec3(
        position.x * cs - position.z * ss,
        position.y * mix(1.0, 0.18, introLocal),
        position.x * ss + position.z * cs
      );
      finalPos = mix(spunSpawn, diskPos, introLocal);
    }

    // Prograde orbital tangent rotated by node for accurate relativistic Doppler beaming
    vec3 localTang = vec3(-sinE, 0.0, bScale * cosE);
    vec3 worldTang = normalize(vec3(
      localTang.x * cn - localTang.z * sn,
      localTang.z * si * 0.4,
      localTang.x * sn + localTang.z * cn
    ) + vec3(0.0001));

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    vec3 viewDir = normalize(-mvPosition.xyz);
    vDoppler = dot(mat3(modelViewMatrix) * worldTang, viewDir) * dirSmooth;

    float focusDim = 1.0;
    if (uFocusArea >= -0.5) {
      focusDim = abs(aArea - uFocusArea) < 0.3 ? 1.18 : 0.24;
    }

    float recapBoost = 1.0;
    if (uRecapJudge >= -0.5) {
      recapBoost = abs(aCohort - uRecapJudge) < 0.3 ? (1.45 + uRecapSpike * 0.5) : 0.65;
    }

    float depthScale = clamp(11.8 / max(1.6, -mvPosition.z), 0.65, 3.1);
    float basePt = mix(1.25 + 1.55 * aSeed.y * (0.5 + 0.5 * satisfied), 0.95 + 0.85 * aSeed.y, isShell);
    gl_PointSize = clamp(basePt * depthScale * uDpr * mix(0.62, 1.0, uHoleScale), 1.0 * uDpr, 5.6 * uDpr);
    gl_Position = projectionMatrix * mvPosition;

    // Particles start dim/dark at uIntro = 0 and ignite as they spiral into the disk
    float introGlow = mix(0.06, 1.0, smoothstep(0.0, 0.78, uIntro));
    float shellDim = mix(1.0, 0.36, isShell);

    vRadiusNorm = clamp((a - R_IN) / R_SPAN, 0.0, 1.0);
    vShell = isShell;
    vAlpha = clamp((0.32 + 0.58 * satisfied) * uBrightness * focusDim * recapBoost * introGlow * shellDim, 0.02, 1.0);
  }
`;

export const particlesFragmentShader = /* glsl */ `
  uniform vec3 uAmber;
  uniform vec3 uOrchid;
  uniform vec3 uViolet;
  uniform vec3 uColdBlue;
  uniform float uHold;

  in float vAlpha;
  in float vRadiusNorm;
  in float vDoppler;
  in float vShell;

  out vec4 fragColor;

  vec3 blackbodyRamp(float t) {
    vec3 whiteHot = vec3(1.0, 0.98, 1.0);
    if (t < 0.16) return mix(whiteHot, uAmber, t / 0.16);
    if (t < 0.44) return mix(uAmber, uOrchid, (t - 0.16) / 0.28);
    if (t < 0.74) return mix(uOrchid, uViolet, (t - 0.44) / 0.30);
    return mix(uViolet, uColdBlue, clamp((t - 0.74) / 0.26, 0.0, 1.0));
  }

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;

    float edge = max(0.0, 1.0 - d2 * 4.0);
    float core = edge * edge * edge;

    // Relativistic Doppler beaming: approaching side brighter and shifted hotter/bluer
    float dopplerGain = clamp(1.0 + vDoppler * 0.48, 0.48, 1.68);
    float rTemp = clamp(vRadiusNorm - vDoppler * 0.15 - uHold * 0.12, 0.0, 1.0);

    vec3 diskCol = blackbodyRamp(rTemp);
    diskCol = mix(diskCol, vec3(0.76, 0.90, 1.06), max(0.0, vDoppler) * 0.32);

    vec3 shellCol = mix(uViolet, uColdBlue, clamp(vRadiusNorm * 0.8 + 0.2, 0.0, 1.0));
    vec3 col = mix(diskCol, shellCol, vShell * 0.72) * dopplerGain;

    fragColor = vec4(col * core, core * vAlpha);
  }
`;
