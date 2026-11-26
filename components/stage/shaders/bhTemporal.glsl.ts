import { glslBhConstantsHeader } from '@/stage/blackhole/constants';

export const bhTemporalFragmentShader = /* glsl */ `
precision highp float;

${glslBhConstantsHeader}

uniform sampler2D uCurTex;
uniform sampler2D uHistoryTex;
uniform mat4 uInvCurProjView;
uniform mat4 uPrevProjView;
uniform vec3 uCamPos;
uniform vec3 uPrevCamPos;
uniform vec2 uCurTexelSize;
uniform float uDt;
uniform float uSpinSense;
uniform float uHistoryWeight; // 0.0 when cheats off / full res, ~0.84 during temporal upsample

in vec2 vUv;
out vec4 fragColor;

vec3 rgbToYCoCg(vec3 c) {
  return vec3(
    0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
    0.5 * c.r - 0.5 * c.b,
    -0.25 * c.r + 0.5 * c.g - 0.25 * c.b
  );
}

vec3 yCoCgToRgb(vec3 ycc) {
  float tmp = ycc.x - ycc.z;
  return vec3(tmp + ycc.y, ycc.x + ycc.z, tmp - ycc.y);
}

void main() {
  vec4 curSample = texture(uCurTex, vUv);
  vec3 cur = curSample.rgb;
  float diskR = curSample.a;

  if (uHistoryWeight <= 0.01) {
    fragColor = vec4(cur, 1.0);
    return;
  }

  // Reconstruct world velocity: analytic Keplerian rotation on disk pixels, distant sky ray for others
  vec4 wpNear = uInvCurProjView * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec4 wpFar  = uInvCurProjView * vec4(vUv * 2.0 - 1.0,  1.0, 1.0);
  vec3 rayDir = normalize(wpFar.xyz / wpFar.w - wpNear.xyz / wpNear.w);

  vec3 prevWorldPos;
  if (diskR > 1.0 && abs(rayDir.y) > 1e-4) {
    float tPlane = -uCamPos.y / rayDir.y;
    vec3 hitPos = tPlane > 0.0 ? (uCamPos + rayDir * tPlane) : (uCamPos + rayDir * 24.0);
    float rSafe = max(BH_DISK_R_IN, diskR);
    float omega = sqrt(BH_M / (rSafe * rSafe * rSafe)) * BH_SCREEN_TIME_SCALE * uSpinSense;
    float dPhi = -omega * min(uDt, 0.05);
    float c = cos(dPhi), s = sin(dPhi);
    prevWorldPos = vec3(hitPos.x * c - hitPos.z * s, hitPos.y, hitPos.x * s + hitPos.z * c);
  } else {
    prevWorldPos = uPrevCamPos + rayDir * 800.0;
  }

  vec4 prevClip = uPrevProjView * vec4(prevWorldPos, 1.0);
  vec2 prevUv = (prevClip.xy / max(0.001, prevClip.w)) * 0.5 + 0.5;
  if (prevClip.w <= 0.0 || prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    fragColor = vec4(cur, 1.0);
    return;
  }

  // 3x3 YCoCg variance / AABB neighborhood clamp prevents ghosting
  vec3 m1 = vec3(0.0);
  vec3 m2 = vec3(0.0);
  for (int y = -1; y <= 1; ++y) {
    for (int x = -1; x <= 1; ++x) {
      vec3 c = rgbToYCoCg(texture(uCurTex, vUv + vec2(float(x), float(y)) * uCurTexelSize).rgb);
      m1 += c;
      m2 += c * c;
    }
  }
  vec3 mean = m1 / 9.0;
  vec3 stdDev = sqrt(max(vec3(0.0), m2 / 9.0 - mean * mean));
  vec3 cMin = mean - 1.45 * stdDev;
  vec3 cMax = mean + 1.45 * stdDev;

  vec3 histYcc = clamp(rgbToYCoCg(texture(uHistoryTex, prevUv).rgb), cMin, cMax);
  vec3 hist = yCoCgToRgb(histYcc);
  fragColor = vec4(mix(cur, hist, uHistoryWeight), 1.0);
}
`;
