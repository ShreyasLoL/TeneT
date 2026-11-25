export const tenetPostFragmentShader = /* glsl */ `
  precision mediump float;

  uniform vec2 uCenter;
  uniform float uRadiusS;
  uniform float uStrength;
  uniform float uHold;
  uniform float uAspect;
  uniform float uSpike;
  uniform float uHorizonY;
  uniform float uTime;
  uniform float uMirrorEnabled;
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

  void mainUv(inout vec2 uv) {
    vec2 d = (uv - uCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float s = max(0.004, uRadiusS * (1.0 + uHold * 0.08));
    // Smooth gravitational deflection outside the 3D sphere so the front equatorial disk stays sharp
    float outerMask = smoothstep(s * 0.85, s * 1.35, r);
    float defl = (s * s) / max(r, s * 0.65);
    vec2 dir = r > 0.0001 ? d / r : vec2(0.0);
    uv -= (dir / vec2(uAspect, 1.0)) * defl * outerMask * uStrength * 0.48 * (1.0 + uSpike * 0.55);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Preserve pure abyssal 3D event horizon shadow & lensed 3D photon ring without inner 2D ring ghosting
    vec3 col = inputColor.rgb;
    float spikeBoost = 1.0 + uHold * 0.18 + uSpike * 0.28;
    col *= spikeBoost;

    // High-contrast toe crush + strong radial vignette: deep #0B0910 void, minimal midtones
    col = pow(max(col, vec3(0.0)), vec3(1.26)) * 1.34;
    vec2 vigUv = vUv - vec2(0.5);
    float vig = pow(clamp(1.0 - dot(vigUv, vigUv) * 1.28, 0.0, 1.0), 1.65);
    col *= vig;

    float lum = max(col.r, max(col.g, col.b));
    float dither = (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 19.19) - 1.0) / 255.0;
    if (uGrainEnabled > 0.5 && lum > 0.012) {
      float n = (hash12(vUv * 800.0 + fract(uTime) * 173.0) - 0.5);
      col += vec3(n * uGrain + dither * 0.5);
    }

    float outAlpha = clamp(max(inputColor.a, clamp(lum * 1.35, 0.0, 1.0)), 0.0, 1.0);
    outputColor = vec4(clamp(col, vec3(0.0), vec3(2.8)), outAlpha);
  }
`;
