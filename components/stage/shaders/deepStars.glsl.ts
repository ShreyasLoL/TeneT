export const deepStarsVertexShader = /* glsl */ `
  precision highp float;

  in vec4 aSeed; // x: lum, y: temp [0..1], z: twinklePhase, w: sizeWeight

  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform vec3 uCamForward;
  uniform float uTanHalfFov;
  uniform float uAspect;
  uniform float uTime;
  uniform float uDpr;
  uniform float uRoll;
  uniform float uBrightness;

  out float vAlpha;
  out float vTemp;
  out float vLum;

  void main() {
    vec3 dir = normalize(position);
    float a = uTime * 0.0018;
    float ca = cos(a);
    float sa = sin(a);
    // Counter-rotate celestial sphere in lockstep with uSkyCube rotation (rot = uTime * 0.0018)
    vec3 rotDir = vec3(dir.x * ca - dir.z * sa, dir.y, dir.x * sa + dir.z * ca);

    float zCam = dot(rotDir, uCamForward);
    if (zCam <= 0.05) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vTemp = 0.5;
      vLum = 0.0;
      return;
    }

    float ndcX = dot(rotDir, uCamRight) / (zCam * uAspect * uTanHalfFov);
    float ndcY = dot(rotDir, uCamUp) / (zCam * uTanHalfFov);

    // Mask stars falling directly over the central black hole shadow + dense inner disk wings
    vec2 pScreen = vec2(ndcX * uAspect, ndcY);
    float rc = cos(-uRoll);
    float rs = sin(-uRoll);
    vec2 pDisk = vec2(pScreen.x * rc - pScreen.y * rs, pScreen.x * rs + pScreen.y * rc);
    float diskBox = abs(pDisk.y) + max(0.0, abs(pDisk.x) - 0.92) * 0.58;
    float bhClear = smoothstep(0.35, 0.52, length(pScreen)) * smoothstep(0.055, 0.145, diskBox);

    float twinkle = 0.88 + 0.12 * sin(uTime * 0.85 + aSeed.z * 6.2831853);
    float lum = aSeed.x;
    float isHero = smoothstep(0.88, 1.0, aSeed.w);
    float ptPx = (1.15 + 1.45 * aSeed.w + isHero * 1.4) * uDpr;

    gl_Position = vec4(ndcX, ndcY, 0.99, 1.0);
    gl_PointSize = clamp(ptPx, 1.0 * uDpr, 4.2 * uDpr);

    vAlpha = clamp(lum * twinkle * bhClear * uBrightness, 0.0, 1.4);
    vTemp = aSeed.y;
    vLum = lum;
  }
`;

export const deepStarsFragmentShader = /* glsl */ `
  precision mediump float;

  in float vAlpha;
  in float vTemp;
  in float vLum;

  out vec4 fragColor;

  void main() {
    if (vAlpha <= 0.002) discard;
    vec2 c = gl_PointCoord - vec2(0.5);
    float d2 = dot(c, c);
    float radialWindow = smoothstep(0.25, 0.015, d2);

    // Tight high-contrast pinpoint core + delicate diffraction cross on top 2% bright hero stars
    float core = exp(-d2 * 44.0) * radialWindow;
    float heroGate = smoothstep(1.05, 1.55, vLum) * radialWindow;
    float spikes =
      (exp(-abs(c.y) * 42.0) * exp(-abs(c.x) * 6.5) +
        exp(-abs(c.x) * 42.0) * exp(-abs(c.y) * 6.5)) *
      0.38 *
      heroGate;

    vec3 cool = vec3(1.00, 0.68, 0.44);
    vec3 white = vec3(0.98, 0.97, 0.98);
    vec3 hotBlue = vec3(0.66, 0.82, 1.00);
    vec3 tint = vTemp < 0.45
      ? mix(cool, white, vTemp / 0.45)
      : mix(white, hotBlue, (vTemp - 0.45) / 0.55);

    float intensity = (core + spikes) * vAlpha;
    if (intensity <= 0.002) discard;

    fragColor = vec4(tint * intensity, clamp(intensity, 0.0, 1.0));
  }
`;
