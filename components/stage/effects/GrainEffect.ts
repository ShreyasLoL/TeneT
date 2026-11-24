import { Effect } from 'postprocessing';
import { Uniform } from 'three';

const grainFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uGrain;
  uniform float uEnabled;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (uEnabled < 0.5) {
      outputColor = inputColor;
      return;
    }

    float n = hash12(vUv * 800.0 + fract(uTime) * 173.0) - 0.5;
    vec2 vigUv = vUv - vec2(0.5);
    float vig = 1.0 - dot(vigUv, vigUv) * 0.34;

    vec3 col = inputColor.rgb * vig + vec3(n * uGrain);
    outputColor = vec4(max(vec3(0.0), col), inputColor.a);
  }
`;

export class GrainEffectImpl extends Effect {
  constructor() {
    super('TenetGrainEffect', grainFragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0.0)],
        ['uGrain', new Uniform(0.02)],
        ['uEnabled', new Uniform(1.0)],
      ]),
    });
  }
}
