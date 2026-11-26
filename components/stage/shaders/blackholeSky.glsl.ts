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

  // Distant emission nebulae mixing [O III] emerald/teal, rose-pink H-alpha, and warm umber over deep negative space
  mediump vec3 sampleDeepNebula(
    vec3 dir,
    mediump vec3 accentDim,
    mediump vec3 accentAbyss,
    mediump vec3 amber,
    float m87VoidMask
  ) {
    vec2 sp = vec2(atan(dir.x, -dir.z), asin(clamp(dir.y, -1.0, 1.0)));
    float n1 = fbm2(sp * 3.1 + vec2(1.4, -0.7));
    float n2 = fbm2(sp * 6.4 + vec2(n1 * 1.6, -2.2));
    float darkPocket = smoothstep(0.32, 0.74, fbm2(sp * 1.9 + vec2(-2.1, 0.8)));

    // Distant [O III] emerald-teal emission complex in upper-left & subtle upper-center-right cloud
    vec3 anchorG1 = normalize(vec3(-0.344, -0.044, -0.938));
    vec3 anchorG2 = normalize(vec3(0.020, 0.141, -0.990));
    float dG1 = acos(clamp(dot(dir, anchorG1), -1.0, 1.0));
    float dG2 = acos(clamp(dot(dir, anchorG2), -1.0, 1.0));
    float gPatch1 = exp(-dG1 * dG1 / (2.0 * 0.115 * 0.115));
    float gPatch2 = exp(-dG2 * dG2 / (2.0 * 0.088 * 0.088)) * 0.72;
    float greenCloud = (gPatch1 + gPatch2) * smoothstep(0.34, 0.86, n1 * 0.6 + n2 * 0.4);

    mediump vec3 oiiiEmerald = mix(vec3(0.035, 0.42, 0.25), vec3(0.06, 0.30, 0.38), smoothstep(0.35, 0.78, n2));
    mediump vec3 umberRose = mix(amber * vec3(0.18, 0.085, 0.045), mix(accentAbyss * 1.15, accentDim * 0.56, n2), 0.58);
    float ambientWisp = smoothstep(0.55, 0.90, n1 * 0.65 + n2 * 0.35) * darkPocket * 0.048;

    mediump vec3 col = oiiiEmerald * greenCloud * 0.21 + umberRose * (ambientWisp + (gPatch1 + gPatch2) * n2 * 0.075);
    return col * m87VoidMask;
  }

  mediump vec3 evalDistantGalaxy(
    vec3 dir,
    vec3 anchor,
    float scaleRad,
    float tiltAngle,
    float flatness,
    float gain,
    mediump vec3 coreCol,
    mediump vec3 haloCol
  ) {
    float cosSep = dot(dir, anchor);
    if (cosSep < 0.990) return vec3(0.0);

    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), anchor));
    vec3 gy = cross(anchor, gx);
    vec2 p = vec2(dot(dir, gx), dot(dir, gy)) / scaleRad;

    float ca = cos(tiltAngle);
    float sa = sin(tiltAngle);
    vec2 q = vec2(p.x * ca - p.y * sa, (p.x * sa + p.y * ca) * flatness);

    float r = length(q);
    float theta = atan(q.y, q.x);
    float arm = 0.55 + 0.45 * sin(2.0 * (theta - 2.6 * log(max(r, 0.08))));
    float core = exp(-r * r * 14.0);
    float disk = exp(-r * 2.85) * mix(0.65, 1.18, arm);
    float dustSplit = 1.0 - 0.52 * exp(-pow(q.y * 5.0, 2.0)) * smoothstep(0.12, 0.45, r);
    float mask = smoothstep(1.35, 0.15, r);

    return (coreCol * core + haloCol * disk * dustSplit * 0.46) * mask * gain;
  }

  // Messier 87*-style distant supermassive black hole & pale-blue relativistic jet inside the big bottom-right void
  mediump vec3 sampleDistantM87(vec3 dir, vec3 anchorM87, mediump vec3 amber) {
    float cosSep = dot(dir, anchorM87);
    if (cosSep < 0.994) return vec3(0.0);

    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), anchorM87));
    vec3 gy = cross(anchorM87, gx);
    vec2 p = vec2(dot(dir, gx), dot(dir, gy));
    float r = length(p);
    float theta = atan(p.y, p.x);

    // Authentic soft EHT blurry amber-crimson crescent (with subtle asymmetry knots, never a sharp flat ring)
    float shadowCut = smoothstep(0.0026, 0.0052, r);
    float ringMain = exp(-pow((r - 0.0072) / 0.0034, 2.0)) * shadowCut;
    float outerHaze = exp(-max(0.0, r - 0.0068) * 115.0) * 0.28 * shadowCut;
    float asym = 0.22 + 0.78 * pow(clamp(0.5 + 0.5 * cos(theta + 2.25), 0.0, 1.0), 1.4);
    float knots = 0.82 + 0.18 * cos(theta * 3.0 - 1.1) + 0.12 * sin(theta * 5.0 + 0.4);

    mediump vec3 ehtDarkRed = vec3(0.58, 0.12, 0.02);
    mediump vec3 ehtBright = mix(vec3(0.95, 0.38, 0.06), amber, 0.55);
    mediump vec3 ehtCol = mix(ehtDarkRed, ehtBright, clamp(asym * knots, 0.0, 1.0));
    mediump vec3 m87Ring = ehtCol * (ringMain * asym * knots * 0.62 + outerHaze * asym * 0.55);

    // Delicate, diffuse synchrotron plasma jet tapering smoothly into the dark void
    vec2 jAxis = normalize(vec2(-0.82, 0.57));
    vec2 jPerpAxis = vec2(-jAxis.y, jAxis.x);
    float along = dot(p, jAxis);
    float perp = abs(dot(p, jPerpAxis));
    float jetKnots = 0.72 + 0.28 * sin(along * 260.0);
    float jet =
      smoothstep(0.006, 0.015, along) *
      exp(-max(0.0, along - 0.010) * 58.0) *
      exp(-pow(perp / (0.0009 + 0.036 * max(along, 0.0)), 2.0));
    mediump vec3 jetCol = vec3(0.54, 0.74, 0.98) * (jet * jetKnots * 0.15);

    return m87Ring + jetCol;
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

  mediump vec3 sampleDeepSpaceStatic(
    vec3 dir,
    float basePsfRad,
    mediump vec3 bgCol,
    mediump vec3 accent,
    mediump vec3 accentDim,
    mediump vec3 accentAbyss,
    mediump vec3 amber
  ) {
    vec3 anchorM87 = normalize(vec3(0.328, -0.128, -0.936));
    float dM87 = acos(clamp(dot(dir, anchorM87), -1.0, 1.0));
    float m87VoidMask = smoothstep(0.145, 0.265, dM87);

    float faceId;
    vec2 cubeUv;
    projectCubeFace(dir, faceId, cubeUv);
    mediump vec3 dust = unresolvedDustLayer(cubeUv, faceId, m87VoidMask) * step(0.0, basePsfRad);

    mediump vec3 nebula = sampleDeepNebula(dir, accentDim, accentAbyss, amber, m87VoidMask);

    mediump vec3 gGold = mix(amber, vec3(1.00, 0.92, 0.84), 0.72);
    mediump vec3 gBlueViolet = mix(vec3(0.46, 0.62, 0.92), mix(accentAbyss, accent * 0.55, 0.42), 0.58);
    mediump vec3 gTeal = vec3(0.55, 0.80, 0.96);
    mediump vec3 gRose = mix(accent * 0.65, vec3(0.95, 0.56, 0.74), 0.5);

    mediump vec3 galaxies = vec3(0.0);
    galaxies += evalDistantGalaxy(dir, normalize(vec3(0.262, 0.162, -0.951)), 0.036, 0.56, 3.6, 0.24, gGold, gBlueViolet);
    galaxies += evalDistantGalaxy(dir, normalize(vec3(-0.382, -0.017, -0.924)), 0.025, -0.84, 4.6, 0.18, gGold, gTeal);
    galaxies += evalDistantGalaxy(dir, normalize(vec3(-0.234, -0.356, -0.905)), 0.025, 0.31, 3.0, 0.19, gGold, gRose);
    galaxies += evalDistantGalaxy(dir, normalize(vec3(-0.210, 0.073, -0.975)), 0.018, -0.28, 2.2, 0.14, vec3(0.96, 0.88, 0.76), gBlueViolet);

    mediump vec3 m87 = sampleDistantM87(dir, anchorM87, amber);
    return bgCol + nebula + galaxies * m87VoidMask + m87 + dust;
  }
`;
