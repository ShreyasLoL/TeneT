import {
  type Camera,
  ClampToEdgeWrapping,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { bhFullscreenVertexShader } from '@/components/stage/shaders/bhCommon.glsl';
import { bhHeroFragmentShader } from '@/components/stage/shaders/bhHero.glsl';
import { bhPostCompositeFragmentShader } from '@/components/stage/shaders/bhPost.glsl';
import { bhT0WarpFragmentShader } from '@/components/stage/shaders/bhT0Warp.glsl';
import { hexToLinearRgb } from '@/components/stage/shaders/color';
import { readPalette } from '@/lib/viz/palette';
import { rig } from '@/lib/store/rig';
import type { BhAssetBundle } from './bootstrapAssets';
import { DiskCache30Hz } from './diskCache30Hz';
import type { GpuCaps } from './gpuCaps';
import { KawaseBloom } from './kawaseBloom';
import { TemporalReprojector } from './temporalReproject';

export type BhTier = 0 | 1 | 2 | 3;

const bhBlitFragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uSrcTex;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = texture(uSrcTex, vUv);
}
`;

export type BhFrameParams = {
  dt: number;
  simTime: number;
  tier: BhTier;
  cheatsEnabled: boolean;
  camMotion: number;
  renderScale: number;
  idleReducedRes: boolean;
  spinSense: number;
  hold: number;
  heat: number;
  exposureScale: number;
  spike: number;
  viewportW: number;
  viewportH: number;
  dpr: number;
};

export class BhPipelineRenderer {
  private readonly caps: GpuCaps;
  private readonly useHalf: boolean;
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh;
  private readonly t0Mat: ShaderMaterial;
  private readonly heroMat: ShaderMaterial;
  private readonly blitMat: ShaderMaterial;
  private readonly postMat: ShaderMaterial;

  private readonly rayTarget: WebGLRenderTarget;
  private readonly sceneHdrTarget: WebGLRenderTarget;
  private crossfadeTarget: WebGLRenderTarget | null = null;
  private diskCache: DiskCache30Hz | null = null;
  private temporal: TemporalReprojector | null = null;
  private bloom: KawaseBloom | null = null;

  private readonly curProjView = new Matrix4();
  private readonly invProjView = new Matrix4();
  private readonly jitterNdc = new Vector2();

  private activeTier: BhTier = 0;
  private crossfadeRemaining = 0;
  private crossfadeCaptured = false;
  private frameIndex = 0;
  private t0Compiled = false;
  private heroCompiled = false;

  constructor(width: number, height: number, caps: GpuCaps) {
    this.caps = caps;
    this.useHalf = caps.colorBufferHalfFloat && caps.textureHalfFloatLinear;
    const type = this.useHalf ? HalfFloatType : UnsignedByteType;
    const rtOpts = {
      format: RGBAFormat,
      type,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };

    const w = Math.max(4, Math.floor(width));
    const h = Math.max(4, Math.floor(height));
    const initRayW = Math.max(4, Math.floor(w * 0.55));
    const initRayH = Math.max(4, Math.floor(h * 0.55));
    this.rayTarget = new WebGLRenderTarget(initRayW, initRayH, rtOpts);
    this.sceneHdrTarget = new WebGLRenderTarget(w, h, { ...rtOpts, depthBuffer: true });

    const pal = readPalette();
    const [or, og, ob] = hexToLinearRgb(pal.accent);
    const [bgr, bgg, bgb] = hexToLinearRgb(pal.bg);

    this.t0Mat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhT0WarpFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uDeflectionLut: { value: null },
        uBlackbodyLut: { value: null },
        uDiskTurbulence: { value: null },
        uSkyCube: { value: null },
        uCamPos: { value: new Vector3() },
        uInvProjView: { value: new Matrix4() },
        uTime: { value: 0 },
        uSpinSense: { value: 1 },
        uHold: { value: 0 },
        uHeat: { value: 0 },
        uExposureScale: { value: 1 },
        uOrchid: { value: new Vector3(or, og, ob) },
      },
    });

    this.heroMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhHeroFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uDeflectionLut: { value: null },
        uTransferLut: { value: null },
        uKerrLut: { value: null },
        uBlackbodyLut: { value: null },
        uDiskTurbulence: { value: null },
        uDiskCache30Hz: { value: null },
        uSkyCube: { value: null },
        uCamPos: { value: new Vector3() },
        uInvProjView: { value: new Matrix4() },
        uJitterNdc: { value: new Vector2() },
        uTime: { value: 0 },
        uTierMode: { value: 1 },
        uMarchSteps: { value: 16 },
        uSpinSense: { value: 1 },
        uHold: { value: 0 },
        uHeat: { value: 0 },
        uUseCache30Hz: { value: 1 },
        uCacheSubDt: { value: 0 },
        uBlurTaps: { value: 2 },
        uCheatsEnabled: { value: 1 },
        uExposureScale: { value: 1 },
        uOrchid: { value: new Vector3(or, og, ob) },
      },
    });

    this.blitMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhBlitFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: { uSrcTex: { value: null } },
    });

    this.postMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhPostCompositeFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uHdrTex: { value: null },
        uBloomTex: { value: null },
        uCrossfadeTex: { value: this.sceneHdrTarget.texture },
        uBlueNoiseTex: { value: null },
        uBloomIntensity: { value: 0.55 },
        uChroma: { value: 0.0022 },
        uFadeMix: { value: 1 },
        uFrameIndex: { value: 0 },
        uHold: { value: 0 },
        uSpike: { value: 0 },
        uBg: { value: new Vector3(bgr, bgg, bgb) },
      },
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.t0Mat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  async compileAsync(renderer: WebGLRenderer, includeHero = false): Promise<void> {
    if (!this.t0Compiled) {
      this.t0Compiled = true;
      if (typeof renderer.compileAsync === 'function') {
        for (const m of [this.t0Mat, this.blitMat, this.postMat]) {
          this.quad.material = m;
          await renderer.compileAsync(this.quadScene, this.quadCamera);
        }
        this.quad.material = this.t0Mat;
      }
    }
    if (includeHero) await this.compileHeroAsync(renderer);
  }

  async compileHeroAsync(renderer: WebGLRenderer): Promise<void> {
    if (this.heroCompiled) return;
    this.heroCompiled = true;
    if (typeof renderer.compileAsync === 'function') {
      this.quad.material = this.heroMat;
      await renderer.compileAsync(this.quadScene, this.quadCamera);
      this.quad.material = this.t0Mat;
    }
  }

  private ensureTier1PlusResources(rayW: number, rayH: number, targetW: number, targetH: number): void {
    if (!this.diskCache) {
      this.diskCache = new DiskCache30Hz(
        this.caps.textureHalfFloatLinear,
        this.caps.colorBufferHalfFloat,
      );
    }
    if (!this.temporal) {
      this.temporal = new TemporalReprojector(rayW, rayH, this.useHalf);
    }
    if (!this.bloom) {
      this.bloom = new KawaseBloom(targetW, targetH, this.useHalf);
    }
  }

  private ensureCrossfadeTarget(targetW: number, targetH: number): WebGLRenderTarget {
    const cw = Math.max(2, targetW >> 1);
    const ch = Math.max(2, targetH >> 1);
    if (!this.crossfadeTarget) {
      this.crossfadeTarget = new WebGLRenderTarget(cw, ch, {
        format: RGBAFormat,
        type: this.useHalf ? HalfFloatType : UnsignedByteType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        wrapS: ClampToEdgeWrapping,
        wrapT: ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      });
    } else if (this.crossfadeTarget.width !== cw || this.crossfadeTarget.height !== ch) {
      this.crossfadeTarget.setSize(cw, ch);
    }
    return this.crossfadeTarget;
  }

  getEstimatedVramBytes(): number {
    const bpp = this.useHalf ? 8 : 4;
    const rtBytes = (rt: WebGLRenderTarget) => rt.width * rt.height * bpp;
    let total = rtBytes(this.rayTarget) + rtBytes(this.sceneHdrTarget) + this.sceneHdrTarget.width * this.sceneHdrTarget.height * 3;
    if (this.crossfadeTarget) total += rtBytes(this.crossfadeTarget);
    if (this.diskCache) total += 512 * 128 * bpp;
    if (this.temporal) total += this.rayTarget.width * this.rayTarget.height * bpp * 2;
    if (this.bloom) total += Math.floor((this.sceneHdrTarget.width * this.sceneHdrTarget.height * bpp) / 2);
    return total;
  }

  render(
    renderer: WebGLRenderer,
    mainScene: Scene,
    mainCamera: Camera,
    assets: BhAssetBundle,
    p: BhFrameParams,
  ): void {
    const targetW = Math.max(4, Math.floor(p.viewportW * p.dpr));
    const targetH = Math.max(4, Math.floor(p.viewportH * p.dpr));

    if (this.sceneHdrTarget.width !== targetW || this.sceneHdrTarget.height !== targetH) {
      this.sceneHdrTarget.setSize(targetW, targetH);
      this.bloom?.resize(targetW, targetH);
      this.temporal?.reset();
    }

    // Trigger 400ms blue-noise dithered tier crossfade on tier transition
    if (p.tier !== this.activeTier) {
      this.activeTier = p.tier;
      this.crossfadeRemaining = 0.4;
      this.crossfadeCaptured = false;
      this.temporal?.reset();
    }

    const effectiveTier: BhTier =
      p.tier >= 1 && (assets.isBootstrap || !assets.transferLut) ? 0 : p.tier;

    // 1. Compute ray scale & motion-adaptive throttling (only when cheats enabled)
    let tierBaseScale = 0.55;
    if (effectiveTier === 1) tierBaseScale = 0.66;
    else if (effectiveTier === 2) tierBaseScale = 0.72;
    else if (effectiveTier === 3) tierBaseScale = 0.74;

    if (p.idleReducedRes && effectiveTier >= 2 && p.cheatsEnabled) {
      tierBaseScale = Math.min(tierBaseScale, 0.60);
    }

    const motionFactor = p.cheatsEnabled ? 1 - Math.min(0.42, p.camMotion * 0.42) : 1.0;
    const totalRayScale = p.cheatsEnabled
      ? Math.max(0.42, Math.min(1.0, tierBaseScale * p.renderScale * motionFactor))
      : 1.0;

    const rayW = Math.max(4, Math.floor(targetW * totalRayScale));
    const rayH = Math.max(4, Math.floor(targetH * totalRayScale));
    if (this.rayTarget.width !== rayW || this.rayTarget.height !== rayH) {
      this.rayTarget.setSize(rayW, rayH);
      this.temporal?.resize(rayW, rayH);
    }

    mainCamera.updateMatrixWorld();
    this.curProjView.multiplyMatrices(mainCamera.projectionMatrix, mainCamera.matrixWorldInverse);
    this.invProjView.copy(this.curProjView).invert();

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    // Capture previous HDR buffer lazily into half-res crossfadeTarget during transitions
    if (this.crossfadeRemaining > 0 && !this.crossfadeCaptured) {
      this.crossfadeCaptured = true;
      const cfTarget = this.ensureCrossfadeTarget(targetW, targetH);
      this.blitMat.uniforms.uSrcTex.value = this.sceneHdrTarget.texture;
      this.quad.material = this.blitMat;
      renderer.setRenderTarget(cfTarget);
      renderer.render(this.quadScene, this.quadCamera);
    }

    // 2. Ray pass (T0 warp vs T1/T2/T3 geodesic hero pass)
    let hdrInputTex: Texture = this.rayTarget.texture;
    if (effectiveTier === 0) {
      const u = this.t0Mat.uniforms;
      u.uDeflectionLut.value = assets.deflectionLut;
      u.uBlackbodyLut.value = assets.blackbodyLut;
      u.uDiskTurbulence.value = assets.diskTurbulence;
      u.uSkyCube.value = assets.skyCube;
      (u.uCamPos.value as Vector3).copy(mainCamera.position);
      (u.uInvProjView.value as Matrix4).copy(this.invProjView);
      u.uTime.value = p.simTime;
      u.uSpinSense.value = p.spinSense;
      u.uHold.value = p.hold;
      u.uHeat.value = p.heat;
      u.uExposureScale.value = p.exposureScale;

      this.quad.material = this.t0Mat;
      renderer.setRenderTarget(this.rayTarget);
      renderer.render(this.quadScene, this.quadCamera);
    } else {
      this.ensureTier1PlusResources(rayW, rayH, targetW, targetH);
      const cache = this.diskCache!;
      const temporal = this.temporal!;
      const useKerr = effectiveTier === 3 && assets.kerrLut !== null ? 1 : 0;
      const useCache = p.cheatsEnabled ? 1 : 0;
      const snappedTime = cache.update(
        renderer,
        assets.diskTurbulence,
        p.simTime,
        p.spinSense,
        useKerr,
        !p.cheatsEnabled,
      );

      const useTemporal = p.cheatsEnabled && totalRayScale < 0.96;
      temporal.getJitterNdc(rayW, rayH, useTemporal, this.jitterNdc);

      const marchSteps =
        effectiveTier >= 2
          ? Math.max(12, Math.round((effectiveTier === 3 ? 20 : 16) * motionFactor))
          : 16;
      const blurTaps =
        effectiveTier >= 2 ? (p.cheatsEnabled ? 2 : 3) : 2;

      const u = this.heroMat.uniforms;
      u.uDeflectionLut.value = assets.deflectionLut;
      u.uTransferLut.value = useKerr && assets.kerrLut ? assets.kerrLut : assets.transferLut;
      u.uKerrLut.value = assets.kerrLut;
      u.uBlackbodyLut.value = assets.blackbodyLut;
      u.uDiskTurbulence.value = assets.diskTurbulence;
      u.uDiskCache30Hz.value = cache.texture;
      u.uSkyCube.value = assets.skyCube;
      (u.uCamPos.value as Vector3).copy(mainCamera.position);
      (u.uInvProjView.value as Matrix4).copy(this.invProjView);
      (u.uJitterNdc.value as Vector2).copy(this.jitterNdc);
      u.uTime.value = p.simTime;
      u.uTierMode.value = effectiveTier;
      u.uMarchSteps.value = marchSteps;
      u.uSpinSense.value = p.spinSense;
      u.uHold.value = p.hold;
      u.uHeat.value = p.heat;
      u.uUseCache30Hz.value = useCache;
      u.uCacheSubDt.value = useCache ? p.simTime - snappedTime : 0;
      u.uBlurTaps.value = blurTaps;
      u.uCheatsEnabled.value = p.cheatsEnabled ? 1 : 0;
      u.uExposureScale.value = p.exposureScale;

      this.quad.material = this.heroMat;
      renderer.setRenderTarget(this.rayTarget);
      renderer.render(this.quadScene, this.quadCamera);

      const histWeight = useTemporal ? Math.max(0.55, 0.84 - p.camMotion * 0.28) : 0;
      hdrInputTex = temporal.render(
        renderer,
        this.rayTarget.texture,
        rayW,
        rayH,
        this.invProjView,
        this.curProjView,
        mainCamera.position,
        p.dt,
        p.spinSense,
        histWeight,
      );
    }

    // 3. Blit ray pass into full-res HDR scene target, clear depth, and composite R3F geometry
    this.blitMat.uniforms.uSrcTex.value = hdrInputTex;
    this.quad.material = this.blitMat;
    renderer.setRenderTarget(this.sceneHdrTarget);
    renderer.render(this.quadScene, this.quadCamera);
    renderer.clearDepth();
    renderer.render(mainScene, mainCamera);

    // 4. Kawase mip bloom (skipped on T0 which uses baked halo glow)
    let bloomTex = assets.blackbodyLut as Texture;
    let bloomIntensity = 0;
    if (effectiveTier >= 1 && this.bloom) {
      const mips = effectiveTier >= 2 && (!p.cheatsEnabled || p.camMotion < 0.5) ? 4 : 3;
      bloomTex = this.bloom.render(renderer, this.sceneHdrTarget.texture, mips, 0.72);
      bloomIntensity = effectiveTier >= 2 ? 0.56 : 0.44;
    }

    // 5. Merged final post pass: AgX tone map + bloom + blue-noise dither + subtle CA + tier crossfade
    let fadeMix = 1;
    if (this.crossfadeRemaining > 0) {
      this.crossfadeRemaining = Math.max(0, this.crossfadeRemaining - p.dt);
      fadeMix = 1 - this.crossfadeRemaining / 0.4;
      if (this.crossfadeRemaining === 0 && this.crossfadeTarget) {
        this.crossfadeTarget.dispose();
        this.crossfadeTarget = null;
      }
    }

    const pu = this.postMat.uniforms;
    pu.uHdrTex.value = this.sceneHdrTarget.texture;
    pu.uBloomTex.value = bloomTex;
    pu.uCrossfadeTex.value = this.crossfadeTarget ? this.crossfadeTarget.texture : this.sceneHdrTarget.texture;
    pu.uBlueNoiseTex.value = assets.blueNoise;
    pu.uBloomIntensity.value = bloomIntensity;
    pu.uChroma.value = effectiveTier === 0 ? 0.0008 : 0.0022;
    pu.uFadeMix.value = fadeMix;
    pu.uFrameIndex.value = this.frameIndex;
    pu.uHold.value = p.hold;
    pu.uSpike.value = p.spike;

    this.quad.material = this.postMat;
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
    renderer.autoClear = prevAutoClear;

    rig.drawCalls = renderer.info.render.calls;
    rig.triangles = renderer.info.render.triangles;
    this.frameIndex++;
  }

  dispose(): void {
    this.rayTarget.dispose();
    this.sceneHdrTarget.dispose();
    this.crossfadeTarget?.dispose();
    this.diskCache?.dispose();
    this.temporal?.dispose();
    this.bloom?.dispose();
    this.quad.geometry.dispose();
    this.t0Mat.dispose();
    this.heroMat.dispose();
    this.blitMat.dispose();
    this.postMat.dispose();
  }
}
