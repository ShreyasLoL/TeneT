import { gradientCurlGlsl } from './noise';

export const galaxyVertexShader = /* glsl */ `
  precision highp float;

  in vec4 aSeed; // x: r, y: theta0, z: yOff, w: rand
  in vec2 aMeta; // x: kind (0=mainArm,1=secArm,2=bulge,3=HII,4=field), y: lum

  uniform float uTime;
  uniform float uDpr;
  uniform float uIntro;
  uniform float uSpin;
  uniform float uTick;
  uniform float uMode;
  uniform float uWarp;
  uniform float uHue;
  uniform float uBrightness;

  out float vKind;
  out float vRadiusNorm;
  out float vAlpha;
  out float vLum;
  out float vDustExtinction;

  const float SPIRAL_WINDING = 2.45;

  ${gradientCurlGlsl}

  void main() {
    float rBase = aSeed.x;
    float theta0 = aSeed.y;
    float yOff = aSeed.z;
    float rand = aSeed.w;
    float kind = aMeta.x;
    float lum = aMeta.y;

    float retro = clamp(-uMode, 0.0, 1.0) * uWarp;
    float prog = clamp(uMode, 0.0, 1.0) * uWarp;

    float rSafe = max(1.0, rBase);
    float isField = step(3.5, kind);
    // True r^-1.5 Keplerian shear near hole, decaying gently into ultra-subtle cosmic drift at large r
    float diffOmega = 0.064 * pow(rSafe / 2.2, -1.5) * mix(1.0, 0.16, isField);
    float modeSpin = mix(1.0, -1.8, retro) + prog * 3.2;
    float theta = theta0 + uTime * diffOmega * modeSpin + uSpin * pow(rSafe / 2.4, -0.78) * 0.85;

    float rNorm = clamp((rBase - 1.05) / 12.75, 0.0, 1.0);
    float sweepProgress = smoothstep(rNorm * 0.34, 0.58 + rNorm * 0.42, uIntro);

    float r = rBase * mix(0.32, 1.0, sweepProgress);
    r = r * (1.0 - retro * 0.24 + prog * 0.36);

    vec3 galPos = vec3(r * cos(theta), yOff * sweepProgress, r * sin(theta));
    // Vertex-shader curl clumping along spiral arms & HII regions
    float clumpMask = (1.0 - step(3.5, kind)) * smoothstep(2.0, 4.5, r) * sweepProgress;
    galPos += sampleCurl3(galPos * 0.34, uTime * 0.04, 0.25, 0.28) * clumpMask;

    vec3 finalPos = mix(position, galPos, smoothstep(0.0, 0.75, 1.0 - uTick * 0.85) * sweepProgress);

    float spiralRef = SPIRAL_WINDING * log(max(1.4, r) / 2.2);
    float armPhase = sin(2.0 * (theta - spiralRef) + 0.58);
    float inArmZone = smoothstep(2.0, 3.2, r) * (1.0 - smoothstep(10.0, 13.4, r));
    float isDiskPop = 1.0 - step(3.5, kind);
    float dustMask = smoothstep(0.58, 0.94, armPhase) * inArmZone * isDiskPop;
    float extinction = mix(1.0, 0.08, dustMask * (1.0 - step(2.5, kind) * step(kind, 3.5) * 0.35));

    float twinkle = 0.84 + 0.16 * sin(uTime * (1.2 + rand * 3.4) + rand * 6.2831853);

    vec4 mvPos = modelViewMatrix * vec4(finalPos, 1.0);
    float depthScale = clamp(10.8 / max(1.6, -mvPos.z), 0.35, 3.2);

    // Subtle outward gravitational lensing deflection on background spiral-arm stars behind the black hole
    float behindMask = smoothstep(-10.2, -11.4, mvPos.z);
    float rXY = length(mvPos.xy);
    float lensPush =
      (0.42 / (rXY + 0.55)) *
      behindMask *
      smoothstep(0.85, 1.5, rXY) *
      (1.0 - smoothstep(4.5, 9.5, rXY));
    mvPos.xy += normalize(mvPos.xy + vec2(1e-5)) * lensPush;

    // Keep background/foreground bulge & field stars out of the black hole shadow AND bottom-right M87* void
    vec2 ndc = (projectionMatrix * mvPos).xy / max((projectionMatrix * mvPos).w, 1e-4);
    float m87Void = smoothstep(0.28, 0.56, length((ndc - vec2(0.62, -0.58)) * vec2(1.6, 1.0)));
    float bhClear = smoothstep(1.08, 2.10, length(mvPos.xy)) * m87Void;

    float isKnot = step(2.5, kind) * step(kind, 3.5);
    float isHeroStar = step(3.5, kind) * step(0.92, lum);
    float ptBase = 1.20 + pow(lum, 1.35) * 1.95 + isKnot * 0.95 + isHeroStar * 3.8;

    gl_PointSize = clamp(ptBase * depthScale * uDpr, 0.85 * uDpr, 9.5 * uDpr);
    gl_Position = projectionMatrix * mvPos;

    float outerFade = 1.0 - smoothstep(0.74, 1.0, rNorm);
    float introFade = smoothstep(0.04, 0.48 + rNorm * 0.38, uIntro);

    vKind = kind;
    vRadiusNorm = rNorm;
    vLum = lum;
    vDustExtinction = extinction;
    vAlpha = clamp((0.22 + 0.72 * lum) * twinkle * extinction * outerFade * introFade * bhClear * uBrightness, 0.0, 1.0);
  }
`;

export const galaxyFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uAmber;
  uniform vec3 uOrchid;
  uniform vec3 uViolet;
  uniform vec3 uColdBlue;
  uniform float uMode;
  uniform float uHue;

  in float vKind;
  in float vRadiusNorm;
  in float vAlpha;
  in float vLum;
  in float vDustExtinction;

  out vec4 fragColor;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d2 = dot(c, c);
    float radialWindow = smoothstep(0.25, 0.015, d2);

    // Crisp Gaussian PSF + 4-point diffraction needles on bright hero stars
    float gauss = exp(-d2 * 34.0) * radialWindow;
    float spikeGate = smoothstep(0.84, 0.98, vLum) * radialWindow;
    float spikes =
      (exp(-abs(c.y) * 40.0) * exp(-abs(c.x) * 6.5) +
        exp(-abs(c.x) * 40.0) * exp(-abs(c.y) * 6.5)) *
      0.42 *
      spikeGate;
    float profile = gauss + spikes;

    float isSecArm = step(0.5, vKind) * step(vKind, 1.5);
    float isBulge = step(1.5, vKind) * step(vKind, 2.5);
    float isKnot = step(2.5, vKind) * step(vKind, 3.5);
    float isField = step(3.5, vKind);

    vec3 warmCore = mix(
      vec3(1.0, 0.90, 0.76),
      mix(uAmber * 0.92, vec3(0.36, 0.075, 0.032), smoothstep(0.04, 0.20, vRadiusNorm)),
      smoothstep(0.0, 0.15, vRadiusNorm)
    );

    vec3 youngArm = mix(vec3(0.78, 0.90, 1.0), mix(uColdBlue, vec3(0.78, 0.42, 0.68), 0.24), smoothstep(0.14, 0.56, vRadiusNorm));
    vec3 deepVioletEdge = mix(uViolet * 0.34, vec3(0.32, 0.07, 0.04), 0.35);

    vec3 baseCol = mix(warmCore, youngArm, smoothstep(0.08, 0.22, vRadiusNorm));
    baseCol = mix(baseCol, mix(uColdBlue * 0.65, deepVioletEdge, 0.58), isSecArm * 0.42);
    baseCol = mix(baseCol, deepVioletEdge, smoothstep(0.72, 0.98, vRadiusNorm));

    baseCol = mix(baseCol, warmCore, isBulge * 0.88);
    vec3 hiiKnotCol = mix(uOrchid * 0.62, vec3(0.96, 0.72, 0.92), smoothstep(0.7, 1.0, vLum) * 0.42);
    baseCol = mix(baseCol, hiiKnotCol, isKnot * 0.68);

    vec3 fgStarCol = mix(vec3(0.78, 0.90, 1.0), vec3(1.0, 0.86, 0.66), step(0.5, fract(vLum * 13.7)));
    baseCol = mix(baseCol, fgStarCol, isField * 0.85);

    float retro = clamp(-uMode, 0.0, 1.0) * uHue;
    float prog = clamp(uMode, 0.0, 1.0) * uHue;
    baseCol = mix(baseCol, mix(uColdBlue, vec3(0.32, 0.76, 0.94), 0.5), retro * 0.78);
    baseCol = mix(baseCol, mix(uAmber, uOrchid, 0.45), prog * 0.78);

    float outA = clamp(profile * vAlpha, 0.0, 1.0);
    if (outA < 0.002) discard;

    // AdditiveBlending (SRC_ALPHA, ONE) multiplies rgb by outA on GPU; avoid squaring profile
    fragColor = vec4(baseCol * vDustExtinction * (0.88 + 1.05 * vLum), outA);
  }
`;

export const dustLaneVertexShader = /* glsl */ `
  precision highp float;
  out vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const dustLaneFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uIntro;
  uniform float uSpin;
  in vec2 vPos;
  out vec4 fragColor;

  void main() {
    float r = length(vPos);
    float radialMask = pow(smoothstep(2.4, 5.2, r), 1.4) * pow(1.0 - smoothstep(6.8, 12.4, r), 2.0);

    float theta = atan(-vPos.y, vPos.x);
    float diffOmega = 0.064 * pow(max(1.0, r) / 2.2, -1.5);
    float dynTheta = theta - uTime * diffOmega - uSpin * pow(max(1.0, r) / 2.4, -0.78) * 0.85;

    float spiralRef = 2.45 * log(max(1.2, r) / 2.2);
    float lane = smoothstep(0.62, 0.96, sin(2.0 * (dynTheta - spiralRef) + 0.58));
    float matterVeil = (0.5 + 0.5 * cos(2.0 * (dynTheta - spiralRef) + 0.58)) * 0.09;
    float introMask = smoothstep(0.32, 0.92, uIntro);

    float alpha = max(lane * 0.45, matterVeil) * radialMask * introMask;
    if (alpha < 0.008) discard;

    vec3 darkLaneCol = vec3(0.002, 0.0016, 0.003);
    vec3 umberPinkVeil = mix(vec3(0.055, 0.015, 0.012), vec3(0.065, 0.014, 0.058), smoothstep(3.0, 10.5, r));
    vec3 col = mix(umberPinkVeil, darkLaneCol, smoothstep(0.15, 0.65, lane));
    fragColor = vec4(col, alpha);
  }
`;
