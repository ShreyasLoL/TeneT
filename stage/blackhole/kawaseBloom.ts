import {
  ClampToEdgeWrapping,
  GLSL3,
  HalfFloatType,
  LinearFilter,
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
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { bhFullscreenVertexShader } from '@/components/stage/shaders/bhCommon.glsl';
import {
  bhBloomPrefilterFragmentShader,
  bhKawaseDownFragmentShader,
  bhKawaseUpFragmentShader,
} from '@/components/stage/shaders/bhPost.glsl';

const MAX_MIPS = 4;

export class KawaseBloom {
  private readonly downTargets: WebGLRenderTarget[] = [];
  private readonly upTargets: WebGLRenderTarget[] = [];
  private readonly prefilterMat: ShaderMaterial;
  private readonly downMat: ShaderMaterial;
  private readonly upMat: ShaderMaterial;
  private readonly quad: Mesh;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly texelScratch = new Vector2();
  private width = 2;
  private height = 2;

  constructor(width: number, height: number, useHalfFloat: boolean) {
    const type = useHalfFloat ? HalfFloatType : UnsignedByteType;
    const baseOpts = {
      format: RGBAFormat,
      type,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };

    for (let i = 0; i < MAX_MIPS; i++) {
      this.downTargets.push(new WebGLRenderTarget(2, 2, baseOpts));
      this.upTargets.push(new WebGLRenderTarget(2, 2, baseOpts));
    }

    this.prefilterMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhBloomPrefilterFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uSrcTex: { value: null },
        uTexelSize: { value: new Vector2() },
        uThreshold: { value: 0.72 },
      },
    });

    this.downMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhKawaseDownFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uSrcTex: { value: null },
        uHalfPixel: { value: new Vector2() },
      },
    });

    this.upMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhKawaseUpFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uSrcTex: { value: null },
        uHalfPixel: { value: new Vector2() },
      },
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.prefilterMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    const w = Math.max(8, Math.floor(width));
    const h = Math.max(8, Math.floor(height));
    if (this.width === w && this.height === h) return;
    this.width = w;
    this.height = h;

    let mw = Math.max(2, w >> 1);
    let mh = Math.max(2, h >> 1);
    for (let i = 0; i < MAX_MIPS; i++) {
      this.downTargets[i].setSize(mw, mh);
      this.upTargets[i].setSize(mw, mh);
      mw = Math.max(2, mw >> 1);
      mh = Math.max(2, mh >> 1);
    }
  }

  render(renderer: WebGLRenderer, hdrTex: Texture, mipCount: number, threshold = 0.72): Texture {
    const mips = Math.max(2, Math.min(MAX_MIPS, mipCount));
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    // 1. Half-res Karis-weighted prefilter into mip 0
    this.texelScratch.set(1 / this.width, 1 / this.height);
    this.prefilterMat.uniforms.uSrcTex.value = hdrTex;
    (this.prefilterMat.uniforms.uTexelSize.value as Vector2).copy(this.texelScratch);
    this.prefilterMat.uniforms.uThreshold.value = threshold;
    this.quad.material = this.prefilterMat;
    renderer.setRenderTarget(this.downTargets[0]);
    renderer.render(this.scene, this.camera);

    // 2. Dual-filter Kawase downsample chain
    this.quad.material = this.downMat;
    for (let i = 1; i < mips; i++) {
      const src = this.downTargets[i - 1];
      const dst = this.downTargets[i];
      this.downMat.uniforms.uSrcTex.value = src.texture;
      (this.downMat.uniforms.uHalfPixel.value as Vector2).set(0.5 / src.width, 0.5 / src.height);
      renderer.setRenderTarget(dst);
      renderer.render(this.scene, this.camera);
    }

    // 3. Dual-filter Kawase upsample chain back to half-res (upTargets[0])
    this.quad.material = this.upMat;
    let curTex = this.downTargets[mips - 1].texture;
    let curW = this.downTargets[mips - 1].width;
    let curH = this.downTargets[mips - 1].height;
    for (let i = mips - 2; i >= 0; i--) {
      const dst = this.upTargets[i];
      this.upMat.uniforms.uSrcTex.value = curTex;
      (this.upMat.uniforms.uHalfPixel.value as Vector2).set(0.5 / curW, 0.5 / curH);
      renderer.setRenderTarget(dst);
      renderer.render(this.scene, this.camera);
      curTex = dst.texture;
      curW = dst.width;
      curH = dst.height;
    }

    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    return this.upTargets[0].texture;
  }

  dispose(): void {
    for (let i = 0; i < MAX_MIPS; i++) {
      this.downTargets[i].dispose();
      this.upTargets[i].dispose();
    }
    this.quad.geometry.dispose();
    this.prefilterMat.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
  }
}
