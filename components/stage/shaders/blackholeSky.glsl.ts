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

  float vnoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm2(vec2 p) {
    float sum = 0.0;
    float amp = 0.52;
    for (int i = 0; i < 3; i++) {
      sum += amp * vnoise2(p);
      p = p * 2.07 + vec2(3.1, 1.7);
      amp *= 0.5;
    }
    return sum;
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

  mediump vec3 sampleDeepNebula(vec3 dir, mediump vec3 accentDim, mediump vec3 accentAbyss, mediump vec3 amber) {
    vec2 sp = vec2(atan(dir.x, -dir.z), asin(clamp(dir.y, -1.0, 1.0)));
    float n1 = fbm2(sp * 2.6 + vec2(1.4, -0.7));
    float n2 = fbm2(sp * 5.2 + vec2(n1 * 1.4, -2.2));
    float band = exp(-abs(sp.y + 0.18 * sin(sp.x * 1.8)) * 4.2);
    float wisp = smoothstep(0.50, 0.88, n1 * 0.65 + n2 * 0.35) * (0.25 + 0.75 * band);

    mediump vec3 umberVeil = amber * vec3(0.14, 0.07, 0.04);
    mediump vec3 roseViolet = mix(accentAbyss * 0.95, accentDim * 0.45, smoothstep(0.45, 0.85, n2));
    return mix(umberVeil, roseViolet, smoothstep(0.32, 0.72, n1)) * wisp * 0.075;
  }

  // Far-distance quiet galaxy barely peeking out of the dark upper-right cosmos
  mediump vec3 sampleDistantGalaxy(vec3 dir, mediump vec3 accent, mediump vec3 accentAbyss, mediump vec3 amber) {
    vec3 anchor = normalize(vec3(0.28, 0.16, -0.946));
    float cosSep = dot(dir, anchor);
    if (cosSep < 0.992) return vec3(0.0);

    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), anchor));
    vec3 gy = cross(anchor, gx);
    vec2 p = vec2(dot(dir, gx), dot(dir, gy)) / 0.036;

    float ca = 0.848;
    float sa = 0.530;
    vec2 q = vec2(p.x * ca - p.y * sa, (p.x * sa + p.y * ca) * 3.6);

    float r = length(q);
    float theta = atan(q.y, q.x);
    float arm = 0.55 + 0.45 * sin(2.0 * (theta - 2.6 * log(max(r, 0.08))));
    float core = exp(-r * r * 14.0);
    float disk = exp(-r * 2.85) * mix(0.65, 1.18, arm);
    float dustSplit = 1.0 - 0.52 * exp(-pow(q.y * 5.0, 2.0)) * smoothstep(0.12, 0.45, r);
    float mask = smoothstep(1.35, 0.15, r);

    mediump vec3 coreCol = mix(amber, vec3(1.00, 0.92, 0.84), 0.72);
    mediump vec3 haloCol = mix(vec3(0.46, 0.62, 0.92), mix(accentAbyss, accent * 0.55, 0.42), 0.58);
    return (coreCol * core * 0.24 + haloCol * disk * dustSplit * 0.11) * mask;
  }

  mediump vec3 starLayer(vec2 cubeUv, float faceId, float scale, float densityCut, float minCellPsf, float layerGain) {
    vec2 grid = cubeUv * scale + vec2(faceId * 37.0, faceId * 19.0);
    vec2 cell = floor(grid);
    vec2 local = fract(grid);

    float invTwoSigma2 = 0.5 / (minCellPsf * minCellPsf);
    mediump vec3 sum = vec3(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 nCell = cell + vec2(float(i), float(j));
        vec3 rnd = hash32(nCell + vec2(scale * 0.13, faceId * 7.1));
        if (rnd.x > densityCut) {
          vec2 starPos = vec2(float(i), float(j)) + vec2(0.24 + 0.52 * rnd.y, 0.24 + 0.52 * rnd.z);
          vec2 diff = local - starPos;
          float g = exp(-dot(diff, diff) * invTwoSigma2);
          float magSeed = hash12(nCell.yx + vec2(faceId * 11.3, scale * 0.07));
          sum += blackbodyStarColor(rnd.y) * (g * pow(magSeed, 9.2) * layerGain);
        }
      }
    }
    return sum;
  }

  mediump vec3 sampleDeepSpaceStatic(
    vec3 dir,
    float basePsfRad,
    mediump vec3 bgCol,
    mediump vec3 accent,
    mediump vec3 accentDim,
    mediump vec3 accentAbyss,
    mediump vec3 amber
  ) {
    float faceId;
    vec2 cubeUv;
    projectCubeFace(dir, faceId, cubeUv);
    mediump vec3 stars = vec3(0.0);
    stars += starLayer(cubeUv, faceId, 175.0, 0.915, clamp(basePsfRad * 175.0 * 1.35, 0.085, 0.16), 1.45);
    stars += starLayer(cubeUv, faceId, 340.0, 0.905, clamp(basePsfRad * 340.0 * 1.25, 0.125, 0.22), 0.65);

    mediump vec3 nebula = sampleDeepNebula(dir, accentDim, accentAbyss, amber);
    mediump vec3 distantGal = sampleDistantGalaxy(dir, accent, accentAbyss, amber);
    return bgCol + nebula + distantGal + stars;
  }
`;
