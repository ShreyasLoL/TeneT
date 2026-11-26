export const tenetPostFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 uCenter;
  uniform float uRadiusS;
  uniform float uStrength;
  uniform float uHold;
  uniform float uAspect;
  uniform float uSpike;
  uniform float uTime;
  uniform float uChroma;
  uniform float uGrainEnabled;
  uniform float uGrain;
  uniform vec3 uBg;
  uniform vec3 uOrchidAbyss;
  uniform vec3 uOrchid;
  uniform vec3 uOrchidHot;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 lensDistortUv(vec2 baseUv) {
    vec2 d = (baseUv - uCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float s = max(0.004, uRadiusS * (1.0 + uHold * 0.08));

    // Monotonic 1/r Einstein + 1/r^2 strong-field deflection strictly outside the photon ring (no UV folding)
    float edgeR = max(0.0, (r - s * 1.04) / s);
    float gate = smoothstep(s * 1.04, s * 1.46, r);
    float denom = edgeR + 0.58;
    float einstein = 0.13 / denom;
    float strongField = 0.055 / (denom * denom);
    float defl = s * (einstein + strongField) * gate * uStrength * (1.0 + uSpike * 0.42);

    vec2 dir = d / max(r, 1e-4);
    return clamp(baseUv - (dir / vec2(uAspect, 1.0)) * defl, vec2(0.001), vec2(0.999));
  }

  void mainUv(inout vec2 uv) {
    uv = lensDistortUv(uv);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 vigUv = vUv - vec2(0.5);
    float edgeR2 = dot(vigUv, vigUv);

    // Subtle radial chromatic aberration at viewport edges (preserving full RGB bloom)
    float caGate = step(0.00005, uChroma) * smoothstep(0.04, 0.38, edgeR2);
    vec2 caShift = vigUv * edgeR2 * uChroma;
    vec3 centerScene = texture2D(inputBuffer, uv).rgb;
    float colR = texture2D(inputBuffer, clamp(uv + caShift, vec2(0.001), vec2(0.999))).r;
    float colB = texture2D(inputBuffer, clamp(uv - caShift, vec2(0.001), vec2(0.999))).b;
    vec3 col = max(vec3(0.0), inputColor.rgb + vec3(colR - centerScene.r, 0.0, colB - centerScene.b) * caGate);

    // Crisp Einstein-ring lensing amplification on background galaxy light just outside the photon ring
    vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float s = max(0.004, uRadiusS * (1.0 + uHold * 0.08));
    float einsteinArc = exp(-pow((r - s * 1.08) / max(0.003, s * 0.05), 2.0));
    col *= 1.0 + einsteinArc * 0.42 * clamp(uStrength, 0.0, 1.2) + uHold * 0.18 + uSpike * 0.28;

    // High-contrast toe crush + radial vignette: deep #0B0910 void, rich core & spiral contrast
    col = pow(max(col, vec3(0.0)), vec3(1.18)) * 1.28;
    float vig = pow(clamp(1.0 - edgeR2 * 1.18, 0.0, 1.0), 1.55);
    col *= vig;

    float lum = max(col.r, max(col.g, col.b));
    float dither = (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 19.19) - 1.0) / 255.0;
    float grainGate = step(0.5, uGrainEnabled) * step(0.008, lum);
    float n = (hash12(vUv * 800.0 + fract(uTime) * 173.0) - 0.5) * grainGate;
    col += vec3(n * uGrain + dither * 0.5 * grainGate);

    float outAlpha = clamp(max(inputColor.a, clamp(lum * 1.35, 0.0, 1.0)), 0.0, 1.0);
    outputColor = vec4(clamp(col, vec3(0.0), vec3(2.8)), outAlpha);
  }
`;
