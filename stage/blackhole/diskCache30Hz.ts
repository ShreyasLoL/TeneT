import {
  ClampToEdgeWrapping,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  UnsignedByteType,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { bhDiskCacheFragmentShader } from '@/components/stage/shaders/bhDiskCache.glsl';
import { bhFullscreenVertexShader } from '@/components/stage/shaders/bhCommon.glsl';

const CACHE_W = 512;
const CACHE_H = 128;
const CACHE_INTERVAL_SEC = 1 / 30;

export class DiskCache30Hz {
  readonly target: WebGLRenderTarget;
  readonly material: ShaderMaterial;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh;
  private lastSnappedTime = -1;
  private lastSpinSense = 0;
  private lastKerr = -1;

  constructor(halfFloatLinear: boolean, colorBufferHalfFloat: boolean) {
    const useHalf = halfFloatLinear && colorBufferHalfFloat;
    this.target = new WebGLRenderTarget(CACHE_W, CACHE_H, {
      format: RGBAFormat,
      type: useHalf ? HalfFloatType : UnsignedByteType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: RepeatWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    });

    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhDiskCacheFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uDiskTurbulence: { value: null },
        uTime: { value: 0 },
        uSpinSense: { value: 1 },
        uKerrMode: { value: 0 },
      },
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get texture(): Texture {
    return this.target.texture;
  }

  get snappedTime(): number {
    return Math.max(0, this.lastSnappedTime);
  }

  /**
   * Re-renders at most once per 1/30s (30 Hz) or when spin/Kerr mode changes.
   * Returns current snapped simulation time so callers pass subDt = simTime - snappedTime.
   */
  update(
    renderer: WebGLRenderer,
    turbTex: Texture | null,
    simTime: number,
    spinSense: number,
    kerrMode: number,
    forceUpdate = false,
  ): number {
    if (!turbTex) return simTime;

    const snapped = Math.floor(simTime / CACHE_INTERVAL_SEC) * CACHE_INTERVAL_SEC;
    const modeChanged = spinSense !== this.lastSpinSense || kerrMode !== this.lastKerr;

    if (!forceUpdate && !modeChanged && Math.abs(snapped - this.lastSnappedTime) < 1e-4) {
      return this.lastSnappedTime;
    }

    this.lastSnappedTime = forceUpdate ? simTime : snapped;
    this.lastSpinSense = spinSense;
    this.lastKerr = kerrMode;

    this.material.uniforms.uDiskTurbulence.value = turbTex;
    this.material.uniforms.uTime.value = this.lastSnappedTime;
    this.material.uniforms.uSpinSense.value = spinSense;
    this.material.uniforms.uKerrMode.value = kerrMode;

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;

    return this.lastSnappedTime;
  }

  dispose(): void {
    this.target.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
