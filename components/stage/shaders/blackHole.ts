export const horizonVertexShader = /* glsl */ `
  precision highp float;

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
  precision highp float;

  uniform float uIntro;
  uniform float uHold;
  uniform float uMode; // -1 retrograde, 0 landing, +1 prograde
  uniform float uWarp; // 0..1 dive progression
  uniform float uHue;  // 0..1 palette lerp
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
    float rim = pow(1.0 - ndv, 14.0);
    float doppler = clamp(-vLocalPos.x * 1.45, -1.0, 1.0);

    float retro = clamp(-uMode, 0.0, 1.0) * uHue;
    float prog = clamp(uMode, 0.0, 1.0) * uHue;
    float starMorph = smoothstep(0.38, 0.78, uWarp);

    // Base landing: pure black void sphere + razor #E04DEA / white-hot photon limb
    vec3 baseRim = mix(uOrchid, vec3(1.0, 0.97, 1.0), 0.52 + 0.28 * max(0.0, doppler));
    vec3 coldRim = mix(vec3(0.06, 0.42, 0.56), vec3(0.38, 0.74, 0.96), 0.55);
    vec3 hotRim = mix(uOrchid, mix(uAmber, vec3(1.0, 0.98, 0.92), 0.65), 0.6);
    vec3 rimCol = mix(baseRim, coldRim, retro);
    rimCol = mix(rimCol, hotRim, prog);

    vec3 col = rimCol * rim * (0.85 + uHold * 0.55) * (1.0 + 0.32 * doppler);

    // Multi-frequency non-aligned spherical turbulence for realistic stellar surfaces
    vec3 gp = vLocalPos * 7.5;
    float w1 = sin(gp.x * 1.9 + cos(gp.z * 2.4 + gp.y * 1.3));
    float w2 = sin((gp.y + gp.z) * 3.1 - sin(gp.x * 2.7 - gp.y * 2.2));
    float w3 = sin((gp.x - gp.z) * 5.2 + cos(gp.y * 4.8));
    float gran = 0.80 + 0.20 * clamp(w1 * 0.5 + w2 * 0.32 + w3 * 0.18, -1.0, 1.0);

    // Retrograde -> limb-darkened ancient ice-teal dwarf star with cool coronal glow
    vec3 oldStarCore = mix(vec3(0.012, 0.048, 0.095), vec3(0.16, 0.42, 0.58), pow(ndv, 1.45));
    vec3 retroStar = oldStarCore * gran + coldRim * pow(1.0 - ndv, 3.6) * 0.65;

    // Prograde -> young blazing star with fiery convection cells + white-hot center
    vec3 flameEdge = mix(uOrchid * 0.85, vec3(0.92, 0.28, 0.05), 0.72);
    vec3 youngStarCore = mix(flameEdge, mix(uAmber, vec3(1.0, 0.96, 0.88), pow(ndv, 1.35)), pow(ndv, 0.65));
    vec3 progStar = youngStarCore * (0.85 + 0.65 * gran) * (0.75 + 0.55 * pow(ndv, 0.85)) + hotRim * pow(1.0 - ndv, 3.2) * 0.9;

    col = mix(col, retroStar, starMorph * retro);
    col = mix(col, progStar, starMorph * prog);

    fragColor = vec4(col, horizonFade);
  }
`;

export const haloVertexShader = /* glsl */ `
  precision highp float;

  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const haloFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uIntro;
  uniform float uHold;
  uniform float uMode;
  uniform float uWarp;
  uniform float uHue;
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

    vec2 p = (vUv - 0.5) * 6.4;
    float r = length(p);
    float rH = 0.62 * (1.0 + uHold * 0.06);

    float retro = clamp(-uMode, 0.0, 1.0) * uHue;
    float prog = clamp(uMode, 0.0, 1.0) * uHue;
    float starMorph = smoothstep(0.35, 0.78, uWarp);

    if (r > 3.15) discard;
    if (r < rH * 0.96 && starMorph < 0.05) discard;
    float innerMask = mix(smoothstep(rH * 0.96, rH * 1.005, r), 1.0, starMorph);

    float vert = abs(p.y) / max(0.001, r);
    float theta = atan(p.y, p.x);

    float breathe = 0.84 + 0.16 * sin(uTime * 0.70);
    float bhRingFade = 1.0 - starMorph;
    float photonCore = exp(-pow((r - rH * 1.014) / 0.014, 2.0)) * horizonFade * bhRingFade;
    float photonSkirt = exp(-pow((r - rH * 1.022) / 0.036, 2.0)) * horizonFade * bhRingFade;

    float glintTheta = mod(uTime * 0.58, 6.2831853) - 3.1415926;
    float dAng = abs(atan(sin(theta - glintTheta), cos(theta - glintTheta)));
    float glintEnvelope = pow(max(0.0, sin(uTime * 0.64 + 0.9)), 12.0);
    float glint = exp(-dAng * dAng * 90.0) * photonCore * glintEnvelope * 2.35;

    float isUpper = step(0.0, p.y);
    float rArc = mix(rH * (1.025 + 0.28 * vert), rH * (1.04 + 0.48 * vert), isUpper);
    float wArc = mix(0.028 + 0.14 * vert, 0.034 + 0.20 * vert, isUpper);
    float arcGain = mix(0.32, 0.56, isUpper);
    float arcProfile =
      exp(-pow((r - rArc) / wArc, 2.0)) * smoothstep(0.05, 0.42, vert) * arcGain * bhRingFade;

    float dirSign = mix(1.0, -0.55, retro) + prog * 1.45;
    float rSafe = max(0.3, r);
    float omega = (inversesqrt(rSafe) / rSafe) * 0.52 * dirSign;
    float swirl = theta - uTime * omega;
    float volumetricDust = fbm(vec2(cos(swirl) * 2.6 + r * 3.0, sin(swirl) * 2.6 - uTime * 0.14));
    float turb = pow(clamp(volumetricDust, 0.0, 1.0), 1.45) * 1.35;

    float doppler = clamp(-p.x / max(0.35, r), -1.0, 1.0) * sign(dirSign);
    float beaming = pow(clamp(1.0 + 0.44 * doppler, 0.30, 1.52), 2.5);

    float rNorm = clamp((r - rH) / (rH * 0.95), 0.0, 1.0);
    vec3 orangeDeep = vec3(0.68, 0.11, 0.015);
    vec3 thermalArc = mix(vec3(1.0, 0.96, 0.90), uAmber, smoothstep(0.0, 0.36, rNorm));
    thermalArc = mix(thermalArc, orangeDeep, smoothstep(0.32, 0.88, rNorm));
    vec3 dopplerBlue = mix(uColdBlue, vec3(0.70, 0.88, 1.0), 1.0 - rNorm * 0.6);
    vec3 baseArcCol = mix(thermalArc, dopplerBlue, smoothstep(0.05, 0.85, doppler) * 0.68);
    vec3 coldArcCol = mix(vec3(0.32, 0.72, 0.92), vec3(0.05, 0.24, 0.34), smoothstep(0.0, 0.8, rNorm));
    vec3 hotArcCol = mix(vec3(1.0, 0.96, 0.88), mix(uAmber, uOrchid, 0.52), smoothstep(0.0, 0.7, rNorm));
    vec3 arcCol = mix(mix(baseArcCol, coldArcCol, retro), hotArcCol, prog);

    float lensVeil = exp(-max(0.0, r - rH) * 2.8) * pow(volumetricDust, 2.3) * 0.14 * horizonFade;
    vec3 dustCol = mix(mix(uViolet * 0.35, vec3(0.08, 0.28, 0.38), retro), uAmber * 0.65, prog);

    // #E04DEA scarce accent on photon ring edge, blending with white-hot core & Doppler blue
    vec3 basePhotonCol = mix(mix(vec3(1.0, 0.96, 0.90), uOrchid, 0.42), dopplerBlue, max(0.0, doppler) * 0.38);
    vec3 coldPhotonCol = mix(vec3(0.36, 0.78, 0.96), uOrchid, 0.08);
    vec3 hotPhotonCol = mix(vec3(1.0, 0.98, 0.92), uAmber, 0.35);
    vec3 photonCol = mix(mix(basePhotonCol, coldPhotonCol, retro), hotPhotonCol, prog);
    vec3 skirtCol = mix(mix(uOrchid, vec3(0.08, 0.38, 0.52), retro), uAmber, prog * 0.65);
    vec3 glintCol = mix(vec3(1.0, 0.99, 1.0), photonCol, 0.35);

    // Prograde ignition crisp anamorphic lens flare + atmospheric corona hugging condensed star
    float rStar = rH * mix(1.0, 0.42, starMorph);
    float progradeFlare =
      (exp(-abs(p.y) * 32.0) * exp(-abs(p.x) * 0.85) * 1.35 +
        exp(-max(0.0, r - rStar) * 3.1) * smoothstep(rStar * 0.78, rStar * 1.08, r) * 0.92) *
      starMorph *
      prog;
    float retroRings =
      exp(-abs(r - rH * 1.55) * 12.0) * (0.55 + 0.45 * sin(r * 34.0)) * starMorph * retro * 0.45;

    vec3 totalCol =
      (photonCol * photonCore * (1.85 * breathe + uHold * 0.65) * (0.82 + 0.36 * beaming) +
        skirtCol * photonSkirt * (0.72 * breathe + uHold * 0.35) +
        glintCol * glint +
        arcCol * arcProfile * turb * beaming * diskIgnition * 0.78 +
        dustCol * lensVeil) *
        innerMask +
      mix(uAmber, vec3(1.0, 0.97, 0.92), 0.55) * progradeFlare +
      coldPhotonCol * retroRings;

    float alpha = clamp(
      (photonCore * 0.98 + photonSkirt * 0.62 + glint * 0.9 + arcProfile * turb * beaming * 0.68 + lensVeil) *
        innerMask +
        progradeFlare * 0.85 +
        retroRings,
      0.0,
      1.0
    );
    if (alpha < 0.003) discard;

    fragColor = vec4(totalCol, alpha);
  }
`;
