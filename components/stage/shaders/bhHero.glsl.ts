import { bhCommonGlsl } from './bhCommon.glsl';
import { bhDiskGlsl } from './bhDisk.glsl';

export const bhFullscreenVertexShader = /* glsl */ `
precision highp float;
out vec2 vUv;
void main() {
  // Fullscreen triangle from gl_VertexID (0, 1, 2): zero VBO overhead
  vec2 pos = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

export const bhHeroFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uDeflectionLut;
uniform sampler3D uTransferLut;
uniform sampler3D uKerrLut;
uniform sampler2D uBlackbodyLut;
uniform sampler2D uDiskTurbulence;
uniform sampler2D uDiskCache30Hz;
uniform samplerCube uSkyCube;

uniform vec3 uCamPos;
uniform mat4 uInvProjView;
uniform vec2 uJitterNdc;
uniform float uTime;
uniform float uTierMode;      // 1 = T1 LUT, 2 = T2 RK4+volumetric, 3 = T3 Kerr
uniform float uMarchSteps;    // 16..28 for T2/T3
uniform float uSpinSense;     // +1 or -1
uniform float uHold;
uniform float uHeat;
uniform float uUseCache30Hz;
uniform float uCacheSubDt;
uniform float uBlurTaps;
uniform float uCheatsEnabled; // 1.0 = weak-field importance mask + adaptive skips on; 0.0 = reference
uniform float uExposureScale; // dims quietly on /log data entry
uniform vec3 uOrchid;

in vec2 vUv;
out vec4 fragColor;

${bhCommonGlsl}
${bhDiskGlsl}

float bhInPlaneRK4(
  float b, float rObs, float phi0, float phi1, float phi2, float phi3,
  int maxSteps, out vec4 rCross, out float phiInfOut, out bool escaped
) {
  float u = 1.0 / rObs;
  float du = sqrt(max(0.0, (1.0 / (b * b)) - u * u * (1.0 - BH_RS * u)));
  float phi = 0.0;
  rCross = vec4(0.0);
  escaped = false;
  phiInfOut = 0.0;
  float hBase = 2.65 / float(max(maxSteps, 12));

  for (int s = 0; s < 32; ++s) {
    if (s >= maxSteps) break;
    float h = clamp(hBase / (1.0 + 1.8 * u), 0.035, 0.24);
    float k1u = du, k1v = 3.0 * BH_M * u * u - u;
    float u2 = u + 0.5 * h * k1u, v2 = du + 0.5 * h * k1v;
    float k2u = v2, k2v = 3.0 * BH_M * u2 * u2 - u2;
    float u3 = u + 0.5 * h * k2u, v3 = du + 0.5 * h * k2v;
    float k3u = v3, k3v = 3.0 * BH_M * u3 * u3 - u3;
    float u4 = u + h * k3u, v4 = du + h * k3v;
    float k4u = v4, k4v = 3.0 * BH_M * u4 * u4 - u4;

    float un = u + (h / 6.0) * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    float dun = du + (h / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
    float pn = phi + h;

    if (phi0 > phi && phi0 <= pn) { float t = (phi0 - phi) / h; float uc = mix(u, un, t); if (uc > 1e-4) rCross.x = 1.0 / uc; }
    if (phi1 > phi && phi1 <= pn) { float t = (phi1 - phi) / h; float uc = mix(u, un, t); if (uc > 1e-4) rCross.y = 1.0 / uc; }
    if (phi2 > phi && phi2 <= pn) { float t = (phi2 - phi) / h; float uc = mix(u, un, t); if (uc > 1e-4) rCross.z = 1.0 / uc; }
    if (phi3 > phi && phi3 <= pn) { float t = (phi3 - phi) / h; float uc = mix(u, un, t); if (uc > 1e-4) rCross.w = 1.0 / uc; }

    u = un; du = dun; phi = pn;
    if (u >= 1.0 / BH_RS) { escaped = false; phiInfOut = phi; return u; }
    if (u <= 0.0 && du < 0.0) {
      escaped = true;
      phiInfOut = phi - u / min(du, -1e-5);
      return 0.0;
    }
  }
  escaped = (b >= BH_BC);
  phiInfOut = phi;
  return u;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0 + uJitterNdc;
  vec4 wpNear = uInvProjView * vec4(ndc, -1.0, 1.0);
  vec4 wpFar  = uInvProjView * vec4(ndc,  1.0, 1.0);
  vec3 rayDir = normalize(wpFar.xyz / wpFar.w - wpNear.xyz / wpNear.w);

  float rObs = length(uCamPos);
  vec3 e1 = uCamPos / max(rObs, 1e-4);
  float cosTheta = clamp(dot(-rayDir, e1), -1.0, 1.0);
  vec3 perp = rayDir + cosTheta * e1;
  float perpLen = length(perp);
  vec3 e2 = perpLen > 1e-6 ? (perp / perpLen) : normalize(cross(e1, vec3(0.0, 1.0, 0.0)));
  float sinTheta = perpLen;

  float obsLapse = sqrt(max(1e-4, 1.0 - BH_RS / max(BH_RS + 0.05, rObs)));
  float b = (rObs * sinTheta) / obsLapse;

  // Image-plane orientation relative to equatorial disk normal (+Y)
  float sinTheta0 = sqrt(max(0.0, 1.0 - e1.y * e1.y));
  vec3 camRight = normalize(cross(vec3(0.0, 1.0, 0.0), e1) + vec3(1e-6, 0.0, 0.0));
  float sinPsi = dot(e2, camRight);

  // Kerr D-shaped shadow offset on approaching side (a = 0.45)
  float isKerr = step(2.5, uTierMode);
  float bShadow = b + isKerr * 0.48 * BH_KERR_A * sinTheta0 * sinPsi;

  // First equatorial crossing angle phi0 in (0, PI]
  float phi0 = atan(-e1.y, e2.y);
  if (phi0 <= 0.0) phi0 += BH_PI;
  if (cosTheta < 0.0) phi0 = BH_PI + 2.0; // outgoing ray only hits outer disk behind camera if inside disk

  float bLut = bhBToLutU(bShadow);
  vec4 deflData = texture(uDeflectionLut, vec2(bLut, 0.5));
  float phiEndLut = deflData.r;
  float alphaLut = deflData.g;
  bool escaped = deflData.b > 0.5;

  // Early-out true black horizon (b < b_c and ray captured before hitting equatorial plane)
  if (!escaped && phiEndLut < phi0 && cosTheta > 0.0) {
    fragColor = vec4(0.0, 0.0, 0.0, -1.0);
    return;
  }

  vec3 accumRgb = vec3(0.0);
  float trans = 1.0;
  float primaryDiskR = -1.0;
  int taps = int(clamp(uBlurTaps, 1.0, 4.0));

  // Weak-field importance mask: analytic sky + direct plane crossing for b > 19.0 rs
  if (uCheatsEnabled > 0.5 && b > 19.0 && cosTheta > 0.0) {
    if (abs(rayDir.y) > 1e-4) {
      float tPlane = -uCamPos.y / rayDir.y;
      if (tPlane > 0.0) {
        vec3 hit = uCamPos + rayDir * tPlane;
        float rHit = length(hit.xz);
        if (rHit <= BH_DISK_R_TAPER) {
          float dPhi;
          vec4 dCol = bhShadeDiskCrossing(
            rHit, hit, rayDir, b, sinTheta0, sinPsi, rObs, uTime, uSpinSense, isKerr,
            uHold, uHeat, uOrchid, uBlackbodyLut, uDiskTurbulence, uDiskCache30Hz,
            uUseCache30Hz, uCacheSubDt, taps, dPhi
          );
          accumRgb += trans * dCol.rgb;
          trans *= (1.0 - dCol.a);
          if (dCol.a > 0.05) primaryDiskR = rHit;
        }
      }
    }
    float alphaWf = bhWeakFieldDeflection(b);
    float phiInf = (BH_PI - acos(cosTheta)) + alphaWf;
    vec3 skyDir = normalize(cos(phiInf) * e1 + sin(phiInf) * e2);
    vec3 skyCol = pow(textureGrad(uSkyCube, skyDir, dFdx(skyDir), dFdy(skyDir)).rgb, vec3(2.2)) * BH_SKY_HDR_SCALE;
    fragColor = vec4((accumRgb + trans * skyCol) * uExposureScale, primaryDiskR);
    return;
  }

  // Strong-field / disk zone (T1 transfer LUT vs T2/T3 RK4 + volumetric crossings)
  vec4 rCross = vec4(0.0);
  float rSlice = bhObserverSliceCoord(rObs);
  float phi1 = phi0 + BH_PI;
  float phi2 = phi0 + 2.0 * BH_PI;
  float phi3 = phi0 + 3.0 * BH_PI;

  if (uTierMode >= 1.5 && cosTheta > 0.0 && b < 17.5) {
    bool rkEsc;
    float rkPhiInf;
    bhInPlaneRK4(bShadow, rObs, phi0, phi1, phi2, phi3, int(uMarchSteps), rCross, rkPhiInf, rkEsc);
    if (b < 8.5) escaped = rkEsc;
  } else if (cosTheta > 0.0) {
    vec2 s0 = bhSampleTransfer(uTransferLut, bLut, phi0, rSlice);
    vec2 s1 = bhSampleTransfer(uTransferLut, bLut, phi1, rSlice);
    vec2 s2 = bhSampleTransfer(uTransferLut, bLut, phi2, rSlice);
    rCross.x = (s0.x > 0.01 && s0.x < 0.99) ? (1.0 / s0.x) : 0.0;
    rCross.y = (s1.x > 0.01 && s1.x < 0.99) ? (1.0 / s1.x) : 0.0;
    rCross.z = (s2.x > 0.01 && s2.x < 0.99) ? (1.0 / s2.x) : 0.0;
  }

  // Accumulate up to 4 relativistic disk images front-to-back
  float phis[4] = float[4](phi0, phi1, phi2, phi3);
  float rs[4] = float[4](rCross.x, rCross.y, rCross.z, rCross.w);
  for (int k = 0; k < 4; ++k) {
    float rk = rs[k];
    if (rk <= 0.0 || trans <= 0.02) continue;
    float pk = phis[k];
    vec3 hitPos = (cos(pk) * e1 + sin(pk) * e2) * rk;
    float dPhi;
    vec4 dCol = bhShadeDiskCrossing(
      rk, hitPos, rayDir, b, sinTheta0, sinPsi, rObs, uTime, uSpinSense, isKerr,
      uHold, uHeat, uOrchid, uBlackbodyLut, uDiskTurbulence, uDiskCache30Hz,
      uUseCache30Hz, uCacheSubDt, taps, dPhi
    );
    // T2 volumetric Gaussian slab boost near grazing angles
    if (uTierMode >= 1.5 && dCol.a > 0.01) {
      float hSlab = bhDiskHalfHeight(rk, isKerr > 0.5 ? BH_KERR_ISCO_R : BH_DISK_R_IN);
      float volGain = 1.0 + 0.18 * clamp(hSlab / max(0.1, rk * 0.05), 0.0, 1.5);
      dCol.rgb *= volGain;
    }
    accumRgb += trans * dCol.rgb;
    trans *= (1.0 - dCol.a);
    if (primaryDiskR < 0.0 && dCol.a > 0.08) primaryDiskR = rk;
  }

  // Analytic 1-2px photon ring at b_c via fwidth(b) (zero shimmer)
  float db = max(fwidth(bShadow), 0.0025);
  float ringDist = abs(bShadow - BH_BC);
  float photonRing = exp(-0.5 * (ringDist * ringDist) / (1.15 * 1.15 * db * db));
  float gRing = bhLuminetG(BH_PHOTON_R + 0.02, b, sinTheta0, sinPsi, uSpinSense, rObs, isKerr);
  mediump vec3 ringCol = mix(bhSampleBlackbody(uBlackbodyLut, 0.92, gRing), uOrchid * 1.4, 0.18 + 0.25 * uHold);
  accumRgb += trans * ringCol * photonRing * (0.95 + 0.45 * uHold) * pow(gRing, 1.8);

  // Deflected background cubemap with clamped ray differentials
  mediump vec3 skyCol = vec3(0.0);
  if (escaped && trans > 0.005) {
    float alphaBlend = mix(alphaLut, bhWeakFieldDeflection(b), smoothstep(16.5, 19.0, b) * uCheatsEnabled);
    float thetaObs = acos(cosTheta);
    float phiInf = (BH_PI - thetaObs) + alphaBlend;
    vec3 skyDir = normalize(cos(phiInf) * e1 + sin(phiInf) * e2);
    vec3 dDx = clamp(dFdx(skyDir), vec3(-0.08), vec3(0.08));
    vec3 dDy = clamp(dFdy(skyDir), vec3(-0.08), vec3(0.08));
    skyCol = pow(textureGrad(uSkyCube, skyDir, dDx, dDy).rgb, vec3(2.2)) * BH_SKY_HDR_SCALE;
  }

  fragColor = vec4((accumRgb + trans * skyCol) * uExposureScale, primaryDiskR);
}
`;
