export const horizonVertexShader = /* glsl */ `
  out vec3 vNormalView;
  out vec3 vViewDir;
  out vec3 vLocalPos;

  void main() {
    vLocalPos = position;
    vNormalView = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const horizonFragmentShader = /* glsl */ `
  uniform float uIntro;
  uniform float uHold;
  uniform float uDim;
  uniform vec3 uOrchid;
  uniform vec3 uAmber;
  uniform vec3 uColdBlue;

  in vec3 vNormalView;
  in vec3 vViewDir;
  in vec3 vLocalPos;

  out vec4 fragColor;

  void main() {
    // Event horizon fades in last during the 3.5s intro (0.58 -> 0.98)
    float horizonFade = smoothstep(0.58, 0.98, uIntro);
    if (horizonFade <= 0.002) discard;

    float ndv = clamp(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.0, 1.0);
    // Ultra-thin grazing limb edge on the pure-black Schwarzschild sphere
    float rim = pow(1.0 - ndv, 11.0);

    float doppler = clamp(-vLocalPos.x * 1.15, -1.0, 1.0);
    vec3 rimCol = mix(uOrchid, uAmber, 0.35 * max(0.0, -doppler));
    rimCol = mix(rimCol, mix(vec3(1.0, 0.96, 1.0), uColdBlue, 0.22), max(0.0, doppler) * 0.45);

    vec3 col = rimCol * rim * (0.55 + uHold * 0.35) * (1.0 + 0.35 * doppler) * uDim;
    fragColor = vec4(col, horizonFade);
  }
`;

export const haloVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const haloFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform float uHold;
  uniform float uDim;
  uniform vec3 uAmber;
  uniform vec3 uOrchid;
  uniform vec3 uViolet;
  uniform vec3 uColdBlue;

  in vec2 vUv;

  out vec4 fragColor;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p *= 2.04;
      a *= 0.5;
    }
    return v;
  }

  vec3 blackbodyRamp(float t) {
    vec3 whiteHot = vec3(1.0, 0.96, 0.92);
    if (t < 0.22) return mix(whiteHot, uAmber, t / 0.22);
    if (t < 0.50) return mix(uAmber, uOrchid, (t - 0.22) / 0.28);
    if (t < 0.76) return mix(uOrchid, uViolet, (t - 0.50) / 0.26);
    return mix(uViolet, uColdBlue, clamp((t - 0.76) / 0.24, 0.0, 1.0));
  }

  void main() {
    float diskIgnition = smoothstep(0.36, 0.92, uIntro);
    float horizonFade = smoothstep(0.58, 0.98, uIntro);
    if (diskIgnition <= 0.002) discard;

    vec2 p = (vUv - 0.5) * 6.4;
    float r = length(p);
    float rH = 0.86 * (1.0 + uHold * 0.06);

    if (r < rH * 0.86 || r > 3.15) discard;
    float innerMask = smoothstep(rH * 0.86, rH * 0.99, r);

    float vert = abs(p.y) / max(0.001, r);
    float theta = atan(p.y, p.x);

    // 1. Razor-thin lensed photon-ring glow hugging the Schwarzschild shadow
    float photon = exp(-pow((r - rH * 1.018) / 0.022, 2.0)) * horizonFade;

    // 2. Relativistic lensed "back of the disk" arcs above and below the event horizon
    float isUpper = step(0.0, p.y);
    float rArc = mix(rH * (1.03 + 0.30 * vert), rH * (1.05 + 0.54 * vert), isUpper);
    float wArc = mix(0.036 + 0.17 * vert, 0.044 + 0.26 * vert, isUpper);
    float arcGain = mix(0.42, 0.72, isUpper);
    float arcProfile = exp(-pow((r - rArc) / wArc, 2.0)) * smoothstep(0.04, 0.42, vert) * arcGain;

    // Keplerian turbulence along lensed arcs
    float rSafe = max(0.3, r);
    float omega = (inversesqrt(rSafe) / rSafe) * 0.9;
    float swirl = theta - uTime * omega;
    float turb = 0.58 + 0.68 * fbm(vec2(cos(swirl) * 2.8 + r * 3.2, sin(swirl) * 2.8 - uTime * 0.28));

    // Doppler beaming: approaching left side (-p.x > 0) brighter and blue-shifted
    float doppler = clamp(-p.x / max(0.35, r), -1.0, 1.0);
    float beaming = pow(clamp(1.0 + 0.42 * doppler, 0.38, 1.48), 2.35);

    float rNorm = clamp((r - rH) / (rH * 1.02), 0.0, 1.0);
    float rTemp = clamp(rNorm - doppler * 0.18, 0.0, 1.0);
    vec3 arcCol = blackbodyRamp(rTemp);
    arcCol = mix(arcCol, mix(vec3(0.85, 0.94, 1.0), uColdBlue, 0.35), max(0.0, doppler) * 0.32);

    float corona = exp(-max(0.0, r - rH) * 2.8) * 0.08 * horizonFade;
    vec3 coronaCol = mix(uViolet, uColdBlue, 0.55);

    vec3 photonCol = mix(vec3(1.0, 0.95, 0.92), uOrchid, 0.38);
    vec3 totalCol =
      (photonCol * photon * (1.08 + uHold * 0.38) * (0.78 + 0.38 * beaming) +
        arcCol * arcProfile * turb * beaming * diskIgnition * 0.88 +
        coronaCol * corona) *
      innerMask *
      uDim;

    float alpha = clamp((photon * 0.92 + arcProfile * beaming * 0.74 + corona) * innerMask, 0.0, 1.0) * mix(0.65, 1.0, uDim);
    if (alpha < 0.003) discard;

    fragColor = vec4(totalCol, alpha);
  }
`;
