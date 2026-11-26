import { bhCommonGlsl } from './bhCommon.glsl';

export const bhStarSpritesVertexShader = /* glsl */ `
precision highp float;

in vec4 aStarDirFlux; // xyz: unit dir, w: flux
in float aStarTemp;   // 0..1 normalized blackbody temperature

uniform sampler2D uDeflectionLut;
uniform sampler2D uBlackbodyLut;
uniform vec3 uCamPos;
uniform mat4 uViewProj;
uniform vec2 uViewport;
uniform float uExposureScale;

out vec2 vQuadUv;
out vec3 vStarCol;
out float vAlpha;

${bhCommonGlsl}

void main() {
  // Even instance = primary image outside Einstein ring; Odd instance = secondary opposite-side lensed image
  bool isSecondary = (gl_InstanceID & 1) == 1;
  vec3 starDir = normalize(aStarDirFlux.xyz);
  float flux = aStarDirFlux.w;

  // Multi-layer foreground parallax for brightest stars (effective shell 140..240 rs)
  float parallaxDist = mix(240.0, 140.0, clamp(flux * 0.25, 0.0, 1.0));
  vec3 parallaxDir = normalize(starDir * parallaxDist - uCamPos);

  float rObs = length(uCamPos);
  vec3 e1 = uCamPos / max(rObs, 1e-4);
  float cosBeta = clamp(dot(-parallaxDir, e1), -1.0, 1.0);
  float beta = acos(cosBeta);
  float sinBeta = max(1e-4, sin(beta));

  vec3 perp = parallaxDir + cosBeta * e1;
  float perpLen = length(perp);
  vec3 e2 = perpLen > 1e-5 ? (perp / perpLen) : normalize(cross(e1, vec3(0.0, 1.0, 0.0)));
  if (isSecondary) {
    e2 = -e2;
    beta = BH_TAU - beta;
  }

  // Einstein angular radius theta_E = sqrt(2 * rs / rObs)
  float thetaE = sqrt((2.0 * BH_RS) / max(4.0, rObs));
  float bBeta = isSecondary ? (2.0 * BH_PI - beta) : beta;
  float theta = isSecondary
    ? 0.5 * (-bBeta + sqrt(bBeta * bBeta + 4.0 * thetaE * thetaE))
    : 0.5 * (bBeta + sqrt(bBeta * bBeta + 4.0 * thetaE * thetaE));

  // 2-step Newton refinement against baked deflection_lut alpha(b)
  float obsLapse = sqrt(max(1e-4, 1.0 - BH_RS / max(BH_RS + 0.05, rObs)));
  float b = (rObs * sin(theta)) / obsLapse;
  for (int it = 0; it < 2; ++it) {
    float alpha = texture(uDeflectionLut, vec2(bhBToLutU(b), 0.5)).g;
    float f = theta - alpha - (isSecondary ? -bBeta : bBeta);
    float thetaP = theta + 0.002;
    float bP = (rObs * sin(thetaP)) / obsLapse;
    float alphaP = texture(uDeflectionLut, vec2(bhBToLutU(bP), 0.5)).g;
    float df = ((thetaP - alphaP) - (theta - alpha)) / 0.002;
    theta = clamp(theta - f / max(0.15, abs(df)), 0.001, BH_PI * 0.98);
    b = (rObs * sin(theta)) / obsLapse;
  }

  // Cull secondary images trapped behind the shadow radius b_c or faint far-side stars
  float esc = texture(uDeflectionLut, vec2(bhBToLutU(b), 0.5)).b;
  if (b < BH_BC * 1.015 || esc < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    return;
  }

  // Gravitational magnification mu = |(sin(theta)/sin(beta)) * dtheta/dbeta|
  float muTang = clamp(sin(theta) / sinBeta, 0.5, 5.5);
  float uRatio = (thetaE * thetaE) / max(1e-5, theta * theta);
  float muRad = clamp(1.0 / max(0.2, abs(1.0 - uRatio * uRatio)), 0.3, 2.2);
  float mu = min(6.0, muTang * muRad);

  vec3 lensedDir = normalize(-cos(theta) * e1 + sin(theta) * e2);
  vec3 worldCenter = uCamPos + lensedDir * 100.0;
  vec4 clip = uViewProj * vec4(worldCenter, 1.0);
  if (clip.w <= 0.0 || abs(clip.x) > clip.w * 1.15 || abs(clip.y) > clip.w * 1.15) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    return;
  }

  // Tangential arc direction in screen NDC
  vec3 tangWorld = normalize(cross(e1, lensedDir) + vec3(1e-5));
  vec4 clipTang = uViewProj * vec4(worldCenter + tangWorld * 0.5, 1.0);
  vec2 ndcC = clip.xy / clip.w;
  vec2 ndcT = clipTang.xy / max(0.001, clipTang.w);
  vec2 tangScreen = normalize((ndcT - ndcC) * uViewport + vec2(1e-4, 0.0));
  vec2 radScreen = vec2(-tangScreen.y, tangScreen.x);

  float baseRadiusPx = clamp(1.6 + sqrt(flux) * 2.1, 1.5, 5.5);
  float tangPx = baseRadiusPx * muTang;
  float radPx = baseRadiusPx * muRad;

  vec2 offsetPx = position.x * tangScreen * tangPx + position.y * radScreen * radPx;
  vec2 ndcPos = ndcC + (offsetPx * 2.0) / max(uViewport, vec2(1.0));

  gl_Position = vec4(ndcPos * clip.w, clip.z, clip.w);
  vQuadUv = uv;

  // Flux-conserving Gaussian peak: integrated area ~ tangPx * radPx
  float areaFactor = (baseRadiusPx * baseRadiusPx) / max(1.0, tangPx * radPx);
  vStarCol = texture(uBlackbodyLut, vec2(clamp(aStarTemp, 0.0, 1.0), 0.5)).rgb;
  vAlpha = clamp(flux * 0.22 * mu * areaFactor * uExposureScale, 0.0, 2.5);
}
`;

export const bhStarSpritesFragmentShader = /* glsl */ `
precision mediump float;

in vec2 vQuadUv;
in vec3 vStarCol;
in float vAlpha;

out vec4 fragColor;

void main() {
  if (vAlpha <= 0.002) discard;
  vec2 c = (vQuadUv - 0.5) * 2.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float psf = exp(-r2 * 4.5) * (1.0 - r2);
  fragColor = vec4(vStarCol * psf * vAlpha, 1.0);
}
`;
