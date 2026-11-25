export const diskVertexShader = /* glsl */ `
  precision highp float;

  out vec2 vLocalPos;
  out vec3 vWorldPos;
  out vec3 vAxisX;
  out vec3 vAxisY;

  void main() {
    vLocalPos = position.xy;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vAxisX = (modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
    vAxisY = (modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const diskFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uIntro;
  uniform float uSpin;
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
  in vec3 vAxisX;
  in vec3 vAxisY;

  out vec4 fragColor;

  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
  }

  // 2D Simplex-style gradient noise + curl turbulence (branchless)
  float gradNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    ) * 0.5 + 0.5;
  }

  float curlFbm(vec2 p) {
    float v = 0.0;
    float a = 0.52;
    for (int i = 0; i < 3; i++) {
      float n = gradNoise(p);
      v += a * n;
      p = p * 2.07 + vec2(n * 0.65, -n * 0.45);
      a *= 0.5;
    }
    return v;
  }

  // Analytical Planck-like blackbody temperature curve (Tnorm: 0.1 ember -> 1.0 white-hot -> >1.25 Doppler blue)
  vec3 blackbodyPlanck(float tObs) {
    vec3 emberRed = vec3(0.14, 0.015, 0.004);
    vec3 orangeDeep = vec3(0.72, 0.12, 0.016);
    vec3 whiteHot = vec3(1.0, 0.97, 0.92);
    vec3 dopplerBlue = mix(uColdBlue, vec3(0.72, 0.90, 1.0), clamp((tObs - 1.0) * 0.85, 0.0, 1.0));

    vec3 col = mix(emberRed, orangeDeep, smoothstep(0.10, 0.42, tObs));
    col = mix(col, uAmber, smoothstep(0.38, 0.72, tObs));
    col = mix(col, whiteHot, smoothstep(0.68, 1.04, tObs));
    col = mix(col, dopplerBlue, smoothstep(1.02, 1.48, tObs));
    return col;
  }

  vec3 retrogradeRamp(float t) {
    vec3 iceBlue = vec3(0.34, 0.74, 0.96);
    vec3 deepTeal = vec3(0.035, 0.34, 0.44);
    vec3 desatViolet = mix(vec3(0.11, 0.10, 0.22), uOrchid * 0.25, 0.18);
    vec3 inner = mix(iceBlue, deepTeal, clamp(t / 0.28, 0.0, 1.0));
    vec3 outer = mix(deepTeal, desatViolet, clamp((t - 0.28) / 0.72, 0.0, 1.0));
    return mix(inner, outer, step(0.28, t));
  }

  vec3 progradeRamp(float t) {
    vec3 whiteHot = vec3(1.0, 0.98, 0.92);
    vec3 inner = mix(whiteHot, uAmber, clamp(t / 0.28, 0.0, 1.0));
    vec3 mid = mix(uAmber, uOrchid, clamp((t - 0.28) / 0.40, 0.0, 1.0));
    vec3 outer = mix(uOrchid, uViolet * 0.6, clamp((t - 0.68) / 0.32, 0.0, 1.0));
    return mix(mix(inner, mid, step(0.28, t)), outer, step(0.68, t));
  }

  void main() {
    float diskIgnition = smoothstep(0.24, 0.88, uIntro);

    float retro = clamp(-uMode, 0.0, 1.0) * uHue;
    float prog = clamp(uMode, 0.0, 1.0) * uHue;

    float radialWarp = 1.0 - retro * uWarp * 0.22 + prog * uWarp * 0.38;
    float r = length(vLocalPos) / max(0.35, radialWarp);
    float rMin = 1.15;
    float rMax = 5.25;
    if (diskIgnition <= 0.002 || r < rMin || r > rMax) discard;

    float rn = (r - rMin) / (rMax - rMin);
    float theta = atan(vLocalPos.y, vLocalPos.x);

    float spinMult = mix(1.0, -0.55, retro) + prog * (1.8 * uWarp);
    float rRatio = max(0.3, r / rMin);
    float omega = (inversesqrt(rRatio) / rRatio) * 1.35 * spinMult;
    float swirl = theta + uTime * omega + uSpin * (inversesqrt(rRatio) * 0.85);

    float spiral = curlFbm(vec2(cos(swirl) * 2.8 + rn * 7.2, sin(swirl) * 2.8 - uTime * 0.22));
    float ringDivisions = mix(
      0.82 + 0.18 * sin(rn * 44.0 + spiral * 3.4),
      0.35 + 0.65 * smoothstep(-0.2, 0.6, sin(rn * 72.0)),
      retro * uWarp
    );
    float fullShear = (0.52 + 0.85 * spiral) * ringDivisions;
    float simpleShear = 0.76 + 0.24 * sin(swirl * 3.0 + rn * 18.0);
    float shear = mix(fullShear, simpleShear, step(0.5, uSimplified));

    // World-space orbital tangent from vertex-transformed plane axes for exact Doppler beaming under 3D tilt
    float dirSign = sign(spinMult + 0.001);
    vec3 worldTangent = normalize((-vLocalPos.y * vAxisX + vLocalPos.x * vAxisY) * dirSign + vec3(1e-5));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float cosAngle = dot(worldTangent, viewDir);

    // Relativistic orbital beta, Lorentz gamma, Doppler factor D, and gravitational redshift gGrav
    float beta = 0.46 * inversesqrt(rRatio);
    float gamma = inversesqrt(max(0.22, 1.0 - beta * beta));
    float dopplerD = 1.0 / max(0.35, gamma * (1.0 - beta * cosAngle));
    float gGrav = sqrt(clamp(1.0 - 0.42 * (rMin / r), 0.38, 1.0));
    float gTotal = dopplerD * gGrav;
    float beaming = clamp(pow(gTotal, 2.35) * 1.26, 0.28, 2.75);

    // Shakura-Sunyaev emitted temperature T(r) ~ (rMin / r)^0.75 shifted by gTotal
    float breathe = 0.88 + 0.12 * sin(uTime * 0.70);
    float tEmit = pow(clamp(rMin / r, 0.0, 1.0), 0.68) * 1.08;
    float tObs = tEmit * mix(1.0, gTotal, 0.88);
    float tempFalloff = pow(1.0 - rn, 1.65) * 0.92 + 0.08;

    vec3 col = blackbodyPlanck(tObs);
    col = mix(col, retrogradeRamp(rn), retro);
    col = mix(col, progradeRamp(rn), prog);

    float innerRim = smoothstep(0.0, 0.036, rn);
    float outerRim = 1.0 - smoothstep(0.52, 1.0, rn);
    float edgeFade = innerRim * outerRim;

    float warpBoost = 1.0 + prog * uWarp * 1.15 - retro * uWarp * 0.12;
    float intensity =
      tempFalloff * shear * beaming * edgeFade * (0.46 + 0.58 * uHeat + 0.48 * uHold) * breathe * diskIgnition * warpBoost;
    float alpha = clamp(intensity * 0.88, 0.0, 0.96);
    if (alpha < 0.004) discard;

    // AdditiveBlending (SRC_ALPHA, ONE) multiplies rgb by alpha on GPU; keep rgb linear in col
    fragColor = vec4(col * 1.38, alpha);
  }
`;
