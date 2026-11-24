export const diskVertexShader = /* glsl */ `
  out vec2 vLocalPos;
  out vec3 vWorldPos;

  void main() {
    vLocalPos = uv * 2.0 - 1.0;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const diskFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;        // 0.15 ember .. 1.0 bright
  uniform float uHold;        // 0..1 seal compression
  uniform float uSimplified;  // 1 on L3 low tier
  uniform vec3 uOrchidAbyss;
  uniform vec3 uOrchid;
  uniform vec3 uOrchidHot;

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
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float r = length(vLocalPos);
    float rMin = 0.34;
    float rMax = 0.98;
    if (r < rMin || r > rMax) discard;

    float rn = (r - rMin) / (rMax - rMin);
    float theta = atan(vLocalPos.y, vLocalPos.x);

    // Temperature falloff T ~ r^(-0.75)
    float temp = pow(max(0.28, r / rMin), -0.75);

    // Differential Keplerian plasma shear
    float shear = 1.0;
    if (uSimplified < 0.5) {
      float omega = pow(max(0.32, r), -1.5) * 0.55;
      float swirl = theta + uTime * omega;
      shear = 0.55 + 0.75 * fbm(vec2(cos(swirl) * 3.0 + rn * 5.0, sin(swirl) * 3.0 - uTime * 0.3));
    }

    // Relativistic Doppler beaming: approaching side brighter than receding (~6-8:1)
    vec3 vdir = normalize(vec3(-vLocalPos.y, 0.0, vLocalPos.x));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float beta = 0.42 * pow(max(0.35, r / rMin), -0.5);
    float doppler = 1.0 / max(0.35, 1.0 - beta * dot(vdir, viewDir));
    float beaming = pow(doppler, 2.5);

    float edgeFade = smoothstep(0.0, 0.08, rn) * (1.0 - smoothstep(0.62, 1.0, rn));
    float intensity = temp * shear * beaming * edgeFade * (0.28 + 0.88 * uHeat + 0.45 * uHold);

    vec3 col = mix(uOrchidAbyss, uOrchid, clamp(intensity * 0.85, 0.0, 1.0));
    col = mix(col, uOrchidHot, smoothstep(0.75, 1.65, intensity));

    fragColor = vec4(col * intensity, clamp(intensity * 0.72, 0.0, 0.95));
  }
`;
