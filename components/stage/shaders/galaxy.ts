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

  const float SPIRAL_WINDING = 2.65;

  void main() {
    float rBase = aSeed.x;
    float theta0 = aSeed.y;
    float yOff = aSeed.z;
    float rand = aSeed.w;
    float kind = aMeta.x;
    float lum = aMeta.y;

    float retro = clamp(-uMode, 0.0, 1.0) * uWarp;
    float prog = clamp(uMode, 0.0, 1.0) * uWarp;

    // Differential cosmic rotation: inner orbits faster, very slow overall + intro time-lapse uSpin
    float rSafe = max(1.2, rBase);
    float diffOmega = 0.055 * pow(rSafe / 3.2, -1.12);
    float modeSpin = mix(1.0, -1.8, retro) + prog * 3.2;
    float theta = theta0 + uTime * diffOmega * modeSpin + uSpin * pow(rSafe / 3.2, -0.78) * 0.85;

    // Long-exposure intro sweep: inner bulge condenses first, outer spiral arms sweep outward
    float rNorm = clamp((rBase - 1.35) / 24.15, 0.0, 1.0);
    float sweepProgress = smoothstep(rNorm * 0.34, 0.58 + rNorm * 0.42, uIntro);

    float r = rBase * mix(0.32, 1.0, sweepProgress);
    r = r * (1.0 - retro * 0.24 + prog * 0.36);

    vec3 galPos = vec3(r * cos(theta), yOff * sweepProgress, r * sin(theta));
    vec3 finalPos = mix(position, galPos, smoothstep(0.0, 0.75, 1.0 - uTick * 0.85) * sweepProgress);

    // Analytical absorbing dust lane along the inner concave shock front of the 2 main spiral arms
    float spiralRef = SPIRAL_WINDING * log(max(1.6, r) / 2.8);
    float armPhase = sin(2.0 * (theta - spiralRef) + 0.58);
    float inArmZone = smoothstep(2.8, 4.5, r) * (1.0 - smoothstep(16.0, 23.0, r));
    float isDiskPop = 1.0 - step(3.5, kind); // field/foreground stars above plane bypass dust lane
    float dustMask = smoothstep(0.58, 0.94, armPhase) * inArmZone * isDiskPop;
    float extinction = mix(1.0, 0.12, dustMask * (1.0 - step(2.5, kind) * step(kind, 3.5) * 0.35));

    // Per-particle stellar twinkle
    float twinkle = 0.84 + 0.16 * sin(uTime * (1.2 + rand * 3.4) + rand * 6.2831853);

    vec4 mvPos = modelViewMatrix * vec4(finalPos, 1.0);
    float depthScale = clamp(10.8 / max(1.6, -mvPos.z), 0.35, 3.2);

    float isKnot = step(2.5, kind) * step(kind, 3.5);
    float isHeroStar = step(3.5, kind) * step(0.92, lum);
    float ptBase = 1.15 + lum * 1.45 + isKnot * 1.65 + isHeroStar * 2.6;

    gl_PointSize = clamp(ptBase * depthScale * uDpr, 0.85 * uDpr, 8.5 * uDpr);
    gl_Position = projectionMatrix * mvPos;

    float outerFade = 1.0 - smoothstep(0.68, 1.0, rNorm);
    float introFade = smoothstep(0.04, 0.48 + rNorm * 0.38, uIntro);

    vKind = kind;
    vRadiusNorm = rNorm;
    vLum = lum;
    vDustExtinction = extinction;
    vAlpha = clamp((0.18 + 0.68 * lum) * twinkle * extinction * outerFade * introFade * uBrightness, 0.0, 1.0);
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
    if (vAlpha <= 0.004) discard;

    vec2 c = gl_PointCoord - vec2(0.5);
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;

    float core = exp(-d2 * 18.0);

    float isBulge = step(1.5, vKind) * step(vKind, 2.5);
    float isKnot = step(2.5, vKind) * step(vKind, 3.5);
    float isField = step(3.5, vKind);

    vec3 warmCore = mix(vec3(1.0, 0.92, 0.78), uAmber, smoothstep(0.0, 0.26, vRadiusNorm));
    vec3 coldArm = mix(vec3(0.76, 0.88, 1.0), uColdBlue, smoothstep(0.12, 0.68, vRadiusNorm));
    vec3 outerAbyss = uViolet * 0.28;

    vec3 baseCol = mix(warmCore, coldArm, smoothstep(0.08, 0.34, vRadiusNorm));
    baseCol = mix(baseCol, outerAbyss, smoothstep(0.64, 1.0, vRadiusNorm));
    baseCol = mix(baseCol, warmCore, isBulge * 0.78);
    baseCol = mix(baseCol, mix(uOrchid, vec3(1.0, 0.78, 0.96), 0.28), isKnot * 0.92);
    baseCol = mix(baseCol, mix(vec3(0.92, 0.95, 1.0), warmCore, 0.35), isField * 0.65);

    float retro = clamp(-uMode, 0.0, 1.0) * uHue;
    float prog = clamp(uMode, 0.0, 1.0) * uHue;
    baseCol = mix(baseCol, mix(uColdBlue, vec3(0.32, 0.76, 0.94), 0.5), retro * 0.78);
    baseCol = mix(baseCol, mix(uAmber, uOrchid, 0.45), prog * 0.78);

    fragColor = vec4(baseCol * core * vDustExtinction * (0.65 + 0.75 * vLum), core * vAlpha);
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
    if (r < 2.5 || r > 20.5) discard;

    // Plane rotated -PI/2 around X maps local (x, y) to galaxy (x, 0, -y)
    float theta = atan(-vPos.y, vPos.x);
    float diffOmega = 0.055 * pow(max(1.2, r) / 3.2, -1.12);
    float dynTheta = theta - uTime * diffOmega - uSpin * pow(max(1.2, r) / 3.2, -0.78) * 0.85;

    float spiralRef = 2.65 * log(r / 2.8);
    float lane = smoothstep(0.62, 0.98, sin(2.0 * (dynTheta - spiralRef) + 0.58));
    float radialMask = smoothstep(2.5, 4.4, r) * (1.0 - smoothstep(13.5, 20.5, r));
    float introMask = smoothstep(0.32, 0.92, uIntro);

    float alpha = lane * radialMask * introMask * 0.62;
    if (alpha < 0.008) discard;

    // Pure dark absorbing dust lane (near-zero RGB occludes stars behind the inner spiral edge)
    fragColor = vec4(vec3(0.002, 0.0016, 0.003), alpha);
  }
`;
