import { bhCommonGlsl } from './bhCommon.glsl';

export const bhParticlesRenderVertexShader = /* glsl */ `
precision highp float;

in vec4 aPartInit; // x: r0, y: phi0, z: z0, w: packedSeed
in vec2 aCohortMeta; // x: slot 0..15, y: area 0..2

uniform sampler2D uStatePos;
uniform sampler2D uCohortTex;
uniform sampler2D uDeflectionLut;
uniform sampler2D uBlackbodyLut;

uniform float uUseGpgpu;
uniform float uTime;
uniform float uSpinSense;
uniform float uKerrMode;
uniform float uHold;
uniform float uIntro;
uniform float uExposureScale;
uniform float uFocusArea;
uniform float uRecapJudge;
uniform float uRecapSpike;
uniform float uParticleScale;
uniform vec3 uCamPos;
uniform mat4 uViewProj;
uniform vec2 uViewport;
uniform vec3 uOrchid;

out vec2 vQuadUv;
out vec3 vColor;
out float vAlpha;

${bhCommonGlsl}

void main() {
  float r = aPartInit.x;
  float phi = aPartInit.y;
  float z = aPartInit.z;
  float seed = fract(aPartInit.w);
  float ageFade = 1.0;

  int slot = int(clamp(floor(aCohortMeta.x + 0.5), 0.0, 15.0));
  vec4 cohortData = texelFetch(uCohortTex, ivec2(slot, 0), 0);
  float dirSmooth = cohortData.r;
  float phiCohort = cohortData.a;

  if (uUseGpgpu > 0.5) {
    int id = gl_InstanceID;
    ivec2 coord = ivec2(id & 511, (id >> 9) & 511);
    vec4 st = texelFetch(uStatePos, coord, 0);
    // Small deterministic offset for tiled instances > 32k
    float tileIdx = float(id >> 15);
    r = st.x;
    phi = st.y * BH_TAU + tileIdx * 0.785398;
    z = st.z;
    ageFade = st.w;
  } else {
    float rIn = uKerrMode > 0.5 ? BH_KERR_ISCO_R : BH_ISCO_R;
    r = mix(r, rIn * 0.96, uHold * 0.35);
    float geomOmega = uKerrMode > 0.5
      ? sqrt(BH_M) / (pow(r, 1.5) + BH_KERR_A * sqrt(BH_M))
      : sqrt(BH_M / (r * r * r));
    float omega = geomOmega * BH_SCREEN_TIME_SCALE * uSpinSense;
    phi = phi + omega * (uTime + phiCohort * 0.25 * dirSmooth);
    // Gentle vertical flare oscillation
    z *= (1.0 - uHold * 0.45);
  }

  // World position in equatorial XZ plane (Y = vertical)
  vec3 worldPos = vec3(r * cos(phi), z, r * sin(phi));
  vec3 toCam = uCamPos - worldPos;
  float distCam = length(toCam);

  // Impact parameter & gravitational occlusion/deflection for far-side particles
  float rObs = length(uCamPos);
  vec3 e1 = uCamPos / max(rObs, 1e-4);
  vec3 rayDir = -toCam / max(distCam, 1e-4);
  float cosTheta = dot(-rayDir, e1);
  vec3 perp = rayDir + cosTheta * e1;
  float sinTheta = length(perp);
  float obsLapse = sqrt(max(1e-4, 1.0 - BH_RS / max(BH_RS + 0.05, rObs)));
  float b = (rObs * sinTheta) / obsLapse;

  bool behindHole = dot(worldPos, e1) < 0.0;
  if (behindHole && b < BH_BC * 1.02) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    return;
  }

  // Mild lensing push outward for far-side particles near Einstein ring
  if (behindHole && sinTheta > 1e-4 && b < 14.0) {
    float alpha = texture(uDeflectionLut, vec2(bhBToLutU(b), 0.5)).g;
    vec3 e2 = perp / sinTheta;
    worldPos += e2 * (alpha * r * 0.42);
  }

  vec4 clip = uViewProj * vec4(worldPos, 1.0);
  if (clip.w <= 0.0 || abs(clip.x) > clip.w * 1.15 || abs(clip.y) > clip.w * 1.15) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    return;
  }

  // Compute radial spaghettification stretch along projected BH->particle axis
  float tidal = (2.0 * BH_M) / max(1.1, r * r * r);
  float stretch = clamp(1.0 + 16.0 * tidal, 1.0, 8.5);
  float squeeze = inversesqrt(stretch);

  vec4 clipBh = uViewProj * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 ndcC = clip.xy / clip.w;
  vec2 ndcBh = clipBh.w > 0.01 ? (clipBh.xy / clipBh.w) : vec2(0.0);
  vec2 radScreen = normalize((ndcC - ndcBh) * uViewport + vec2(1e-4, 0.0));
  vec2 tangScreen = vec2(-radScreen.y, radScreen.x);

  float basePx = clamp((18.0 / max(4.0, distCam)) * (0.9 + 1.4 * seed) * uParticleScale, 1.0, 6.5);
  vec2 offsetPx = position.x * radScreen * (basePx * stretch) + position.y * tangScreen * (basePx * squeeze);
  vec2 ndcPos = ndcC + (offsetPx * 2.0) / max(uViewport, vec2(1.0));
  gl_Position = vec4(ndcPos * clip.w, clip.z, clip.w);
  vQuadUv = uv;

  // Relativistic g^4 dimming + gravitational redshift toward crimson near horizon
  vec3 camRight = normalize(cross(vec3(0.0, 1.0, 0.0), e1) + vec3(1e-6, 0.0, 0.0));
  float sinTheta0 = sqrt(max(0.0, 1.0 - e1.y * e1.y));
  float sinPsi = sinTheta > 1e-4 ? dot(perp / sinTheta, camRight) : 0.0;
  float g = bhLuminetG(r, min(b, 20.0), sinTheta0, sinPsi, uSpinSense, rObs, uKerrMode);
  float gravFade = smoothstep(BH_RS + 0.01, BH_RS + 0.35, r);

  float tNorm = clamp(1.0 - (r - BH_ISCO_R) / (BH_DISK_R_OUT - BH_ISCO_R), 0.0, 1.0);
  vec3 bb = bhSampleBlackbody(uBlackbodyLut, tNorm * gravFade, g * gravFade);
  float satisfied = clamp(dirSmooth * 0.5 + 0.5, 0.0, 1.0);
  bb = mix(bb, uOrchid * 1.4, satisfied * 0.14 + uHold * 0.22);

  float hasFocus = step(-0.5, uFocusArea);
  float focusMatch = 1.0 - step(0.3, abs(aCohortMeta.y - uFocusArea));
  float focusDim = mix(1.0, mix(0.28, 1.2, focusMatch), hasFocus);

  float hasJudge = step(-0.5, uRecapJudge);
  float judgeMatch = 1.0 - step(0.3, abs(aCohortMeta.x - uRecapJudge));
  float recapBoost = mix(1.0, mix(0.65, 1.45 + uRecapSpike * 0.5, judgeMatch), hasJudge);

  float outerTaper = 1.0 - smoothstep(BH_DISK_R_OUT * 0.85, BH_DISK_R_TAPER, r);
  float g4 = pow(clamp(g * gravFade, 0.05, 1.8), 3.6);
  vColor = bb;
  vAlpha = clamp(0.48 * g4 * ageFade * outerTaper * uIntro * uExposureScale * focusDim * recapBoost, 0.0, 1.8);
}
`;

export const bhParticlesRenderFragmentShader = /* glsl */ `
precision mediump float;

in vec2 vQuadUv;
in vec3 vColor;
in float vAlpha;

out vec4 fragColor;

void main() {
  if (vAlpha <= 0.002) discard;
  vec2 c = (vQuadUv - 0.5) * 2.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float splat = exp(-r2 * 4.2) * (1.0 - r2);
  fragColor = vec4(vColor * splat * vAlpha, 1.0);
}
`;
