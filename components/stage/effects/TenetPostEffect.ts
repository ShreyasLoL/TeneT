import {
  BlendFunction,
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
} from 'postprocessing';
import {
  type Camera,
  HalfFloatType,
  NoToneMapping,
  type Scene,
  Uniform,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { readPalette } from '@/lib/viz/palette';
import { hexToLinearRgb } from '../shaders/color';
import { tenetPostFragmentShader } from '../shaders/lens';

export class TenetPostEffect extends Effect {
  constructor() {
    super('TenetPostEffect', tenetPostFragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uCenter', new Uniform(new Vector2(0.5, 0.5))],
        ['uRadiusS', new Uniform(0.095)],
        ['uStrength', new Uniform(1.0)],
        ['uHold', new Uniform(0.0)],
        ['uAspect', new Uniform(1.77)],
        ['uSpike', new Uniform(0.0)],
        ['uHorizonY', new Uniform(0.24)],
        ['uTime', new Uniform(0.0)],
        ['uMirrorEnabled', new Uniform(1.0)],
        ['uGrainEnabled', new Uniform(1.0)],
        ['uGrain', new Uniform(0.004)],
        ['uBg', new Uniform(new Vector3(0.0033, 0.0027, 0.0052))],
        ['uOrchidAbyss', new Uniform(new Vector3(0.11, 0.01, 0.13))],
        ['uOrchid', new Uniform(new Vector3(0.74, 0.075, 0.82))],
        ['uOrchidHot', new Uniform(new Vector3(0.92, 0.58, 0.95))],
      ]),
    });
  }
}

export type TenetComposerRig = {
  composer: EffectComposer;
  tenet: TenetPostEffect;
  bloom: BloomEffect;
  effectPass: EffectPass;
  syncBloom: (enabled: boolean) => void;
  renderFrame: (delta: number) => void;
  dispose: () => void;
};

const scratchSize = new Vector2();

export function createTenetComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
): TenetComposerRig {
  const prevToneMapping = renderer.toneMapping;
  renderer.toneMapping = NoToneMapping;

  const tenet = new TenetPostEffect();
  const pal = readPalette();
  const [bgr, bgg, bgb] = hexToLinearRgb(pal.bg);
  const [ar, ag, ab] = hexToLinearRgb(pal.accent);
  const [abr, abg, abb] = hexToLinearRgb(pal.accentAbyss);
  const [hr, hg, hb] = hexToLinearRgb(pal.accentHot);
  (tenet.uniforms.get('uBg')?.value as Vector3).set(bgr, bgg, bgb);
  (tenet.uniforms.get('uOrchid')?.value as Vector3).set(ar, ag, ab);
  (tenet.uniforms.get('uOrchidAbyss')?.value as Vector3).set(abr, abg, abb);
  (tenet.uniforms.get('uOrchidHot')?.value as Vector3).set(hr, hg, hb);

  const bloom = new BloomEffect({
    blendFunction: BlendFunction.ADD,
    mipmapBlur: true,
    luminanceThreshold: 0.72,
    luminanceSmoothing: 0.22,
    intensity: 0.58,
    radius: 0.68,
    levels: 4,
  });

  const composer = new EffectComposer(renderer, {
    multisampling: 0,
    depthBuffer: true,
    stencilBuffer: false,
    frameBufferType: HalfFloatType,
  });

  // Single merged EffectPass prevents double Linear->sRGB encoding so --bg stays exact #0B0910
  const renderPass = new RenderPass(scene, camera);
  const effectPass = new EffectPass(camera, bloom, tenet);

  composer.addPass(renderPass);
  composer.addPass(effectPass);

  renderer.getSize(scratchSize);
  let appliedW = scratchSize.width;
  let appliedH = scratchSize.height;
  let appliedDpr = renderer.getPixelRatio();
  composer.setSize(appliedW, appliedH);

  return {
    composer,
    tenet,
    bloom,
    effectPass,
    syncBloom(enabled: boolean) {
      bloom.intensity = enabled ? 0.58 : 0;
      bloom.blendMode.setBlendFunction(enabled ? BlendFunction.ADD : BlendFunction.SKIP);
    },
    renderFrame(delta: number) {
      renderer.getSize(scratchSize);
      const dpr = renderer.getPixelRatio();
      if (scratchSize.width !== appliedW || scratchSize.height !== appliedH || dpr !== appliedDpr) {
        appliedW = scratchSize.width;
        appliedH = scratchSize.height;
        appliedDpr = dpr;
        composer.setSize(appliedW, appliedH);
      }
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      composer.render(delta);
      renderer.autoClear = prevAutoClear;
    },
    dispose() {
      composer.dispose();
      renderer.toneMapping = prevToneMapping;
    },
  };
}
