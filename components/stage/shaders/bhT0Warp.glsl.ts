import { bhCommonGlsl } from './bhCommon.glsl';
import { bhDiskGlsl } from './bhDisk.glsl';

export const bhT0WarpFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uDeflectionLut;
uniform sampler2D uBlackbodyLut;
uniform sampler2D uDiskTurbulence;
uniform samplerCube uSkyCube;

uniform vec3 uCamPos;
uniform mat4 uInvProjView;
uniform float uTime;
uniform float uSpinSense;
uniform float uHold;
uniform float uHeat;
uniform float uExposureScale;
uniform vec3 uOrchid;

in vec2 vUv;
out vec4 fragColor;

${bhCommonGlsl}
${bhDiskGlsl}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 wpNear = uInvProjView * vec4(ndc, -1.0, 1.0);
  vec4 wpFar  = uInvProjView * vec4(ndc,  1.0, 1.0);
  vec3 rayDir = normalize(wpFar.xyz / wpFar.w - wpNear.xyz / wpNear.w);

  float rObs = length(uCamPos);
  vec3 e1 = uCamPos / max(rObs, 1e-4);
  float cosTheta = clamp(dot(-rayDir, e1), -1.0, 1.0);
  vec3 perp = rayDir + cosTheta * e1;
  float sinTheta = length(perp);
  vec3 e2 = sinTheta > 1e-6 ? (perp / sinTheta) : normalize(cross(e1, vec3(0.0, 1.0, 0.0)));

  float obsLapse = sqrt(max(1e-4, 1.0 - BH_RS / max(BH_RS + 0.05, rObs)));
  float b = (rObs * sinTheta) / obsLapse;
  float sinTheta0 = sqrt(max(0.0, 1.0 - e1.y * e1.y));
  vec3 camRight = normalize(cross(vec3(0.0, 1.0, 0.0), e1) + vec3(1e-6, 0.0, 0.0));
  float sinPsi = dot(e2, camRight);

  vec4 defl = texture(uDeflectionLut, vec2(bhBToLutU(b), 0.5));
  float alpha = defl.g;
  bool escaped = defl.b > 0.5;

  vec3 accum = vec3(0.0);
  float trans = 1.0;
  float primaryR = -1.0;

  // Direct disk plane intersection (T0: zero ray integration)
  if (abs(rayDir.y) > 1e-4) {
    float tPlane = -uCamPos.y / rayDir.y;
    if (tPlane > 0.0) {
      vec3 hit = uCamPos + rayDir * tPlane;
      float rHit = length(hit.xz);
      // Only shade front half or outside shadow if behind hole
      if (rHit >= BH_DISK_R_IN && rHit <= BH_DISK_R_TAPER && (dot(hit, e1) > 0.0 || b >= BH_BC)) {
        float dPhi;
        vec4 dCol = bhShadeDiskCrossing(
          rHit, hit, rayDir, b, sinTheta0, sinPsi, rObs, uTime, uSpinSense, 0.0,
          uHold, uHeat, uOrchid, uBlackbodyLut, uDiskTurbulence, uDiskTurbulence,
          0.0, 0.0, 2, dPhi
        );
        accum += trans * dCol.rgb;
        trans *= (1.0 - dCol.a);
        if (dCol.a > 0.05) primaryR = rHit;
      }
    }
  }

  // Analytic lensed secondary arc around shadow b_c (upper/lower Gargantua arc)
  float arcBand = exp(-pow((b - BH_BC * 1.14) / 0.34, 2.0)) * smoothstep(0.08, 0.5, abs(e2.y));
  if (arcBand > 0.004 && escaped) {
    float gArc = bhLuminetG(BH_DISK_R_IN * 1.25, b, sinTheta0, sinPsi, uSpinSense, rObs, 0.0);
    mediump vec3 arcCol = bhSampleBlackbody(uBlackbodyLut, 0.85, gArc);
    accum += trans * arcCol * arcBand * pow(gArc, 3.2) * 0.72;
  }

  // Crisp analytic photon ring + baked soft radial halo (replaces Kawase bloom on T0)
  float db = max(fwidth(b), 0.003);
  float ringDist = abs(b - BH_BC);
  float ring = exp(-0.5 * (ringDist * ringDist) / (1.25 * 1.25 * db * db));
  float bakedGlow = exp(-max(0.0, b - BH_BC) * 1.55) * 0.28 * step(BH_BC * 0.96, b);
  float gRing = bhLuminetG(BH_PHOTON_R + 0.02, b, sinTheta0, sinPsi, uSpinSense, rObs, 0.0);
  mediump vec3 ringCol = mix(bhSampleBlackbody(uBlackbodyLut, 0.92, gRing), uOrchid * 1.35, 0.22);
  accum += trans * ringCol * (ring + bakedGlow) * pow(gRing, 1.5);

  if (escaped && trans > 0.01) {
    float phiInf = (BH_PI - acos(cosTheta)) + alpha;
    vec3 skyDir = normalize(cos(phiInf) * e1 + sin(phiInf) * e2);
    vec3 skyCol = pow(texture(uSkyCube, skyDir).rgb, vec3(2.2)) * BH_SKY_HDR_SCALE;
    accum += trans * skyCol;
  }

  fragColor = vec4(accum * uExposureScale, primaryR);
}
`;
