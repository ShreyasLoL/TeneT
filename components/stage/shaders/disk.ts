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

  vec3 blackbodyRamp(float t) {
    vec3 whiteHot = vec3(1.0, 0.98, 1.0);
    if (t < 0.18) return mix(whiteHot, uAmber, t / 0.18);
    if (t < 0.45) return mix(uAmber, uOrchid, (t - 0.18) / 0.27);
    if (t < 0.74) return mix(uOrchid, uViolet, (t - 0.45) / 0.29);
    return mix(uViolet, uColdBlue, clamp((t - 0.74) / 0.26, 0.0, 1.0));
  }

  void main() {
    float diskIgnition = smoothstep(0.24, 0.88, uIntro);
    if (diskIgnition <= 0.002) discard;

    float r = length(vLocalPos);
    float rMin = 0.91;
    float rMax = 3.55;
    if (r < rMin || r > rMax) discard;

    float rn = (r - rMin) / (rMax - rMin);
    float theta = atan(vLocalPos.y, vLocalPos.x);

    // Keplerian angular velocity: inner disk orbits substantially faster (omega ~ r^-1.5)
    float rRatio = max(0.3, r / rMin);
    float omega = (inversesqrt(rRatio) / rRatio) * 1.35;
    float swirl = theta + uTime * omega;

    float shear = 0.85;
    if (uSimplified < 0.5) {
      float spiral = fbm(vec2(cos(swirl) * 2.6 + rn * 6.5, sin(swirl) * 2.6 - uTime * 0.25));
      float lanes = 0.82 + 0.18 * sin(rn * 42.0 + spiral * 3.2);
      shear = (0.48 + 0.82 * spiral) * lanes;
    } else {
      shear = 0.72 + 0.28 * sin(swirl * 3.0 + rn * 18.0);
    }

    // Relativistic Doppler beaming: prograde tangent velocity vs view ray
    // Plane is rotated -PI/2 around X, so local (x, y) maps to world (x, 0, -y);
    // Left side (x < 0) approaches camera (+Z), right side (x > 0) recedes (-Z)
    vec3 progradeVel = normalize(vec3(-vLocalPos.y, 0.0, -vLocalPos.x) + vec3(0.0001));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float cosAngle = dot(progradeVel, viewDir);
    float beta = 0.44 * inversesqrt(rRatio);
    float dopplerFactor = 1.0 / max(0.38, 1.0 - beta * cosAngle);
    float beaming = clamp(pow(dopplerFactor, 2.35), 0.32, 2.65);

    // Temperature falloff + Doppler spectral shift (approaching side hotter & bluer)
    float tempFalloff = pow(1.0 - rn, 1.35) * 0.85 + 0.15;
    float rTemp = clamp(rn - cosAngle * 0.15, 0.0, 1.0);
    vec3 col = blackbodyRamp(rTemp);
    col = mix(col, vec3(0.76, 0.90, 1.06), max(0.0, cosAngle) * 0.32);

    float innerRim = smoothstep(0.0, 0.055, rn);
    float outerRim = 1.0 - smoothstep(0.52, 1.0, rn);
    float edgeFade = innerRim * outerRim;

    float intensity = tempFalloff * shear * beaming * edgeFade * (0.42 + 0.58 * uHeat + 0.42 * uHold) * diskIgnition;
    float alpha = clamp(intensity * 0.78, 0.0, 0.96);
    if (alpha < 0.004) discard;

    fragColor = vec4(col * intensity, alpha);
  }
`;
