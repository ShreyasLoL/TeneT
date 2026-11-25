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
    float defl = (s * s) / max(r, s * 0.5);
    vec2 dir = r > 0.0001 ? d / r : vec2(0.0);
    uv -= (dir / vec2(uAspect, 1.0)) * defl * uStrength * (1.0 + uSpike * 0.65);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float s = max(0.004, uRadiusS * (1.0 + uHold * 0.08));

    // 1. Event horizon shadow + razor photon ring + outer Einstein halo
    float horizon = smoothstep(s * 0.96, s * 1.03, r);
    vec3 col = inputColor.rgb * horizon;

    float photon = exp(-pow((r - s * 1.04) / max(0.002, s * 0.055), 2.0));
    float halo = exp(-max(0.0, r - s) * 6.0 / max(0.02, s)) * step(s * 0.98, r);

    float ringGain = 0.35 + 0.65 * clamp(uStrength, 0.0, 1.2);
    col += uOrchidHot * photon * (0.48 * ringGain + uHold * 0.42 + uSpike * 0.4);
    col += uOrchidAbyss * halo * (0.26 * ringGain + uStrength * 0.22);
    col += uOrchid * photon * 0.22 * ringGain;

    // 2. Mirrored floor reflection (Fork mode)
    if (uMirrorEnabled > 0.5 && vUv.y < uHorizonY) {
      float dy = clamp((uHorizonY - vUv.y) / max(0.05, uHorizonY), 0.0, 1.0);
      float ripple = sin(vUv.x * 42.0 + uTime * 0.9) * 0.0018 * dy;
      vec2 sampleUv = vec2(
        clamp(vUv.x + ripple, 0.0, 1.0),
        clamp(2.0 * uHorizonY - vUv.y, 0.0, 1.0)
      );

      float blurStep = 0.002 + dy * 0.014;
      vec3 refl = vec3(0.0);
      refl += texture2D(inputBuffer, clamp(sampleUv + vec2(0.0, -2.0 * blurStep), 0.0, 1.0)).rgb * 0.15;
      refl += texture2D(inputBuffer, clamp(sampleUv + vec2(0.0, -blurStep), 0.0, 1.0)).rgb * 0.22;
      refl += texture2D(inputBuffer, sampleUv).rgb * 0.26;
      refl += texture2D(inputBuffer, clamp(sampleUv + vec2(0.0, blurStep), 0.0, 1.0)).rgb * 0.22;
      refl += texture2D(inputBuffer, clamp(sampleUv + vec2(0.0, 2.0 * blurStep), 0.0, 1.0)).rgb * 0.15;

      float fresnel = pow(1.0 - dy, 3.0) * 0.18;
      col += refl * fresnel;
    }

    // 3. Vignette, subtle film grain, and 8-bit triangular dither (prevents dark banding)
    vec2 vigUv = vUv - vec2(0.5);
    float vig = 1.0 - dot(vigUv, vigUv) * 0.34;
    col *= vig;

    float dither = (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 19.19) - 1.0) / 255.0;
    if (uGrainEnabled > 0.5) {
      float n = hash12(vUv * 800.0 + fract(uTime) * 173.0) - 0.5;
      col += vec3(n * uGrain + dither);
    } else {
      col += vec3(dither);
    }

    outputColor = vec4(clamp(col, vec3(0.0), vec3(2.5)), inputColor.a);
  }
`;
