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
  out float vStretch;
  out vec2 vTanDir;

  void main() {
    vec3 dir = normalize(position);
    float a = sin(uTime * 0.035) * 0.022;
    float ca = cos(a);
    float sa = sin(a);
    vec3 rotDir = vec3(dir.x * ca - dir.z * sa, dir.y, dir.x * sa + dir.z * ca);

    float zUnlensed = dot(rotDir, uCamForward);
    if (zUnlensed <= 0.02) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vTemp = 0.5;
      vLum = 0.0;
      vStretch = 1.0;
      vTanDir = vec2(1.0, 0.0);
      return;
    }

    // Analytic Einstein gravitational lens deflection around black hole center axis
    vec3 radPerp = rotDir - zUnlensed * uCamForward;
    float rLen = length(radPerp);
    vec3 radDir = rLen > 1e-6 ? (radPerp / rLen) : uCamRight;
    float beta = atan(rLen, zUnlensed);

    float thetaE = 0.138;
    float thetaPlus = 0.5 * (beta + sqrt(beta * beta + 4.0 * thetaE * thetaE));
    vec3 lensedDir = cos(thetaPlus) * uCamForward + sin(thetaPlus) * radDir;

    float zCam = dot(lensedDir, uCamForward);
    float ndcX = dot(lensedDir, uCamRight) / (zCam * uAspect * uTanHalfFov);
    float ndcY = dot(lensedDir, uCamUp) / (zCam * uTanHalfFov);

    float uRatio = beta / thetaE;
    float tangentialStretch = clamp(thetaPlus / max(beta, 0.025), 1.0, 2.8);
    float magBoost = clamp(1.0 + 0.55 * exp(-uRatio * uRatio * 0.9), 1.0, 1.65);

    vec2 pScreen = vec2(ndcX * uAspect, ndcY);
    vec2 screenRad = length(pScreen) > 1e-5 ? normalize(pScreen) : vec2(1.0, 0.0);
    vec2 screenTan = vec2(-screenRad.y, screenRad.x);

    float rc = cos(-uRoll);
    float rs = sin(-uRoll);
    vec2 pDisk = vec2(pScreen.x * rc - pScreen.y * rs, pScreen.x * rs + pScreen.y * rc);
    float diskBox = abs(pDisk.y) + max(0.0, abs(pDisk.x) - 0.92) * 0.58;
    float bhClear = smoothstep(0.32, 0.46, length(pScreen)) * smoothstep(0.055, 0.145, diskBox);

    float twinkle = 0.88 + 0.12 * sin(uTime * 0.85 + aSeed.z * 6.2831853);
    float lum = aSeed.x * magBoost;
    float isHero = smoothstep(0.88, 1.0, aSeed.w);
    float ptPx = (1.15 + 1.45 * aSeed.w + isHero * 1.4) * mix(1.0, tangentialStretch * 0.85, 0.65) * uDpr;

    gl_Position = vec4(ndcX, ndcY, 0.99, 1.0);
    gl_PointSize = clamp(ptPx, 1.0 * uDpr, 8.0 * uDpr);

    vAlpha = clamp(lum * twinkle * bhClear * uBrightness, 0.0, 1.5);
    vTemp = aSeed.y;
    vLum = lum;
    vStretch = tangentialStretch;
    vTanDir = screenTan;
  }
`;

export const deepStarsFragmentShader = /* glsl */ `
  precision mediump float;

  in float vAlpha;
  in float vTemp;
  in float vLum;
  in float vStretch;
  in vec2 vTanDir;

  out vec4 fragColor;

  void main() {
    if (vAlpha <= 0.002) discard;
    vec2 raw = gl_PointCoord - vec2(0.5);
    vec2 cScreen = vec2(raw.x, -raw.y);
    vec2 radDir = vec2(vTanDir.y, -vTanDir.x);

    float tCoord = dot(cScreen, vTanDir) / max(vStretch, 1.0);
    float rCoord = dot(cScreen, radDir);
    float d2 = tCoord * tCoord + rCoord * rCoord;
    float radialWindow = smoothstep(0.25, 0.015, dot(raw, raw));

    // Tight high-contrast pinpoint core + delicate tangential Einstein micro-arc stretch near ring
    float core = exp(-d2 * 44.0) * radialWindow;
    float heroGate = smoothstep(1.05, 1.55, vLum) * radialWindow * (1.0 - smoothstep(1.15, 1.85, vStretch));
    float spikes =
      (exp(-abs(raw.y) * 42.0) * exp(-abs(raw.x) * 6.5) +
        exp(-abs(raw.x) * 42.0) * exp(-abs(raw.y) * 6.5)) *
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
