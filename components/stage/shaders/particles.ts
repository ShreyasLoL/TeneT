export const particlesVertexShader = /* glsl */ `
  in vec4 aSeed;     // x: aBase (precomputed), y: ecc, z: phase, w: incl
  in vec2 aMeta;     // x: cohort slot 0..15, y: area archetype 0..2

  uniform sampler2D uCohortTex; // 16x1 RGBA Float: r=dirSmooth, g=weight, b=areaIdx, a=Phi_c
  uniform float uDpr;
  uniform float uIntro;         // 0=dust, 0.5=wordmark, 1.0=orbit
  uniform float uTime;
  uniform float uHold;          // 0..1 seal hold tightening
  uniform float uLive;          // 1.0 when showing live/day coherence
  uniform float uBrightness;    // 0.38 on /log, 1.0 elsewhere
  uniform float uFocusArea;     // -1 = all, >=0 focuses one area
  uniform float uRecapJudge;    // -1 = off, >=0 highlights active judged cohort
  uniform float uRecapSpike;    // 0..1 lensing/streak spike

  out float vAlpha;
  out float vHeat;
  out float vDoppler;

  const float TAU = 6.28318530718;
  const float R_IN = 2.05;
  const float A0 = 4.2;

  vec3 curlOffset(vec3 p, float t) {
    float s1 = sin(p.y * 1.3 + t) * cos(p.z * 1.1 - t * 0.7);
    float s2 = sin(p.z * 1.2 - t * 0.8) * cos(p.x * 1.4 + t * 0.6);
    float s3 = sin(p.x * 1.1 + t * 0.5) * cos(p.y * 1.3 - t * 0.9);
    return vec3(s1, s2, s3) * 0.34;
  }

  void main() {
    float aCohort = aMeta.x;
    float aArea = aMeta.y;
    int slot = int(clamp(floor(aCohort + 0.5), 0.0, 15.0));
    vec4 cohortData = texelFetch(uCohortTex, ivec2(slot, 0), 0);
    float dirSmooth = cohortData.r;
    float phiC = cohortData.a;

    float satisfied = clamp(dirSmooth * 0.5 + 0.5, 0.0, 1.0);
    float coherence = uLive * satisfied;

    float baseEcc = aArea < 0.5 ? 0.06 : (aArea < 1.5 ? 0.22 : 0.46);
    float baseIncl = aArea < 0.5 ? 0.10 : (aArea < 1.5 ? 0.42 : 1.12);
    float ecc = mix(min(0.55, baseEcc + 0.18), baseEcc * 0.55, coherence) * (0.65 + 0.7 * aSeed.y);
    float incl = mix(baseIncl, baseIncl * 0.16, coherence) * (aSeed.w * 2.0 - 1.0);

    float a = mix(aSeed.x, R_IN * 0.92, uHold * 0.55);

    // Fast x^(-1.5) = inversesqrt(x) / x without transcendental pow()
    float aRatio = max(0.2, a / A0);
    float omegaFactor = inversesqrt(aRatio) / aRatio;
    float M = aSeed.z * TAU + omegaFactor * phiC;

    // Two Newton-Raphson steps for Kepler's equation E - e*sin(E) = M
    float E = M + ecc * sin(M) + 0.5 * ecc * ecc * sin(2.0 * M);
    E = E - (E - ecc * sin(E) - M) / max(0.2, 1.0 - ecc * cos(E));
    E = E - (E - ecc * sin(E) - M) / max(0.2, 1.0 - ecc * cos(E));

    float cosE = cos(E);
    float sinE = sin(E);
    float bScale = sqrt(max(0.05, 1.0 - ecc * ecc));
    vec3 orbitPos = vec3(a * (cosE - ecc), 0.0, a * bScale * sinE);

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

    vec3 turbulent = tilted + curlOffset(tilted * 0.35, phiC * 0.05 + uTime * 0.25) * (1.0 - coherence);

    vec3 finalPos = turbulent;
    float wordFactor = 0.0;
    if (uIntro < 0.999) {
      wordFactor = max(0.0, 1.0 - abs(uIntro - 0.5) * 2.0);
      float orbitFactor = smoothstep(0.48, 1.0, uIntro);
      float dustFactor = max(0.0, 1.0 - uIntro * 2.0);

      vec3 dustPos = vec3(
        (fract(aSeed.x * 0.37) - 0.5) * 14.0 + sin(uTime * 0.35 + aSeed.z * TAU) * 0.5,
        (aSeed.y - 0.5) * 7.5 + cos(uTime * 0.28 + aSeed.w * TAU) * 0.4,
        (aSeed.z - 0.5) * 5.0
      );

      float hasWord = step(0.0001, dot(position, position));
      vec3 wordPos = mix(dustPos * 0.35, position, hasWord);
      finalPos = dustPos * dustFactor + wordPos * wordFactor + turbulent * orbitFactor;
    }

    vec3 tang = normalize(vec3(-sinE, 0.0, bScale * cosE) + vec3(0.0001));
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    vec3 viewDir = normalize(-mvPosition.xyz);
    vDoppler = dot(mat3(modelViewMatrix) * tang, viewDir);

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

    // Smooth polynomial radial falloff matching exp(-d2 * 14) with zero exp() cost per fragment
    float edge = max(0.0, 1.0 - d2 * 4.0);
    float core = edge * edge * edge;
    float doppler = clamp(1.0 + vDoppler * 0.28, 0.65, 1.38);

    vec3 col = mix(uOrchidAbyss, uOrchid, smoothstep(0.05, 0.75, vHeat));
    col = mix(col, uOrchidHot, smoothstep(0.68, 1.0, vHeat * core));
    col *= doppler;

    fragColor = vec4(col * core, core * vAlpha);
  }
`;
