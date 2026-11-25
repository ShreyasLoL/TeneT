export const diskVertexShader = /* glsl */ `
  out vec2 vLocalPos;
  out vec3 vWorldPos;

  void main() {
    vLocalPos = position.xy;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const diskFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform float uHeat;        // 0.35 .. 1.0
  uniform float uHold;        // 0..1 seal compression
  uniform float uMode;        // -1 retrograde, 0 landing, +1 prograde
  uniform float uWarp;        // 0..1 dive progression
  uniform float uHue;         // 0..1 palette lerp
  uniform float uSimplified;  // 1 on simplified tier
  uniform vec3 uAmber;
  uniform vec3 uOrchid;
  uniform vec3 uViolet;
  uniform vec3 uColdBlue;

  in vec2 vLocalPos;
  in vec3 vWorldPos;

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
      p *= 2.05;
      a *= 0.5;
    }
    return v;
  }

  vec3 neutralRamp(float t) {
    vec3 whiteHot = vec3(1.0, 0.98, 1.0);
    vec3 rimOrchid = mix(whiteHot, uOrchid, 0.68);
    vec3 neutralSilver = vec3(0.30, 0.28, 0.35);
    vec3 darkSlate = vec3(0.035, 0.032, 0.048);
    if (t < 0.06) return mix(whiteHot, rimOrchid, t / 0.06);
    if (t < 0.22) return mix(rimOrchid, neutralSilver, (t - 0.06) / 0.16);
    return mix(neutralSilver, darkSlate, clamp((t - 0.22) / 0.78, 0.0, 1.0));
  }

  vec3 retrogradeRamp(float t) {
    // Ice-blue -> teal -> desaturated slate-violet, faint orchid thread
    vec3 iceBlue = vec3(0.34, 0.74, 0.96);
    vec3 deepTeal = vec3(0.035, 0.34, 0.44);
    vec3 desatViolet = mix(vec3(0.11, 0.10, 0.22), uOrchid * 0.25, 0.18);
    if (t < 0.28) return mix(iceBlue, deepTeal, t / 0.28);
    return mix(deepTeal, desatViolet, clamp((t - 0.28) / 0.72, 0.0, 1.0));
  }

  vec3 progradeRamp(float t) {
    // Blazing white-hot -> amber -> #E04DEA orchid
    vec3 whiteHot = vec3(1.0, 0.98, 0.92);
    if (t < 0.28) return mix(whiteHot, uAmber, t / 0.28);
    if (t < 0.68) return mix(uAmber, uOrchid, (t - 0.28) / 0.40);
    return mix(uOrchid, uViolet * 0.6, clamp((t - 0.68) / 0.32, 0.0, 1.0));
  }

  void main() {
    float diskIgnition = smoothstep(0.24, 0.88, uIntro);
    if (diskIgnition <= 0.002) discard;

    float retro = clamp(-uMode, 0.0, 1.0) * uHue;
    float prog = clamp(uMode, 0.0, 1.0) * uHue;

    // Retrograde contracts calmly inward; Prograde expands outward
    float radialWarp = 1.0 - retro * uWarp * 0.22 + prog * uWarp * 0.38;
    float r = length(vLocalPos) / max(0.35, radialWarp);
    float rMin = 0.91;
    float rMax = 5.95;
    if (r < rMin || r > rMax) discard;

    float rn = (r - rMin) / (rMax - rMin);
    float theta = atan(vLocalPos.y, vLocalPos.x);

    // Orbital direction: Retrograde reverses counter-clockwise & slows; Prograde accelerates clockwise
    float spinMult = mix(1.0, -0.55, retro) + prog * (1.8 * uWarp);
    float rRatio = max(0.3, r / rMin);
    float omega = (inversesqrt(rRatio) / rRatio) * 1.35 * spinMult;
    float swirl = theta + uTime * omega;

    float shear = 0.85;
    if (uSimplified < 0.5) {
      float spiral = fbm(vec2(cos(swirl) * 2.6 + rn * 6.5, sin(swirl) * 2.6 - uTime * 0.25));
      float ringDivisions = mix(
        0.82 + 0.18 * sin(rn * 42.0 + spiral * 3.2),
        0.35 + 0.65 * smoothstep(-0.2, 0.6, sin(rn * 72.0)),
        retro * uWarp
      );
      shear = (0.48 + 0.82 * spiral) * ringDivisions;
    } else {
      shear = 0.72 + 0.28 * sin(swirl * 3.0 + rn * 18.0);
    }

    vec3 progradeVel = normalize(vec3(-vLocalPos.y, 0.0, -vLocalPos.x) * sign(spinMult + 0.001) + vec3(0.0001));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float cosAngle = dot(progradeVel, viewDir);
    float beta = 0.44 * inversesqrt(rRatio);
    float dopplerFactor = 1.0 / max(0.38, 1.0 - beta * cosAngle);
    float beaming = clamp(pow(dopplerFactor, 2.35), 0.32, 2.65);

    float breathe = 0.88 + 0.12 * sin(uTime * 0.70);
    float falloffExp = mix(2.35, 1.55, max(retro, prog));
    float tempFalloff = pow(1.0 - rn, falloffExp) * 0.92 + 0.08;
    float rTemp = clamp(rn - cosAngle * 0.07, 0.0, 1.0);

    vec3 col = neutralRamp(rTemp);
    col = mix(col, retrogradeRamp(rTemp), retro);
    col = mix(col, progradeRamp(rTemp), prog);

    float innerRim = smoothstep(0.0, 0.032, rn);
    float outerRim = 1.0 - smoothstep(0.55, 1.0, rn);
    float edgeFade = innerRim * outerRim;

    float warpBoost = 1.0 + prog * uWarp * 1.15 - retro * uWarp * 0.12;
    float intensity =
      tempFalloff * pow(shear, 1.25) * beaming * edgeFade * (0.38 + 0.56 * uHeat + 0.48 * uHold) * breathe * diskIgnition * warpBoost;
    float alpha = clamp(intensity * 0.78, 0.0, 0.96);
    if (alpha < 0.004) discard;

    fragColor = vec4(col * intensity, alpha);
  }
`;
