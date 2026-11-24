export const particlesVertexShader = /* glsl */ `
  in vec4 aSeed;     // x: aNorm, y: ecc, z: phase, w: incl
  in float aCohort;  // 0..15 slot index
  in float aArea;    // 0..2 area archetype
  in vec3 aTarget;   // symmetric wordmark target

  uniform sampler2D uCohortTex; // 16x1 RGBA Float: r=dirSmooth, g=weight, b=areaIdx, a=Phi_c
  uniform float uDpr;
  uniform float uIntro;         // 0=dust, 0.5=wordmark, 1.0=orbit
  uniform float uTime;
  uniform float uHold;          // 0..1 seal hold tightening
  uniform float uLive;          // 1.0 when showing live/day coherence
  uniform float uBrightness;    // 0.55 on /log, 1.0 elsewhere
  uniform float uFocusArea;     // -1 = all, >=0 focuses one area
  uniform float uRecapJudge;    // -1 = off, >=0 highlights active judged cohort
  uniform float uRecapSpike;    // 0..1 lensing/streak spike

  out float vAlpha;
  out float vHeat;
  out float vDoppler;

  const float TAU = 6.28318530718;
  const float R_IN = 2.05;
  const float R_OUT = 9.4;
  const float A0 = 4.2;

  vec3 curlOffset(vec3 p, float t) {
    float s1 = sin(p.y * 1.3 + t) * cos(p.z * 1.1 - t * 0.7);
    float s2 = sin(p.z * 1.2 - t * 0.8) * cos(p.x * 1.4 + t * 0.6);
    float s3 = sin(p.x * 1.1 + t * 0.5) * cos(p.y * 1.3 - t * 0.9);
    return vec3(s1, s2, s3) * 0.34;
  }

  void main() {
    int slot = int(clamp(floor(aCohort + 0.5), 0.0, 15.0));
    vec4 cohortData = texelFetch(uCohortTex, ivec2(slot, 0), 0);
    float dirSmooth = cohortData.r;
    float phiC = cohortData.a;

    // Normalized satisfaction coherence in [0, 1]: dirSmooth +1 => satisfied (1), -1 => unmet (0)
    float satisfied = clamp(dirSmooth * 0.5 + 0.5, 0.0, 1.0);
    float coherence = uLive * satisfied;

    // Area-specific orbital shape
    float baseEcc = aArea < 0.5 ? 0.06 : (aArea < 1.5 ? 0.22 : 0.46);
    float baseIncl = aArea < 0.5 ? 0.10 : (aArea < 1.5 ? 0.42 : 1.12);
    float ecc = mix(min(0.55, baseEcc + 0.18), baseEcc * 0.55, coherence) * (0.65 + 0.7 * aSeed.y);
    float incl = mix(baseIncl, baseIncl * 0.16, coherence) * (aSeed.w * 2.0 - 1.0);

    float a = mix(R_IN, R_OUT, pow(aSeed.x, 1.6));
    a = mix(a, R_IN * 0.92, uHold * 0.55);

    float omegaFactor = pow(max(0.2, a / A0), -1.5);
    float M = aSeed.z * TAU + omegaFactor * phiC;

    // Two Newton-Raphson steps for Kepler's equation E - e*sin(E) = M
    float E = M + ecc * sin(M) + 0.5 * ecc * ecc * sin(2.0 * M);
    E = E - (E - ecc * sin(E) - M) / max(0.2, 1.0 - ecc * cos(E));
    E = E - (E - ecc * sin(E) - M) / max(0.2, 1.0 - ecc * cos(E));

    float cosE = cos(E);
    float sinE = sin(E);
    float bScale = sqrt(max(0.05, 1.0 - ecc * ecc));
    vec3 orbitPos = vec3(a * (cosE - ecc), 0.0, a * bScale * sinE);

    // Node rotation + inclination tilt
    float node = aCohort * 0.41 + aSeed.w * 1.1;
    float cn = cos(node);
    float sn = sin(node);
    float ci = cos(incl);
    float si = sin(incl);

    vec3 tilted = vec3(
      orbitPos.x * cn - orbitPos.z * sn,
      orbitPos.z * si,
      orbitPos.x * sn + orbitPos.z * cn
    );
    tilted.y = tilted.y * ci + orbitPos.z * si * 0.35;

    // Turbulence for unmet / retrograde particles
    vec3 turbulent = tilted + curlOffset(tilted * 0.35, phiC * 0.05 + uTime * 0.25) * (1.0 - coherence);

    // Dust state (uIntro < 0.5) -> Wordmark (uIntro == 0.5) -> Orbit (uIntro == 1.0)
    float wordFactor = max(0.0, 1.0 - abs(uIntro - 0.5) * 2.0);
    float orbitFactor = smoothstep(0.48, 1.0, uIntro);
    float dustFactor = max(0.0, 1.0 - uIntro * 2.0);

    vec3 dustPos = vec3(
      (aSeed.x - 0.5) * 14.0 + sin(uTime * 0.35 + aSeed.z * TAU) * 0.5,
      (aSeed.y - 0.5) * 7.5 + cos(uTime * 0.28 + aSeed.w * TAU) * 0.4,
      (aSeed.z - 0.5) * 5.0
    );

    float hasWord = step(0.001, length(aTarget));
    vec3 wordPos = mix(dustPos * 0.35, aTarget, hasWord);

    vec3 finalPos = dustPos * dustFactor + wordPos * wordFactor + turbulent * orbitFactor;

    // Tangent velocity sign for subtle Doppler intensity modulation
    vec3 tang = normalize(vec3(-sinE, 0.0, bScale * cosE) + vec3(0.0001));
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    vec3 viewDir = normalize(-mvPosition.xyz);
    vDoppler = dot((modelViewMatrix * vec4(tang, 0.0)).xyz, viewDir);

    float focusDim = 1.0;
    if (uFocusArea >= -0.5) {
      focusDim = abs(aArea - uFocusArea) < 0.3 ? 1.15 : 0.22;
    }

    float recapBoost = 1.0;
    if (uRecapJudge >= -0.5) {
      recapBoost = abs(aCohort - uRecapJudge) < 0.3 ? (1.45 + uRecapSpike * 0.5) : 0.65;
    }

    float depthScale = clamp(12.0 / max(1.5, -mvPosition.z), 0.7, 3.2);
    float sizePx = clamp((1.15 + 1.55 * aSeed.y * (0.5 + 0.5 * satisfied)) * depthScale * uDpr, 1.0 * uDpr, 6.0 * uDpr);
    gl_PointSize = sizePx * mix(1.0, 1.18, wordFactor);
    gl_Position = projectionMatrix * mvPosition;

    vHeat = clamp(0.25 + 0.75 * satisfied + wordFactor * 0.4 + uHold * 0.35, 0.0, 1.0);
    vAlpha = clamp((0.28 + 0.58 * satisfied) * uBrightness * focusDim * recapBoost, 0.05, 1.0);
  }
`;

export const particlesFragmentShader = /* glsl */ `
  uniform vec3 uOrchidAbyss;
  uniform vec3 uOrchid;
  uniform vec3 uOrchidHot;

  in float vAlpha;
  in float vHeat;
  in float vDoppler;

  out vec4 fragColor;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;

    float core = exp(-d2 * 14.0);
    float doppler = clamp(1.0 + vDoppler * 0.28, 0.65, 1.38);

    vec3 col = mix(uOrchidAbyss, uOrchid, smoothstep(0.05, 0.75, vHeat));
    col = mix(col, uOrchidHot, smoothstep(0.68, 1.0, vHeat * core));
    col *= doppler;

    fragColor = vec4(col * core, core * vAlpha);
  }
`;
