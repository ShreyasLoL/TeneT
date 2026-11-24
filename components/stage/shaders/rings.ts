export const ringsVertexShader = /* glsl */ `
  in float aRadius;
  in float aThickness;
  in float aRingIndex;
  in float aLuminance;
  in float aIsVoid;
  in float aInStreak;
  in float aSegCount;

  uniform float uCursorIndex;
  uniform float uRingShift;

  out vec2 vRingUv;
  out float vRingIndex;
  out float vLuminance;
  out float vIsVoid;
  out float vInStreak;
  out float vSegCount;
  out float vEmergence;

  void main() {
    // Smooth continuous ring emergence/re-absorption centered on uCursorIndex
    float feather = 0.85;
    float delta = aRingIndex - uCursorIndex + feather;
    float emergence = smoothstep(0.0, feather, delta);

    float targetR = mix(0.75, aRadius + uRingShift, emergence);
    float halfThick = aThickness * 0.5;
    // Unit annulus geometry has radial parameter encoded in position.xy length (0.9..1.1)
    float baseLen = length(position.xz);
    vec2 dir = baseLen > 0.0001 ? position.xz / baseLen : vec2(1.0, 0.0);
    float radialOffset = (baseLen - 1.0) * 10.0; // -1 inner .. +1 outer
    float finalR = max(0.35, targetR + radialOffset * halfThick);

    vec3 pos = vec3(dir.x * finalR, position.y, dir.y * finalR);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    float theta = atan(dir.y, dir.x);
    if (theta < 0.0) theta += 6.28318530718;
    vRingUv = vec2(theta / 6.28318530718, radialOffset * 0.5 + 0.5);
    vRingIndex = aRingIndex;
    vLuminance = aLuminance;
    vIsVoid = aIsVoid;
    vInStreak = aInStreak;
    vSegCount = aSegCount;
    vEmergence = emergence;
  }
`;

export const ringsFragmentShader = /* glsl */ `
  uniform sampler2D uSegmentTex; // width 16, height <= 512: r=start, g=end, b=status, a=notch
  uniform float uSelectedIndex;
  uniform vec3 uOrchidAbyss;
  uniform vec3 uOrchid;
  uniform vec3 uOrchidHot;
  uniform vec3 uTextDim;

  in vec2 vRingUv;
  in float vRingIndex;
  in float vLuminance;
  in float vIsVoid;
  in float vInStreak;
  in float vSegCount;
  in float vEmergence;

  out vec4 fragColor;

  const float TAU = 6.28318530718;

  void main() {
    if (vEmergence <= 0.02) discard;

    int row = int(clamp(floor(vRingIndex + 0.5), 0.0, 511.0));
    float theta = vRingUv.x * TAU;
    float radial = vRingUv.y; // 0 inner .. 1 outer

    bool isSelected = abs(vRingIndex - uSelectedIndex) < 0.3;

    // Sample outer-rim inscription notch depth (128 notches packed across 16 texels)
    float notchSample = 0.0;
    int notchTexel = int(clamp(floor(vRingUv.x * 16.0), 0.0, 15.0));
    notchSample = texelFetch(uSegmentTex, ivec2(notchTexel, row), 0).a;
    float outerEdge = 1.0 - smoothstep(0.75, 1.0, radial + notchSample * 0.16);

    if (vIsVoid > 0.5) {
      // Unsealed missed night: hairline dotted lane
      float dash = step(0.45, fract(vRingUv.x * 96.0));
      float rim = 1.0 - abs(radial - 0.5) * 2.0;
      float alpha = dash * smoothstep(0.2, 0.85, rim) * vLuminance * 0.5 * vEmergence;
      if (alpha < 0.01) discard;
      fragColor = vec4(uTextDim, alpha);
      return;
    }

    // Lookup segment at theta
    float statusCode = 0.0; // 0=unmet, 1=satisfied, 2=optional-unmet, 3=off/rest
    int segTotal = int(clamp(vSegCount, 1.0, 15.0));
    for (int s = 0; s < 15; s++) {
      if (s >= segTotal) break;
      vec4 seg = texelFetch(uSegmentTex, ivec2(s, row), 0);
      if (theta >= seg.r && theta <= seg.g) {
        statusCode = seg.b;
        break;
      }
    }

    vec3 col = uOrchidAbyss;
    float alpha = vLuminance * vEmergence;

    if (statusCode > 2.5) {
      // rest / off: hairline dotted
      float dash = step(0.55, fract(vRingUv.x * 128.0));
      col = uTextDim;
      alpha *= dash * 0.35;
    } else if (statusCode > 1.5) {
      // optional unmet: half dim
      col = uOrchidAbyss;
      alpha *= 0.36;
    } else if (statusCode > 0.5) {
      // satisfied
      col = isSelected ? uOrchidHot : uOrchid;
      alpha *= (isSelected ? 1.0 : 0.88) + vInStreak * 0.12;
    } else {
      // required unmet: dark gap
      col = uOrchidAbyss * 0.4;
      alpha *= 0.25;
    }

    float radialMask = smoothstep(0.0, 0.18, radial) * outerEdge;
    fragColor = vec4(col, clamp(alpha * radialMask, 0.0, 1.0));
  }
`;
