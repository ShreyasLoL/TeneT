export const blackHoleLandmarksGlsl = /* glsl */ `
  // Localized luminous top-left star-forming nebula (violet-blue-purple-pink-amber-cold blue-white) + Pillars of Creation (M16)
  mediump vec3 sampleLeftNebulaAndPillars(
    vec3 dir,
    mediump vec3 accent,
    mediump vec3 accentDim,
    mediump vec3 accentAbyss,
    mediump vec3 amber
  ) {
    vec3 anchorLeft = normalize(vec3(-0.342, -0.028, -0.939));
    float dLeft = acos(clamp(dot(dir, anchorLeft), -1.0, 1.0));
    if (dLeft > 0.19) return vec3(0.0);

    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), anchorLeft));
    vec3 gy = cross(anchorLeft, gx);
    vec2 localP = vec2(-dot(dir, gx), dot(dir, gy));
    // Slight diagonal elongation matching natural interstellar filament geometry
    vec2 rotP = vec2(localP.x * 0.88 - localP.y * 0.47, (localP.x * 0.47 + localP.y * 0.88) * 1.28);
    float dShape = length(rotP);
    vec2 uv = rotP * 16.5;

    // Two-stage domain warp for crisp telescopic gas curtains and ionization cavities
    vec2 q = vec2(fbm2(uv + vec2(1.4, -0.9)), fbm2(uv + vec2(4.6, -2.1)));
    float gasA = fbm2(uv * 1.55 + q * 1.35);
    float gasB = fbm2(uv * 3.10 - q * 1.10);

    float envOuter = exp(-dShape * dShape / (2.0 * 0.056 * 0.056)) * smoothstep(0.185, 0.095, dLeft);
    float envMid = exp(-dShape * dShape / (2.0 * 0.038 * 0.038));
    float envCore = exp(-dShape * dShape / (2.0 * 0.024 * 0.024));
    float density = envOuter * smoothstep(0.32, 0.82, gasA * 0.56 + gasB * 0.44);

    mediump vec3 cobaltBlue = vec3(0.06, 0.26, 0.72);
    mediump vec3 royalViolet = mix(vec3(0.24, 0.10, 0.56), accentAbyss * 1.45, 0.35);
    mediump vec3 deepPurple = mix(vec3(0.42, 0.11, 0.52), accentDim * 0.75, 0.40);
    mediump vec3 nebulaPink = mix(vec3(0.86, 0.28, 0.58), accent * 0.85, 0.40);
    mediump vec3 warmAmber = mix(amber, vec3(1.00, 0.68, 0.28), 0.45);
    mediump vec3 coldBlueWhite = vec3(0.76, 0.91, 1.00);

    // Distinct layered strata: outer cobalt blue -> royal violet -> purple veil
    mediump vec3 veilCol = mix(cobaltBlue, royalViolet, smoothstep(0.28, 0.62, gasA));
    veilCol = mix(veilCol, deepPurple, smoothstep(0.46, 0.80, gasB) * 0.78);

    // Sculpted H-alpha pink curtains, warm amber photo-dissociation ridges, and bright cold blue-white core
    float ridgeBlue = envOuter * smoothstep(0.42, 0.78, gasA) * smoothstep(0.20, 0.65, 1.0 - gasB);
    float ridgePink = envMid * smoothstep(0.48, 0.82, gasB) * smoothstep(0.34, 0.74, q.x);
    float ridgeAmber = envMid * exp(-pow((gasA - 0.54) / 0.10, 2.0)) * smoothstep(0.32, 0.76, gasB);
    float coreIon = envCore * smoothstep(0.42, 0.84, gasA * 0.55 + gasB * 0.45);

    mediump vec3 nebulaCol =
      veilCol * (density * 0.18) +
      cobaltBlue * (ridgeBlue * 0.14) +
      nebulaPink * (ridgePink * 0.17) +
      warmAmber * (ridgeAmber * 0.24) +
      coldBlueWhite * (coreIon * 0.25);

    // Tight embedded cold blue-white OB nursery star cluster inside the bright ionization cavity
    float s1 = exp(-dot(localP - vec2(-0.008, 0.010), localP - vec2(-0.008, 0.010)) * 380000.0);
    float s2 = exp(-dot(localP - vec2(0.012, 0.003), localP - vec2(0.012, 0.003)) * 460000.0);
    float s3 = exp(-dot(localP - vec2(-0.018, -0.007), localP - vec2(-0.018, -0.007)) * 420000.0);
    float s4 = exp(-dot(localP - vec2(0.004, -0.014), localP - vec2(0.004, -0.014)) * 500000.0);
    nebulaCol += vec3(0.86, 0.95, 1.00) * ((s1 * 0.62 + s2 * 0.52 + s3 * 0.48 + s4 * 0.42) * envOuter);

    // Sculpted miniature Pillars of Creation dark dust trunks silhouetted inside the nebula heart
    vec3 anchorPillars = normalize(vec3(-0.338, -0.026, -0.941));
    float cosSep = dot(dir, anchorPillars);
    if (cosSep > 0.997) {
      vec3 px = normalize(cross(vec3(0.0, 1.0, 0.0), anchorPillars));
      vec3 py = cross(anchorPillars, px);
      vec2 rawP = vec2(-dot(dir, px), dot(dir, py)) / 0.032;
      vec2 p = vec2(rawP.x * 0.92 + rawP.y * 0.39, -rawP.x * 0.39 + rawP.y * 0.92);
      float wisp = (fbm2(p * 4.6 + vec2(2.3, -1.7)) - 0.5) * 0.28 + (fbm2(p * 9.5 - 1.1) - 0.5) * 0.12;

      float w1 = mix(0.11, 0.068, smoothstep(-0.6, 0.55, p.y)) + 0.018 * sin(p.y * 7.0);
      float w2 = mix(0.095, 0.058, smoothstep(-0.6, 0.35, p.y)) + 0.015 * sin(p.y * 8.0 + 1.4);
      float w3 = mix(0.08, 0.048, smoothstep(-0.6, 0.14, p.y)) + 0.012 * cos(p.y * 9.0);
      float d1 = max(abs(p.x + 0.30 + wisp * 0.75) - w1, p.y - (0.50 + wisp));
      float d2 = max(abs(p.x + 0.03 + wisp * 0.65) - w2, p.y - (0.28 + wisp * 0.9));
      float d3 = max(abs(p.x - 0.24 - wisp * 0.60) - w3, p.y - (0.06 + wisp * 0.7));
      float pillarSdf = min(d1, min(d2, d3));

      float baseFade = smoothstep(-0.76, -0.22, p.y) * smoothstep(1.02, 0.42, length(p));
      float pillarBody = (1.0 - smoothstep(-0.04, 0.09, pillarSdf)) * baseFade;
      float rimLight = exp(-pow(pillarSdf / 0.055, 2.0)) * smoothstep(-0.35, 0.45, p.y) * baseFade;

      nebulaCol *= 1.0 - pillarBody * 0.75;
      mediump vec3 rimCol = mix(warmAmber, coldBlueWhite, 0.45);
      nebulaCol += rimCol * (rimLight * 0.095);
    }
    return nebulaCol;
  }

  // Sombrero Galaxy (M104): upper-right broad golden halo bisected by a crisp dark equatorial dust lane
  mediump vec3 sampleSombreroM104(vec3 dir, mediump vec3 amber, mediump vec3 accentAbyss) {
    vec3 anchor = normalize(vec3(0.262, 0.162, -0.951));
    if (dot(dir, anchor) < 0.994) return vec3(0.0);

    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), anchor));
    vec3 gy = cross(anchor, gx);
    vec2 p = vec2(-dot(dir, gx), dot(dir, gy)) / 0.038;

    float ca = 0.970;
    float sa = 0.242;
    vec2 rot = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
    float rBulge = length(vec2(rot.x * 0.85, rot.y * 1.45));
    float rDisk = length(vec2(rot.x, rot.y * 6.2));

    float nucleus = exp(-rBulge * rBulge * 34.0);
    float halo = exp(-rBulge * 3.1) * 0.44 + exp(-rDisk * 2.5) * 0.52;
    float dustLane = 1.0 - 0.88 * exp(-pow((rot.y + 0.04) * 16.5, 2.0)) * smoothstep(0.06, 0.24, abs(rot.x));
    float mask = smoothstep(1.35, 0.12, rBulge);

    mediump vec3 coreCol = mix(amber, vec3(1.00, 0.94, 0.86), 0.78);
    mediump vec3 haloCol = mix(vec3(0.76, 0.72, 0.88), accentAbyss * 1.35, 0.35);
    return (coreCol * nucleus * 0.17 + mix(haloCol, coreCol, 0.45) * halo * 0.18) * dustLane * mask;
  }

  // Hoag's Object (PGC 54559): upper-center-left golden elliptical core surrounded by a detached blue star ring
  mediump vec3 sampleHoagsObject(vec3 dir, mediump vec3 amber) {
    vec3 anchor = normalize(vec3(-0.205, 0.036, -0.978));
    if (dot(dir, anchor) < 0.996) return vec3(0.0);

    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), anchor));
    vec3 gy = cross(anchor, gx);
    vec2 p = vec2(-dot(dir, gx), dot(dir, gy)) / 0.022;
    vec2 q = vec2(p.x, p.y * 1.18);
    float r = length(q);
    float theta = atan(q.y, q.x);

    float core = exp(-r * r * 52.0);
    float gapRing = exp(-pow((r - 0.68) / 0.11, 2.0)) * (0.76 + 0.24 * sin(theta * 5.0 + 1.2));
    float mask = smoothstep(1.20, 0.15, r);

    mediump vec3 coreCol = mix(amber, vec3(1.00, 0.88, 0.70), 0.65);
    mediump vec3 ringBlue = vec3(0.44, 0.70, 1.00);
    return (coreCol * core * 0.13 + ringBlue * gapRing * 0.085) * mask;
  }

  // Helix / Ring Nebula (NGC 7293): lower-left translucent blue-green core ringed by dusty violet-rose shell
  mediump vec3 sampleHelixNebula(vec3 dir, mediump vec3 accent, mediump vec3 accentAbyss) {
    vec3 anchor = normalize(vec3(-0.238, -0.348, -0.907));
    if (dot(dir, anchor) < 0.996) return vec3(0.0);

    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), anchor));
    vec3 gy = cross(anchor, gx);
    vec2 p = vec2(-dot(dir, gx), dot(dir, gy)) / 0.026;
    vec2 q = vec2(p.x * 0.94 - p.y * 0.34, (p.x * 0.34 + p.y * 0.94) * 1.22);
    float r = length(q);
    float theta = atan(q.y, q.x);

    float dwarf = exp(-r * r * 180.0);
    float innerIon = exp(-r * r * 4.8) * smoothstep(0.90, 0.20, r);
    float outerShell = exp(-pow((r - 0.64) / 0.17, 2.0)) * (0.76 + 0.24 * sin(theta * 7.0 + r * 7.5));
    float mask = smoothstep(1.25, 0.18, r);

    mediump vec3 cyanCore = vec3(0.18, 0.66, 0.62);
    mediump vec3 roseShell = mix(vec3(0.74, 0.22, 0.38), mix(accentAbyss, accent * 0.62, 0.45), 0.5);
    return (vec3(0.75, 0.92, 1.0) * dwarf * 0.14 + cyanCore * innerIon * 0.065 + roseShell * outerShell * 0.092) * mask;
  }

  // Messier 87*-style distant supermassive black hole & tapered synchrotron jet inside the big bottom-right void
  mediump vec3 sampleDistantM87(vec3 dir, vec3 anchorM87, mediump vec3 amber) {
    if (dot(dir, anchorM87) < 0.994) return vec3(0.0);

    vec3 gx = normalize(cross(vec3(0.0, 1.0, 0.0), anchorM87));
    vec3 gy = cross(anchorM87, gx);
    vec2 p = vec2(dot(dir, gx), dot(dir, gy));
    float r = length(p);
    float theta = atan(p.y, p.x);

    float shadowCut = smoothstep(0.0026, 0.0052, r);
    float ringMain = exp(-pow((r - 0.0072) / 0.0034, 2.0)) * shadowCut;
    float outerHaze = exp(-max(0.0, r - 0.0068) * 115.0) * 0.32 * shadowCut;
    float asym = 0.22 + 0.78 * pow(clamp(0.5 + 0.5 * cos(theta + 2.25), 0.0, 1.0), 1.4);
    float knots = 0.82 + 0.18 * cos(theta * 3.0 - 1.1) + 0.12 * sin(theta * 5.0 + 0.4);

    mediump vec3 ehtDarkRed = vec3(0.58, 0.12, 0.02);
    mediump vec3 ehtBright = mix(vec3(0.95, 0.38, 0.06), amber, 0.55);
    mediump vec3 ehtCol = mix(ehtDarkRed, ehtBright, clamp(asym * knots, 0.0, 1.0));
    mediump vec3 m87Ring = ehtCol * (ringMain * asym * knots * 0.44 + outerHaze * asym * 0.40);

    vec2 jAxis = normalize(vec2(-0.82, 0.57));
    vec2 jPerpAxis = vec2(-jAxis.y, jAxis.x);
    float along = dot(p, jAxis);
    float perp = abs(dot(p, jPerpAxis));
    float jetKnots = 0.70 + 0.30 * sin(along * 260.0);
    float jet =
      smoothstep(0.006, 0.015, along) *
      exp(-max(0.0, along - 0.010) * 58.0) *
      exp(-pow(perp / (0.0009 + 0.036 * max(along, 0.0)), 2.0));
    mediump vec3 jetCol = vec3(0.54, 0.74, 0.98) * (jet * jetKnots * 0.11);

    return m87Ring + jetCol;
  }
`;
