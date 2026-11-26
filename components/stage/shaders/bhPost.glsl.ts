export const bhBloomPrefilterFragmentShader = /* glsl */ `
precision mediump float;
uniform sampler2D uSrcTex;
uniform vec2 uTexelSize;
uniform float uThreshold;
in vec2 vUv;
out vec4 fragColor;

vec3 karisAvg(vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float w0 = 1.0 / (1.0 + max(c0.r, max(c0.g, c0.b)));
  float w1 = 1.0 / (1.0 + max(c1.r, max(c1.g, c1.b)));
  float w2 = 1.0 / (1.0 + max(c2.r, max(c2.g, c2.b)));
  float w3 = 1.0 / (1.0 + max(c3.r, max(c3.g, c3.b)));
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 1e-4);
}

void main() {
  vec2 d = uTexelSize * 0.5;
  vec3 c0 = texture(uSrcTex, vUv + vec2(-d.x, -d.y)).rgb;
  vec3 c1 = texture(uSrcTex, vUv + vec2( d.x, -d.y)).rgb;
  vec3 c2 = texture(uSrcTex, vUv + vec2(-d.x,  d.y)).rgb;
  vec3 c3 = texture(uSrcTex, vUv + vec2( d.x,  d.y)).rgb;
  vec3 avg = karisAvg(c0, c1, c2, c3);
  float lum = dot(avg, vec3(0.2126, 0.7152, 0.0722));
  float soft = smoothstep(uThreshold * 0.65, uThreshold * 1.45, lum);
  fragColor = vec4(avg * soft, 1.0);
}
`;

export const bhKawaseDownFragmentShader = /* glsl */ `
precision mediump float;
uniform sampler2D uSrcTex;
uniform vec2 uHalfPixel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 sum = texture(uSrcTex, vUv).rgb * 4.0;
  sum += texture(uSrcTex, vUv - uHalfPixel).rgb;
  sum += texture(uSrcTex, vUv + uHalfPixel).rgb;
  sum += texture(uSrcTex, vUv + vec2(uHalfPixel.x, -uHalfPixel.y)).rgb;
  sum += texture(uSrcTex, vUv + vec2(-uHalfPixel.x, uHalfPixel.y)).rgb;
  fragColor = vec4(sum * 0.125, 1.0);
}
`;

export const bhKawaseUpFragmentShader = /* glsl */ `
precision mediump float;
uniform sampler2D uSrcTex;
uniform vec2 uHalfPixel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 hp = uHalfPixel;
  vec3 sum = texture(uSrcTex, vUv + vec2(-hp.x * 2.0, 0.0)).rgb;
  sum += texture(uSrcTex, vUv + vec2(-hp.x, hp.y)).rgb * 2.0;
  sum += texture(uSrcTex, vUv + vec2(0.0, hp.y * 2.0)).rgb;
  sum += texture(uSrcTex, vUv + vec2(hp.x, hp.y)).rgb * 2.0;
  sum += texture(uSrcTex, vUv + vec2(hp.x * 2.0, 0.0)).rgb;
  sum += texture(uSrcTex, vUv + vec2(hp.x, -hp.y)).rgb * 2.0;
  sum += texture(uSrcTex, vUv + vec2(0.0, -hp.y * 2.0)).rgb;
  sum += texture(uSrcTex, vUv + vec2(-hp.x, -hp.y)).rgb * 2.0;
  fragColor = vec4(sum / 12.0, 1.0);
}
`;

export const bhPostCompositeFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uHdrTex;
uniform sampler2D uBloomTex;
uniform sampler2D uCrossfadeTex;
uniform sampler2D uBlueNoiseTex;
uniform float uBloomIntensity;
uniform float uChroma;
uniform float uFadeMix;
uniform float uFrameIndex;
uniform float uHold;
uniform float uSpike;
uniform vec3 uBg;

in vec2 vUv;
out vec4 fragColor;

// AgX-inspired fitted HDR tone mapping (desaturates intense inner ISCO highlights gracefully)
mediump vec3 agxToneMap(mediump vec3 x) {
  const mat3 agxIn = mat3(
    0.84247906, 0.04232824, 0.04237565,
    0.07843360, 0.87846864, 0.07843360,
    0.07922375, 0.07916613, 0.87914297
  );
  const mat3 agxOut = mat3(
    1.19687900, -0.05289685, -0.05297163,
    -0.09802088, 1.15190313, -0.09804345,
    -0.09902974, -0.09896118, 1.15107368
  );
  vec3 v = max(vec3(1e-6), agxIn * max(x, vec3(0.0)));
  v = clamp((log2(v) + 12.47393) / 16.5, 0.0, 1.0);
  vec3 v2 = v * v;
  vec3 v4 = v2 * v2;
  vec3 s = 15.5 * v4 * v2 - 40.14 * v4 * v + 31.96 * v4 - 6.868 * v2 * v + 0.4298 * v2 + 0.1191 * v - 0.00232;
  return clamp(agxOut * s, 0.0, 1.0);
}

mediump vec3 linearToSrgb(mediump vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  vec2 d = vUv - vec2(0.5);
  float edgeR2 = dot(d, d);
  vec2 caShift = d * edgeR2 * uChroma;

  vec3 hdr = texture(uHdrTex, vUv).rgb;
  if (uChroma > 1e-5) {
    float r = texture(uHdrTex, clamp(vUv + caShift, vec2(0.001), vec2(0.999))).r;
    float b = texture(uHdrTex, clamp(vUv - caShift, vec2(0.001), vec2(0.999))).b;
    hdr = vec3(r, hdr.g, b);
  }

  vec3 bloom = uBloomIntensity > 0.001 ? texture(uBloomTex, vUv).rgb * uBloomIntensity : vec3(0.0);
  vec3 hdrTotal = hdr + bloom;

  vec2 bn = texelFetch(
    uBlueNoiseTex,
    (ivec2(gl_FragCoord.xy) + ivec2(int(uFrameIndex * 17.0), int(uFrameIndex * 31.0))) & 63,
    0
  ).rg;

  // Dithered 400ms tier crossfade
  if (uFadeMix > 0.001 && uFadeMix < 0.999) {
    vec3 prevHdr = texture(uCrossfadeTex, vUv).rgb;
    float ditherFade = clamp(uFadeMix + (bn.r - 0.5) * 0.14, 0.0, 1.0);
    hdrTotal = mix(prevHdr, hdrTotal, ditherFade);
  }

  // Subtle ceremony pulse on seal hold / recap spike
  hdrTotal *= (1.0 + uHold * 0.16 + uSpike * 0.12);

  // Soft radial vignette preserving --bg #0B0910 black room continuity
  float vig = pow(clamp(1.0 - edgeR2 * 0.72, 0.0, 1.0), 1.35);
  hdrTotal = hdrTotal * vig + uBg * 0.55;

  mediump vec3 mapped = agxToneMap(hdrTotal);
  mediump vec3 srgb = linearToSrgb(mapped);

  // Mandatory triangular blue-noise dithering eliminates dark-gradient banding
  float triNoise = (bn.r - bn.g) / 255.0;
  fragColor = vec4(clamp(srgb + vec3(triNoise), 0.0, 1.0), 1.0);
}
`;
