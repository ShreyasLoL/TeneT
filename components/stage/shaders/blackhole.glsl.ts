import { blackHoleDiskGlsl } from './blackholeDisk.glsl';

export const blackHoleVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

export const blackHoleFragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;

  uniform vec3 uCamPos;
  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform vec3 uCamForward;
  uniform float uTanHalfFov;
  uniform float uAspect;
  uniform vec2 uResolution;
  uniform float uShadowBc;
  uniform float uAnalyticBStart;
  uniform float uAnalyticBEnd;
  uniform int uMaxSteps;
  uniform samplerCube uSkyCube;

  uniform float uTime;
  uniform vec4 uDiskFlow;
  uniform float uDiskQuality;
  uniform vec2 uSkyRot;
  uniform vec3 uRingAnim;
  uniform float uDopplerStrength;
  uniform float uHold;
  uniform float uMode;
  uniform float uWarp;
  uniform float uHue;
  uniform float uSkyReveal;
  uniform float uShadowReveal;
  uniform float uLensStrength;
  uniform float uDiskReveal;
  uniform float uDiskSweep;
  uniform float uRingReveal;
  uniform float uOutputSrgb;

  uniform mediump vec3 uBgColor;
  uniform mediump vec3 uAccent;
  uniform mediump vec3 uAccentDim;
  uniform mediump vec3 uAccentAbyss;
  uniform mediump vec3 uAmber;
  uniform mediump vec3 uColdBlue;

  out vec4 fragColor;

  const float PI = 3.14159265359;

  ${blackHoleDiskGlsl}

  void traceGeodesicAndDisk(
    vec3 e1,
    vec3 e2,
    float u0,
    float cosAlpha,
    float sinAlpha,
    float b,
    out bool captured,
    out vec3 dOut,
    out mediump vec3 diskCol,
    out float transmittance,
    out float fgBeltMask
  ) {
    float alpha = atan(sinAlpha, cosAlpha);
    float phiFlat = PI - alpha;
    float deltaPhiWeak =
      (1.0 + cosAlpha) / max(b, 0.5) +
      (0.46875 * (1.0 + cosAlpha) * phiFlat) / max(b * b, 0.5);
    float phiWeak = phiFlat + deltaPhiWeak;
    vec3 dWeak = normalize(cos(phiWeak) * e1 + sin(phiWeak) * e2);

    diskCol = vec3(0.0);
    transmittance = 1.0;
    fgBeltMask = 1.0;

    if (b >= uAnalyticBEnd || cosAlpha <= -0.25) {
      captured = false;
      dOut = dWeak;
      return;
    }

    float u = u0;
    float du = cosAlpha / max(b, 1e-5);
    float phi = 0.0;
    float yAmp = length(vec2(e1.y, e2.y));
    float phiY0 = yAmp > 1e-5 ? atan(e1.y, e2.y) : 0.0;
    float kPrev = floor(phiY0 / PI);
    captured = false;
    bool escaped = false;
    int crossings = 0;

    float stepScale = 64.0 / float(max(uMaxSteps, 1));
    for (int step = 0; step < 96; step++) {
      if (step >= uMaxSteps) break;

      float h = mix(0.28, 0.088, smoothstep(0.18, 0.64, u)) * stepScale;

      float k1u = du;
      float k1du = 1.5 * u * u - u;

      float u2 = u + 0.5 * h * k1u;
      float du2 = du + 0.5 * h * k1du;
      float k2u = du2;
      float k2du = 1.5 * u2 * u2 - u2;

      float u3 = u + 0.5 * h * k2u;
      float du3 = du + 0.5 * h * k2du;
      float k3u = du3;
      float k3du = 1.5 * u3 * u3 - u3;

      float u4 = u + h * k3u;
      float du4 = du + h * k3du;
      float k4u = du4;
      float k4du = 1.5 * u4 * u4 - u4;

      float uNext = u + (h / 6.0) * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
      float duNext = du + (h / 6.0) * (k1du + 2.0 * k2du + 2.0 * k3du + k4du);
      float phiNext = phi + h;
      float kNext = floor((phiNext + phiY0) / PI);

      if (crossings < 3 && yAmp > 1e-5 && kNext > kPrev && uDiskReveal > 0.001) {
        float phiCross = kNext * PI - phiY0;
        float tCross = clamp((phiCross - phi) / max(h, 1e-6), 0.0, 1.0);
        float uCross = mix(u, uNext, tCross);
        float rCross = 1.0 / max(uCross, 1e-4);
        if (rCross >= 2.75 && rCross <= 17.8) {
          float cPhi = cos(phiCross);
          float sPhi = sin(phiCross);
          vec3 pCross = cPhi * e1 + sPhi * e2;
          float duCross = mix(du, duNext, tCross);
          vec3 rdCross = normalize((-duCross / max(uCross, 1e-4)) * pCross + (-sPhi * e1 + cPhi * e2));
          bool isTopFace = (abs(mod(kNext, 2.0) - 1.0) < 0.5) && (phiCross < 3.35);
          mediump vec3 emit;
          float opac;
          evalDiskCrossing(rCross, pCross, rdCross, isTopFace, emit, opac);
          diskCol += transmittance * emit;
          transmittance *= 1.0 - opac;
          if (dot(pCross, e1) > 0.0 && isTopFace) {
            float beltOcc = smoothstep(2.85, 3.55, rCross) * (1.0 - smoothstep(8.2, 14.5, rCross));
            fgBeltMask *= 1.0 - beltOcc * 0.94;
          }
          crossings++;
        }
      }
      kPrev = kNext;

      if (uNext >= 1.0 || (uNext > 0.37 && duNext > 0.0 && b < uShadowBc * 0.98)) {
        captured = true;
        phi = phiNext;
        break;
      }
      if (uNext <= 0.0 && duNext < 0.0) {
        float frac = clamp(u / max(u - uNext, 1e-6), 0.0, 1.0);
        phi += h * frac;
        escaped = true;
        break;
      }

      u = uNext;
      du = duNext;
      phi = phiNext;
    }

    if (!captured && !escaped && du < -1e-5) {
      phi += clamp(u / (-du), 0.0, 0.8);
    }

    vec3 dRk4 = cos(phi) * e1 + sin(phi) * e2;
    dOut = captured ? -e1 : normalize(mix(dRk4, dWeak, smoothstep(uAnalyticBStart, uAnalyticBEnd, b)));
  }

  vec3 linearToSrgbExact(vec3 lin) {
    vec3 lo = lin * 12.92;
    vec3 hi = 1.055 * pow(max(lin, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), lin));
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 rd = normalize(
      uCamForward +
      ndc.x * uAspect * uTanHalfFov * uCamRight +
      ndc.y * uTanHalfFov * uCamUp
    );

    float r0 = length(uCamPos);
    float u0 = 1.0 / r0;
    vec3 e1 = uCamPos * u0;

    float cosAlpha = clamp(-dot(rd, e1), -1.0, 1.0);
    vec3 perp = rd + cosAlpha * e1;
    float sinAlpha = length(perp);
    vec3 e2 = sinAlpha > 1e-6 ? (perp / sinAlpha) : uCamUp;

    float lapse0 = sqrt(max(1.0 - u0, 1e-5));
    float b = (r0 * sinAlpha) / lapse0;
    float db = max(length(vec2(dFdx(b), dFdy(b))), 1e-4);

    bool captured = false;
    vec3 dOut = rd;
    mediump vec3 diskCol = vec3(0.0);
    float transmittance = 1.0;
    float fgBeltMask = 1.0;
    traceGeodesicAndDisk(
      e1,
      e2,
      u0,
      cosAlpha,
      sinAlpha,
      b,
      captured,
      dOut,
      diskCol,
      transmittance,
      fgBeltMask
    );

    vec3 dLensed = normalize(mix(rd, dOut, clamp(uLensStrength, 0.0, 1.0)));
    vec3 dStar = mix(dLensed, rd, smoothstep(5.2, 17.5, b) * 0.46);
    float cr = uSkyRot.x;
    float sr = uSkyRot.y;
    vec3 rotStar = vec3(dStar.x * cr + dStar.z * sr, dStar.y, -dStar.x * sr + dStar.z * cr);
    vec3 skyDx = dFdx(rotStar);
    vec3 skyDy = dFdy(rotStar);

    float dPx = (cosAlpha > 0.0) ? ((b - uShadowBc) / db) : 1.0e4;
    float outsideShadow = smoothstep(-0.5, 0.5, dPx);

    mediump vec3 skyCol = textureGrad(uSkyCube, rotStar, skyDx, skyDy).rgb;
    float einsteinFocus = outsideShadow * exp(-pow((b - 3.65) / 1.15, 2.0));
    skyCol *= 1.0 + einsteinFocus * 0.65 * clamp(uLensStrength, 0.0, 1.0);

    float posPx = max(dPx, 0.0);
    float breathe = uRingAnim.x;
    float ringCore = outsideShadow * exp(-posPx * 1.15);
    float ringFringe = outsideShadow * exp(-max(posPx - 0.35, 0.0) * 0.22);
    float thetaScreen = atan(ndc.y, ndc.x);
    float dAng = abs(atan(sin(thetaScreen - uRingAnim.y), cos(thetaScreen - uRingAnim.y)));
    float glint = exp(-dAng * dAng * 32.0) * ringCore * uRingAnim.z;

    float dopplerScreen = clamp(-ndc.x * 2.2, -1.0, 1.0);
    mediump vec3 pinkOrchid = mix(uAccent, vec3(0.96, 0.56, 0.80), 0.42);
    mediump vec3 fringeCol = mix(mix(uAmber * 0.45, pinkOrchid, 0.65), uAccentDim * 0.75, clamp(posPx * 0.24, 0.0, 1.0));
    mediump vec3 coreCol = mix(vec3(1.00, 0.95, 0.90), vec3(0.84, 0.92, 1.00), max(0.0, dopplerScreen) * 0.32);
    mediump vec3 lensRimCol = mix(uAccentDim * 0.65, vec3(0.72, 0.84, 1.00), 0.35);
    mediump vec3 photonRing =
      (coreCol * (ringCore * 1.88 * breathe + glint) +
        fringeCol * (ringFringe * 0.55) +
        lensRimCol * (einsteinFocus * 0.055)) *
      fgBeltMask;

    float shadowMask = mix(1.0, outsideShadow, uShadowReveal);
    float effTrans = mix(1.0, transmittance, smoothstep(0.0, 0.45, uDiskReveal));
    mediump vec3 skyDetail = max(skyCol - uBgColor, vec3(0.0));
    mediump vec3 skyRevealed = uBgColor + skyDetail * max(uSkyReveal, 0.0);
    mediump vec3 backCol = skyRevealed * shadowMask + photonRing * uRingReveal;
    mediump vec3 linearCol = diskCol * uDiskReveal + effTrans * backCol;

    if (uOutputSrgb > 0.5) {
      vec2 vigUv = vUv - vec2(0.5);
      float vig = clamp(1.0 - dot(vigUv, vigUv) * 0.72, 0.0, 1.0);
      vec3 mapped = (linearCol * (2.51 * linearCol + 0.03)) / (linearCol * (2.43 * linearCol + 0.59) + 0.14);
      fragColor = vec4(linearToSrgbExact(clamp(mapped, vec3(0.0), vec3(1.0)) * vig), 1.0);
    } else {
      fragColor = vec4(linearCol, 1.0);
    }
  }
`;
