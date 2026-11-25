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

  // Branchless 3D gradient hash + curl clumping in vertex shader (0 CPU per-frame work)
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0;
  }

  float gradNoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(dot(hash33(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)),
            dot(hash33(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
        mix(dot(hash33(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)),
            dot(hash33(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x),
        u.y
      ),
      mix(
        mix(dot(hash33(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)),
            dot(hash33(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
        mix(dot(hash33(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)),
            dot(hash33(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x),
        u.y
      ),
      u.z
    );
  }

  vec3 armCurlOffset(vec3 p, float t) {
    float n1 = gradNoise3(p * 0.42 + vec3(0.0, t, 0.0));
    float n2 = gradNoise3(p.yzx * 0.42 - vec3(t * 0.7, 0.0, 0.0));
    float n3 = gradNoise3(p.zxy * 0.42 + vec3(0.0, 0.0, t * 0.5));
    return vec3(n2 - n3, (n3 - n1) * 0.25, n1 - n2);
  }

  void main() {
    float rBase = aSeed.x;
    float theta0 = aSeed.y;
    float yOff = aSeed.z;
    float rand = aSeed.w;
    float kind = aMeta.x;
    float lum = aMeta.y;

    float retro = clamp(-uMode, 0.0, 1.0) * uWarp;
    float prog = clamp(uMode, 0.0, 1.0) * uWarp;

    float rSafe = max(1.2, rBase);
    float diffOmega = 0.055 * pow(rSafe / 3.2, -1.12);
    float modeSpin = mix(1.0, -1.8, retro) + prog * 3.2;
    float theta = theta0 + uTime * diffOmega * modeSpin + uSpin * pow(rSafe / 3.2, -0.78) * 0.85;

    float rNorm = clamp((rBase - 1.35) / 24.15, 0.0, 1.0);
    float sweepProgress = smoothstep(rNorm * 0.34, 0.58 + rNorm * 0.42, uIntro);

    float r = rBase * mix(0.32, 1.0, sweepProgress);
    r = r * (1.0 - retro * 0.24 + prog * 0.36);

    vec3 galPos = vec3(r * cos(theta), yOff * sweepProgress, r * sin(theta));
    // Vertex-shader curl clumping along spiral arms & HII regions
    float clumpMask = (1.0 - step(3.5, kind)) * smoothstep(2.2, 6.0, r) * sweepProgress;
    galPos += armCurlOffset(galPos * 0.65, uTime * 0.04) * (0.38 * clumpMask);

    vec3 finalPos = mix(position, galPos, smoothstep(0.0, 0.75, 1.0 - uTick * 0.85) * sweepProgress);

    float spiralRef = SPIRAL_WINDING * log(max(1.6, r) / 2.8);
    float armPhase = sin(2.0 * (theta - spiralRef) + 0.58);
    float inArmZone = smoothstep(2.8, 4.5, r) * (1.0 - smoothstep(16.0, 23.0, r));
    float isDiskPop = 1.0 - step(3.5, kind);
    float dustMask = smoothstep(0.58, 0.94, armPhase) * inArmZone * isDiskPop;
    float extinction = mix(1.0, 0.10, dustMask * (1.0 - step(2.5, kind) * step(kind, 3.5) * 0.35));

    float twinkle = 0.84 + 0.16 * sin(uTime * (1.2 + rand * 3.4) + rand * 6.2831853);

    vec4 mvPos = modelViewMatrix * vec4(finalPos, 1.0);
    float depthScale = clamp(10.8 / max(1.6, -mvPos.z), 0.35, 3.2);

    float isKnot = step(2.5, kind) * step(kind, 3.5);
    float isHeroStar = step(3.5, kind) * step(0.92, lum);
    float ptBase = 1.25 + lum * 1.55 + isKnot * 1.75 + isHeroStar * 3.8;

    gl_PointSize = clamp(ptBase * depthScale * uDpr, 0.9 * uDpr, 10.5 * uDpr);
    gl_Position = projectionMatrix * mvPos;

    float outerFade = 1.0 - smoothstep(0.68, 1.0, rNorm);
    float introFade = smoothstep(0.04, 0.48 + rNorm * 0.38, uIntro);

    vKind = kind;
    vRadiusNorm = rNorm;
    vLum = lum;
    vDustExtinction = extinction;
    vAlpha = clamp((0.18 + 0.70 * lum) * twinkle * extinction * outerFade * introFade * uBrightness, 0.0, 1.0);
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

    // Soft Gaussian falloff + subtle 4-point diffraction spikes on the brightest stars
    float gauss = exp(-d2 * 22.0) * radialWindow;
    float spikeGate = smoothstep(0.84, 0.98, vLum) * radialWindow;
    float spikes =
      (exp(-abs(c.y) * 36.0) * exp(-abs(c.x) * 6.0) +
        exp(-abs(c.x) * 36.0) * exp(-abs(c.y) * 6.0)) *
      0.42 *
      spikeGate;
    float profile = gauss + spikes;

    float isSecArm = step(0.5, vKind) * step(vKind, 1.5);
    float isBulge = step(1.5, vKind) * step(vKind, 2.5);
    float isKnot = step(2.5, vKind) * step(vKind, 3.5);
    float isField = step(3.5, vKind);

    vec3 warmCore = mix(
      vec3(1.0, 0.92, 0.72),
      mix(uAmber, vec3(0.68, 0.13, 0.018), smoothstep(0.06, 0.28, vRadiusNorm)),
      smoothstep(0.0, 0.22, vRadiusNorm)
    );

    vec3 youngArm = mix(vec3(0.76, 0.90, 1.0), uColdBlue, smoothstep(0.08, 0.54, vRadiusNorm));
    vec3 deepVioletEdge = uViolet * 0.28;

    vec3 baseCol = mix(warmCore, youngArm, smoothstep(0.06, 0.24, vRadiusNorm));
    baseCol = mix(baseCol, mix(uColdBlue * 0.68, deepVioletEdge, 0.62), isSecArm * 0.42);
    baseCol = mix(baseCol, deepVioletEdge, smoothstep(0.62, 0.98, vRadiusNorm));

    baseCol = mix(baseCol, warmCore, isBulge * 0.88);
    vec3 hiiKnotCol = mix(uOrchid, vec3(1.0, 0.76, 0.96), smoothstep(0.7, 1.0, vLum) * 0.35);
    baseCol = mix(baseCol, hiiKnotCol, isKnot * 0.96);

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
    float radialMask = smoothstep(2.5, 4.4, r) * (1.0 - smoothstep(13.5, 20.5, r));

    float theta = atan(-vPos.y, vPos.x);
    float diffOmega = 0.055 * pow(max(1.2, r) / 3.2, -1.12);
    float dynTheta = theta - uTime * diffOmega - uSpin * pow(max(1.2, r) / 3.2, -0.78) * 0.85;

    float spiralRef = 2.65 * log(max(1.2, r) / 2.8);
    float lane = smoothstep(0.62, 0.98, sin(2.0 * (dynTheta - spiralRef) + 0.58));
    float introMask = smoothstep(0.32, 0.92, uIntro);

    float alpha = lane * radialMask * introMask * 0.64;
    if (alpha < 0.008) discard;

    fragColor = vec4(vec3(0.002, 0.0016, 0.003), alpha);
  }
`;
