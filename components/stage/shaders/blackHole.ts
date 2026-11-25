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
  uniform vec3 uOrchid;
  uniform vec3 uAmber;
  uniform vec3 uColdBlue;

  in vec3 vNormalView;
  in vec3 vViewDir;
  in vec3 vLocalPos;

  out vec4 fragColor;

  void main() {
    float horizonFade = smoothstep(0.58, 0.98, uIntro);
    if (horizonFade <= 0.002) discard;

    float ndv = clamp(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.0, 1.0);
    // Razor-sharp grazing photon edge against a pure-abyssal event horizon shadow
    float rim = pow(1.0 - ndv, 14.0);

    float doppler = clamp(-vLocalPos.x * 1.15, -1.0, 1.0);
    vec3 rimCol = mix(uOrchid, vec3(1.0, 0.97, 1.0), 0.52 + 0.28 * max(0.0, doppler));

    vec3 col = rimCol * rim * (0.85 + uHold * 0.55) * (1.0 + 0.32 * doppler);
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

  void main() {
    float diskIgnition = smoothstep(0.36, 0.92, uIntro);
    float horizonFade = smoothstep(0.58, 0.98, uIntro);
    if (diskIgnition <= 0.002) discard;

    vec2 p = (vUv - 0.5) * 7.6;
    float r = length(p);
    float rH = 0.86 * (1.0 + uHold * 0.06);

    if (r < rH * 0.88 || r > 3.7) discard;
    float innerMask = smoothstep(rH * 0.88, rH * 0.995, r);

    float vert = abs(p.y) / max(0.001, r);
    float theta = atan(p.y, p.x);

    // Slow 9-second breathing of photon ring intensity (life without motion-tracking)
    float breathe = 0.84 + 0.16 * sin(uTime * 0.70);

    // 1. Blown-bright photon-ring edge (#E04DEA orchid -> white-hot core) against pure void
    float photonCore = exp(-pow((r - rH * 1.014) / 0.014, 2.0)) * horizonFade;
    float photonSkirt = exp(-pow((r - rH * 1.022) / 0.036, 2.0)) * horizonFade;

    // Occasional rare bright glint travelling along the photon ring
    float glintTheta = mod(uTime * 0.58, 6.2831853) - 3.1415926;
    float dAng = abs(atan(sin(theta - glintTheta), cos(theta - glintTheta)));
    float glintEnvelope = pow(max(0.0, sin(uTime * 0.64 + 0.9)), 12.0);
    float glint = exp(-dAng * dAng * 90.0) * photonCore * glintEnvelope * 2.35;

    // 2. High-contrast lensed arcs + faint volumetric dust drifting slowly through the lensing
    float isUpper = step(0.0, p.y);
    float rArc = mix(rH * (1.025 + 0.28 * vert), rH * (1.04 + 0.48 * vert), isUpper);
    float wArc = mix(0.028 + 0.14 * vert, 0.034 + 0.20 * vert, isUpper);
    float arcGain = mix(0.32, 0.56, isUpper);
    float arcProfile = exp(-pow((r - rArc) / wArc, 2.0)) * smoothstep(0.05, 0.42, vert) * arcGain;

    float rSafe = max(0.3, r);
    float omega = (inversesqrt(rSafe) / rSafe) * 0.52;
    float swirl = theta - uTime * omega;
    float volumetricDust = fbm(vec2(cos(swirl) * 2.6 + r * 3.0, sin(swirl) * 2.6 - uTime * 0.14));
    float turb = pow(clamp(volumetricDust, 0.0, 1.0), 1.45) * 1.35;

    float doppler = clamp(-p.x / max(0.35, r), -1.0, 1.0);
    float beaming = pow(clamp(1.0 + 0.44 * doppler, 0.30, 1.52), 2.5);

    // 60/30/10 accent discipline: neutral silver/slate arcs, #E04DEA strictly on photon ring edge
    float rNorm = clamp((r - rH) / (rH * 0.85), 0.0, 1.0);
    vec3 neutralArc = mix(vec3(0.72, 0.70, 0.78), vec3(0.11, 0.10, 0.14), smoothstep(0.0, 0.75, rNorm));
    vec3 arcCol = mix(uOrchid * 0.75, neutralArc, smoothstep(0.0, 0.22, rNorm));

    // Faint volumetric dust wisps drifting across the lensing field
    float lensVeil = exp(-max(0.0, r - rH) * 2.6) * pow(volumetricDust, 2.2) * 0.16 * horizonFade;
    vec3 dustCol = vec3(0.20, 0.19, 0.25);

    vec3 photonCol = mix(uOrchid, vec3(1.0, 0.98, 1.0), 0.62);
    vec3 glintCol = mix(vec3(1.0, 0.99, 1.0), uOrchid, 0.25);

    vec3 totalCol =
      (photonCol * photonCore * (1.85 * breathe + uHold * 0.65) * (0.82 + 0.36 * beaming) +
        uOrchid * photonSkirt * (0.72 * breathe + uHold * 0.35) +
        glintCol * glint +
        arcCol * arcProfile * turb * beaming * diskIgnition * 0.78 +
        dustCol * lensVeil) *
      innerMask;

    float alpha = clamp(
      (photonCore * 0.98 + photonSkirt * 0.62 + glint * 0.9 + arcProfile * turb * beaming * 0.68 + lensVeil) *
        innerMask,
      0.0,
      1.0
    );
    if (alpha < 0.003) discard;

    fragColor = vec4(totalCol, alpha);
  }
`;
