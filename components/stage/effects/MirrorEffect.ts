import { Effect } from 'postprocessing';
import { Uniform } from 'three';

const mirrorFragmentShader = /* glsl */ `
  uniform float uHorizonY;
  uniform float uTime;
  uniform float uEnabled;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (uEnabled < 0.5 || vUv.y >= uHorizonY) {
      outputColor = inputColor;
      return;
    }

    float dy = clamp((uHorizonY - vUv.y) / max(0.05, uHorizonY), 0.0, 1.0);
    float ripple = sin(vUv.x * 42.0 + uTime * 0.9) * 0.0018 * dy;
    vec2 sampleUv = vec2(clamp(vUv.x + ripple, 0.0, 1.0), clamp(2.0 * uHorizonY - vUv.y, 0.0, 1.0));

    float blurStep = 0.002 + dy * 0.014;
    vec3 refl = vec3(0.0);
    refl += texture(inputBuffer, clamp(sampleUv + vec2(0.0, -2.0 * blurStep), 0.0, 1.0)).rgb * 0.15;
    refl += texture(inputBuffer, clamp(sampleUv + vec2(0.0, -blurStep), 0.0, 1.0)).rgb * 0.22;
    refl += texture(inputBuffer, sampleUv).rgb * 0.26;
    refl += texture(inputBuffer, clamp(sampleUv + vec2(0.0, blurStep), 0.0, 1.0)).rgb * 0.22;
    refl += texture(inputBuffer, clamp(sampleUv + vec2(0.0, 2.0 * blurStep), 0.0, 1.0)).rgb * 0.15;

    float fresnel = pow(1.0 - dy, 3.0) * 0.18;
    outputColor = vec4(inputColor.rgb + refl * fresnel, inputColor.a);
  }
`;

export class MirrorEffectImpl extends Effect {
  constructor() {
    super('TenetMirrorEffect', mirrorFragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uHorizonY', new Uniform(0.28)],
        ['uTime', new Uniform(0.0)],
        ['uEnabled', new Uniform(1.0)],
      ]),
    });
  }
}
