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
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { tenetPostFragmentShader } from '../shaders/lens';

export class TenetPostEffect extends Effect {
  constructor() {
    super('TenetPostEffect', tenetPostFragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uCenter', new Uniform(new Vector2(0.5, 0.5))],
        ['uRadiusS', new Uniform(0.11)],
        ['uStrength', new Uniform(1.0)],
        ['uHold', new Uniform(0.0)],
        ['uAspect', new Uniform(1.77)],
        ['uSpike', new Uniform(0.0)],
        ['uHorizonY', new Uniform(0.28)],
        ['uTime', new Uniform(0.0)],
        ['uMirrorEnabled', new Uniform(1.0)],
        ['uGrainEnabled', new Uniform(1.0)],
        ['uGrain', new Uniform(0.018)],
        ['uOrchidAbyss', new Uniform(new Vector3(0.37, 0.09, 0.39))],
        ['uOrchid', new Uniform(new Vector3(0.88, 0.3, 0.92))],
        ['uOrchidHot', new Uniform(new Vector3(0.96, 0.79, 0.98))],
      ]),
    });
  }
}

export type TenetComposerRig = {
  composer: EffectComposer;
  tenet: TenetPostEffect;
  bloom: BloomEffect;
  bloomPass: EffectPass;
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
  const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
  const [abr, abg, abb] = hexToRgbNormalized(pal.accentAbyss);
  const [hr, hg, hb] = hexToRgbNormalized(pal.accentHot);
  (tenet.uniforms.get('uOrchid')?.value as Vector3).set(ar, ag, ab);
  (tenet.uniforms.get('uOrchidAbyss')?.value as Vector3).set(abr, abg, abb);
  (tenet.uniforms.get('uOrchidHot')?.value as Vector3).set(hr, hg, hb);

  const bloom = new BloomEffect({
    blendFunction: BlendFunction.ADD,
    mipmapBlur: true,
    luminanceThreshold: 0.62,
    luminanceSmoothing: 0.2,
    intensity: 0.65,
    radius: 0.78,
    levels: 5,
  });

  const composer = new EffectComposer(renderer, {
    multisampling: 0,
    depthBuffer: true,
    stencilBuffer: false,
    frameBufferType: HalfFloatType,
  });

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new EffectPass(camera, bloom);
  const postPass = new EffectPass(camera, tenet);

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(postPass);

  renderer.getSize(scratchSize);
  let appliedW = scratchSize.width;
  let appliedH = scratchSize.height;
  let appliedDpr = renderer.getPixelRatio();
  composer.setSize(appliedW, appliedH);

  return {
    composer,
    tenet,
    bloom,
    bloomPass,
    syncBloom(enabled: boolean) {
      bloomPass.enabled = enabled;
      bloom.intensity = enabled ? 0.65 : 0;
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
