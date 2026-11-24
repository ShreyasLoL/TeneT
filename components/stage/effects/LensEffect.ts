import { Effect } from 'postprocessing';
import { Uniform, Vector2, Vector3 } from 'three';
import { lensFragmentShader } from '../shaders/lens';

export class LensEffectImpl extends Effect {
  constructor() {
    super('TenetLensEffect', lensFragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uCenter', new Uniform(new Vector2(0.5, 0.5))],
        ['uRadiusS', new Uniform(0.11)],
        ['uStrength', new Uniform(1.0)],
        ['uHold', new Uniform(0.0)],
        ['uAspect', new Uniform(1.77)],
        ['uSpike', new Uniform(0.0)],
        ['uOrchidAbyss', new Uniform(new Vector3(0.37, 0.09, 0.39))],
        ['uOrchid', new Uniform(new Vector3(0.88, 0.3, 0.92))],
        ['uOrchidHot', new Uniform(new Vector3(0.96, 0.79, 0.98))],
      ]),
    });
  }
}
