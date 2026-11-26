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

  vec3 acesFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 vigUv = vUv - vec2(0.5);
    float edgeR2 = dot(vigUv, vigUv);

    // Restrained radial chromatic aberration at viewport periphery only
    float caGate = step(0.00005, uChroma) * smoothstep(0.08, 0.42, edgeR2);
    vec2 caShift = vigUv * edgeR2 * (uChroma * 0.45);
    vec3 centerScene = texture2D(inputBuffer, uv).rgb;
    float colR = texture2D(inputBuffer, clamp(uv + caShift, vec2(0.001), vec2(0.999))).r;
    float colB = texture2D(inputBuffer, clamp(uv - caShift, vec2(0.001), vec2(0.999))).b;
    vec3 hdr = max(
      vec3(0.0),
      inputColor.rgb + vec3(colR - centerScene.r, 0.0, colB - centerScene.b) * caGate
    );

    // Keep shadow void pure black and sky background faithful to --bg (#0B0910) while ACES maps highlights cleanly
    vec3 col = acesFilm(hdr * 0.98);
    float vig = pow(clamp(1.0 - edgeR2 * 0.78, 0.0, 1.0), 1.32);
    col *= vig;

    float lum = max(col.r, max(col.g, col.b));
    float dither = (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 19.19) - 1.0) / 255.0;
    float grainGate = step(0.5, uGrainEnabled) * step(0.008, lum);
    float n = (hash12(vUv * 800.0 + fract(uTime) * 173.0) - 0.5) * grainGate;
    float ditherGate = step(0.002, lum);
    col = clamp(col + vec3(n * uGrain + dither * 0.5 * ditherGate), vec3(0.0), vec3(1.0));

    outputColor = vec4(col, 1.0);
  }
`;
