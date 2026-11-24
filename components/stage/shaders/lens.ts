export const lensFragmentShader = /* glsl */ `
  uniform vec2 uCenter;
  uniform float uRadiusS;
  uniform float uStrength;
  uniform float uHold;
  uniform float uAspect;
  uniform float uSpike;
  uniform vec3 uOrchidAbyss;
  uniform vec3 uOrchid;
  uniform vec3 uOrchidHot;

  void mainUv(inout vec2 uv) {
    vec2 d = (uv - uCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float s = uRadiusS * (1.0 + uHold * 0.08);
    float defl = (s * s) / max(r, s * 0.5);
    vec2 dir = r > 0.0001 ? d / r : vec2(0.0);
    uv -= (dir / vec2(uAspect, 1.0)) * defl * uStrength * (1.0 + uSpike * 0.65);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
    float r = length(d);
    float s = uRadiusS * (1.0 + uHold * 0.08);

    // Event horizon shadow
    float horizon = smoothstep(s * 0.96, s * 1.03, r);
    vec3 col = inputColor.rgb * horizon;

    // Razor-thin photon ring at S + soft outer Einstein halo
    float photon = exp(-pow((r - s * 1.04) / max(0.002, s * 0.055), 2.0));
    float halo = exp(-max(0.0, r - s) * 6.0 / max(0.02, s)) * step(s * 0.98, r);

    col += uOrchidHot * photon * (0.48 + uHold * 0.42 + uSpike * 0.4);
    col += uOrchidAbyss * halo * (0.28 + uStrength * 0.25);
    col += uOrchid * photon * 0.22;

    outputColor = vec4(col, inputColor.a);
  }
`;
