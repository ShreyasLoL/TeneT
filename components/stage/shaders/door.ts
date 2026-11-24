export const doorVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const doorFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uFlowDir;   // -1 retrograde (left), +1 prograde (right)
  uniform float uIntensity; // 0.3 .. 1.0
  uniform float uHover;     // 0 .. 1
  uniform float uSealed;    // 1 if bricked
  uniform vec3 uOrchidAbyss;
  uniform vec3 uOrchid;
  uniform vec3 uOrchidHot;

  in vec2 vUv;

  out vec4 fragColor;

  float sdArch(vec2 p, vec2 b) {
    vec2 q = p;
    q.y -= 0.15;
    float rect = max(abs(q.x) - b.x, abs(q.y + 0.15) - b.y);
    float cap = length(vec2(p.x, max(0.0, p.y - 0.18))) - b.x;
    return min(rect, cap);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= 0.65;

    float d = sdArch(p, vec2(0.46, 0.72));
    float border = exp(-abs(d) * 34.0);
    float inside = 1.0 - smoothstep(-0.02, 0.02, d);

    float r = length(p - vec2(0.0, -0.05));
    float theta = atan(p.y + 0.05, p.x);

    float rings = sin(r * 28.0 - uTime * 1.4 * uFlowDir + sin(theta * 2.0) * 0.4) * 0.5 + 0.5;
    float swirl = exp(-abs(r - 0.24) * 9.0) * (0.6 + 0.4 * sin(theta * 3.0 - uTime * 2.2 * uFlowDir));

    vec3 col = mix(uOrchidAbyss, uOrchid, clamp(rings * 0.7 + uHover * 0.3, 0.0, 1.0));
    col = mix(col, uOrchidHot, border * (0.4 + 0.6 * uHover));

    float innerAlpha = inside * (uSealed > 0.5 ? 0.14 : (0.14 + 0.26 * rings + 0.35 * swirl)) * uIntensity;
    float borderAlpha = border * (0.35 + 0.55 * uHover + 0.25 * uIntensity);

    float alpha = clamp(innerAlpha + borderAlpha, 0.0, 0.95);
    if (alpha < 0.008) discard;

    fragColor = vec4(col, alpha);
  }
`;
