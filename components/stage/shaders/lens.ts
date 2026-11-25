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
    vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float s = max(0.004, uRadiusS * (1.0 + uHold * 0.08));

    // Preserve 3D depth-sorted event horizon sphere & front accretion disk; add subtle Einstein ring accent
    vec3 col = inputColor.rgb;
    float photon = exp(-pow((r - s * 1.03) / max(0.002, s * 0.05), 2.0));
    float ringGain = clamp(uStrength, 0.0, 1.2);
    col += uOrchidHot * photon * (0.14 * ringGain + uHold * 0.28 + uSpike * 0.32);
    col += uOrchid * photon * 0.08 * ringGain;

    // Mirrored floor reflection (Fork mode on high tier)
    if (uMirrorEnabled > 0.5 && vUv.y < uHorizonY) {
      float dy = clamp((uHorizonY - vUv.y) / max(0.05, uHorizonY), 0.0, 1.0);
      float ripple = sin(vUv.x * 42.0 + uTime * 0.9) * 0.0016 * dy;
      vec2 sampleUv = vec2(
        clamp(vUv.x + ripple, 0.0, 1.0),
        clamp(2.0 * uHorizonY - vUv.y, 0.0, 1.0)
      );

      float blurStep = 0.002 + dy * 0.012;
      vec3 refl = vec3(0.0);
      refl += texture2D(inputBuffer, clamp(sampleUv + vec2(0.0, -blurStep), 0.0, 1.0)).rgb * 0.28;
      refl += texture2D(inputBuffer, sampleUv).rgb * 0.44;
      refl += texture2D(inputBuffer, clamp(sampleUv + vec2(0.0, blurStep), 0.0, 1.0)).rgb * 0.28;

      float fresnel = pow(1.0 - dy, 3.2) * 0.14;
      col += refl * fresnel;
    }

    // Gentle edge vignette + subtle grain on lit regions; transparent clear preserves exact #0B0910
    vec2 vigUv = vUv - vec2(0.5);
    float vig = clamp(1.0 - dot(vigUv, vigUv) * 0.22, 0.0, 1.0);
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
