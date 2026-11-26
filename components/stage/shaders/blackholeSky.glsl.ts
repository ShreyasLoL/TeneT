export const blackHoleSkyGlsl = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 hash32(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
  }

  mediump vec3 blackbodyStarColor(mediump float t) {
    mediump vec3 cool = vec3(1.00, 0.64, 0.40);
    mediump vec3 mid = vec3(1.00, 0.96, 0.92);
    mediump vec3 hot = vec3(0.66, 0.82, 1.00);
    return t < 0.5 ? mix(cool, mid, t * 2.0) : mix(mid, hot, (t - 0.5) * 2.0);
  }

  void projectCubeFace(vec3 dir, out float faceId, out vec2 uv) {
    vec3 a = abs(dir);
    if (a.x >= a.y && a.x >= a.z) {
      faceId = dir.x > 0.0 ? 0.0 : 1.0;
      uv = vec2(-sign(dir.x) * dir.z, dir.y) / a.x;
    } else if (a.y >= a.x && a.y >= a.z) {
      faceId = dir.y > 0.0 ? 2.0 : 3.0;
      uv = vec2(dir.x, -sign(dir.y) * dir.z) / a.y;
    } else {
      faceId = dir.z > 0.0 ? 4.0 : 5.0;
      uv = vec2(sign(dir.z) * dir.x, dir.y) / a.z;
    }
  }

  mediump vec3 starLayer(
    vec2 cubeUv,
    float faceId,
    float scale,
    float densityCut,
    float minCellPsf,
    float rayDiff,
    float layerGain
  ) {
    float shearCells = rayDiff * scale;
    float aaFade = 1.0 - smoothstep(0.14, 0.42, shearCells);
    if (aaFade <= 0.005) return vec3(0.0);

    vec2 grid = cubeUv * scale + vec2(faceId * 37.0, faceId * 19.0);
    vec2 cell = floor(grid);
    vec2 local = fract(grid);

    float psf = clamp(max(minCellPsf, shearCells * 0.48), minCellPsf, 0.22);
    float invTwoSigma2 = 0.5 / (psf * psf);
    float fluxNorm = (minCellPsf * minCellPsf) / (psf * psf);

    mediump vec3 sum = vec3(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 nCell = cell + vec2(float(i), float(j));
        vec3 rnd = hash32(nCell + vec2(scale * 0.13, faceId * 7.1));
        if (rnd.x > densityCut) {
          vec2 starPos = vec2(float(i), float(j)) + vec2(0.24 + 0.52 * rnd.y, 0.24 + 0.52 * rnd.z);
          vec2 diff = local - starPos;
          float g = exp(-dot(diff, diff) * invTwoSigma2) * fluxNorm;
          float magSeed = hash12(nCell.yx + vec2(faceId * 11.3, scale * 0.07));
          sum += blackbodyStarColor(rnd.y) * (g * pow(magSeed, 9.2) * layerGain);
        }
      }
    }
    return sum * aaFade;
  }

  mediump vec3 sampleFarStars(vec3 dir, float rayDiff, float pxRad) {
    float faceId;
    vec2 cubeUv;
    projectCubeFace(dir, faceId, cubeUv);
    mediump vec3 stars = vec3(0.0);
    stars += starLayer(cubeUv, faceId, 175.0, 0.915, clamp(pxRad * 175.0 * 0.95, 0.055, 0.14), rayDiff, 1.35);
    stars += starLayer(cubeUv, faceId, 340.0, 0.905, clamp(pxRad * 340.0 * 0.85, 0.075, 0.18), rayDiff, 0.58);
    return stars;
  }
`;
