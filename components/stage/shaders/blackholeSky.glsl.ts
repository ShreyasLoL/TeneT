export const blackHoleSkyNoiseGlsl = /* glsl */ `
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
`;

export const blackHoleSkyGlsl = /* glsl */ `
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

  // Ultra-faint unresolved background star dust only; crisp stars render at native res in DeepStars
  mediump vec3 unresolvedDustLayer(vec2 cubeUv, float faceId, float m87VoidMask) {
    vec2 grid = cubeUv * 410.0 + vec2(faceId * 37.0, faceId * 19.0);
    vec2 cell = floor(grid);
    vec2 local = fract(grid);
    vec3 rnd = hash32(cell + vec2(51.3, faceId * 7.1));
    if (rnd.x < 0.925) return vec3(0.0);
    vec2 d = local - vec2(0.25 + 0.5 * rnd.y, 0.25 + 0.5 * rnd.z);
    float g = exp(-dot(d, d) / (2.0 * 0.16 * 0.16));
    float mag = pow(hash12(cell.yx + vec2(faceId * 11.3, 9.7)), 10.0);
    return vec3(0.75, 0.80, 0.92) * (g * mag * 0.32 * m87VoidMask);
  }

  mediump vec3 sampleSubtleSkyWisps(vec3 dir, mediump vec3 accentDim, mediump vec3 accentAbyss, float m87VoidMask) {
    vec2 sp = vec2(atan(dir.x, -dir.z), asin(clamp(dir.y, -1.0, 1.0)));
    float n1 = fbm2(sp * 3.1 + vec2(1.4, -0.7));
    float n2 = fbm2(sp * 6.4 + vec2(n1 * 1.6, -2.2));
    float darkPocket = smoothstep(0.35, 0.78, fbm2(sp * 1.8 + vec2(-2.1, 0.8)));

    // Localized mid-top [O III] emerald-green gas pocket (and its natural gravitationally-lensed counter-arc)
    vec3 anchorMidTopGas = normalize(vec3(0.028, 0.133, -0.991));
    float dG = acos(clamp(dot(dir, anchorMidTopGas), -1.0, 1.0));
    float gPatch = exp(-dG * dG / (2.0 * 0.086 * 0.086));
    float greenCloud = gPatch * smoothstep(0.34, 0.86, n1 * 0.6 + n2 * 0.4);

    mediump vec3 oiiiEmerald = mix(vec3(0.035, 0.42, 0.25), vec3(0.06, 0.30, 0.38), smoothstep(0.35, 0.78, n2));
    mediump vec3 midTopGas = oiiiEmerald * greenCloud * 0.175;
    mediump vec3 faintAbyss = mix(accentAbyss, accentDim * 0.4, n2) * smoothstep(0.58, 0.92, n1 * 0.65 + n2 * 0.35) * darkPocket * 0.032;
    return (midTopGas + faintAbyss) * m87VoidMask;
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
    vec3 anchorM87 = normalize(vec3(0.282, -0.115, -0.952));
    float dM87 = acos(clamp(dot(dir, anchorM87), -1.0, 1.0));
    float m87VoidMask = smoothstep(0.145, 0.265, dM87);

    float faceId;
    vec2 cubeUv;
    projectCubeFace(dir, faceId, cubeUv);
    mediump vec3 dust = unresolvedDustLayer(cubeUv, faceId, m87VoidMask) * step(0.0, basePsfRad);

    mediump vec3 leftNeb = sampleLeftNebulaAndPillars(dir, accentDim, accentAbyss, amber);
    mediump vec3 wisps = sampleSubtleSkyWisps(dir, accentDim, accentAbyss, m87VoidMask);
    mediump vec3 m104 = sampleSombreroM104(dir, amber, accentAbyss);
    mediump vec3 hoag = sampleHoagsObject(dir, amber);
    mediump vec3 helix = sampleHelixNebula(dir, accent, accentAbyss);
    mediump vec3 m87 = sampleDistantM87(dir, anchorM87, amber);

    return bgCol + wisps + (leftNeb + m104 + hoag + helix) * m87VoidMask + m87 + dust;
  }
`;
