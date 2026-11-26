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
  uniform float uDopplerStrength;
  uniform float uHold;
  uniform float uMode;
  uniform float uWarp;
  uniform float uHue;
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
    vec3 pPrev = e1;
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
      vec3 pNext = cos(phiNext) * e1 + sin(phiNext) * e2;

      if (crossings < 3 && pPrev.y * pNext.y <= 0.0 && pPrev.y != pNext.y) {
        float tCross = clamp(abs(pPrev.y) / max(abs(pPrev.y) + abs(pNext.y), 1e-6), 0.0, 1.0);
        float uCross = mix(u, uNext, tCross);
        float rCross = 1.0 / max(uCross, 1e-4);
        if (rCross >= 2.75 && rCross <= 18.8) {
          float phiCross = phi + h * tCross;
          vec3 pCross = normalize(cos(phiCross) * e1 + sin(phiCross) * e2);
          vec3 rdCross = normalize(pNext / max(uNext, 1e-4) - pPrev / max(u, 1e-4));
          bool isTopFace = (pPrev.y > 0.0) && (phiCross < 3.35);
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

      if (uNext >= 1.0) {
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
      pPrev = pNext;
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

    vec3 dStar = mix(dOut, rd, smoothstep(5.2, 17.5, b) * 0.46);
    float rot = sin(uTime * 0.035) * 0.022;
    float cr = cos(rot);
    float sr = sin(rot);
    vec3 rotStar = vec3(dStar.x * cr + dStar.z * sr, dStar.y, -dStar.x * sr + dStar.z * cr);
    vec3 skyDx = dFdx(rotStar);
    vec3 skyDy = dFdy(rotStar);

    float dPx = (cosAlpha > 0.0) ? ((b - uShadowBc) / db) : 1.0e4;
    float outsideShadow = smoothstep(-0.5, 0.5, dPx);

    mediump vec3 skyCol = textureGrad(uSkyCube, rotStar, skyDx, skyDy).rgb;
    float einsteinFocus = outsideShadow * exp(-pow((b - 3.65) / 1.15, 2.0));
    skyCol *= 1.0 + einsteinFocus * 0.65;

    float posPx = max(dPx, 0.0);
    float breathe = 0.72 + 0.28 * sin(uTime * 0.34);
    float ringCore = outsideShadow * exp(-posPx * 1.15);
    float ringFringe = outsideShadow * exp(-max(posPx - 0.35, 0.0) * 0.40);
    float thetaScreen = atan(ndc.y, ndc.x);
    float glintTheta = mod(uTime * 0.19, 6.2831853) - PI;
    float dAng = abs(atan(sin(thetaScreen - glintTheta), cos(thetaScreen - glintTheta)));
    float glint = exp(-dAng * dAng * 32.0) * ringCore * pow(max(0.0, sin(uTime * 0.28 + 0.9)), 6.0) * 0.75;

    float dopplerScreen = clamp(-ndc.x * 2.2, -1.0, 1.0);
    mediump vec3 pinkOrchid = mix(uAccent, vec3(0.96, 0.56, 0.80), 0.42);
    mediump vec3 fringeCol = mix(mix(uAmber * 0.45, pinkOrchid, 0.65), uAccentDim * 0.75, clamp(posPx * 0.24, 0.0, 1.0));
    mediump vec3 coreCol = mix(vec3(1.00, 0.95, 0.90), vec3(0.84, 0.92, 1.00), max(0.0, dopplerScreen) * 0.32);
    mediump vec3 lensRimCol = mix(uAccentDim * 0.65, vec3(0.72, 0.84, 1.00), 0.35);
    mediump vec3 photonRing =
      (coreCol * (ringCore * 1.38 * breathe + glint) +
        fringeCol * (ringFringe * 0.36) +
        lensRimCol * (einsteinFocus * 0.055)) *
      fgBeltMask;

    mediump vec3 backCol = skyCol * outsideShadow + photonRing;
    mediump vec3 linearCol = diskCol + transmittance * backCol;

    if (uOutputSrgb > 0.5) {
      linearCol = linearCol / (vec3(1.0) + max(linearCol - vec3(0.85), vec3(0.0)) * 0.45);
      fragColor = vec4(linearToSrgbExact(linearCol), 1.0);
    } else {
      fragColor = vec4(linearCol, 1.0);
    }
  }
`;
