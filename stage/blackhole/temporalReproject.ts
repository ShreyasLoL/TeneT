import {
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
import { bhTemporalFragmentShader } from '@/components/stage/shaders/bhTemporal.glsl';

function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result - 0.5;
}

const HALTON_16: ReadonlyArray<[number, number]> = Array.from({ length: 16 }, (_, idx) => [
  halton(idx + 1, 2),
  halton(idx + 1, 3),
]);

export class TemporalReprojector {
  private readonly history: [WebGLRenderTarget, WebGLRenderTarget];
  private readIdx = 0;
  private frameIdx = 0;
  private initialized = false;
  private readonly prevProjView = new Matrix4();
  private readonly prevCamPos = new Vector3();
  private readonly curTexel = new Vector2();
  private readonly material: ShaderMaterial;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh;

  constructor(width: number, height: number, useHalfFloat: boolean) {
    const opts = {
      format: RGBAFormat,
      type: useHalfFloat ? HalfFloatType : UnsignedByteType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    const w = Math.max(2, width);
    const h = Math.max(2, height);
    this.history = [new WebGLRenderTarget(w, h, opts), new WebGLRenderTarget(w, h, opts)];

    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhTemporalFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uCurTex: { value: null },
        uHistoryTex: { value: null },
        uInvCurProjView: { value: new Matrix4() },
        uPrevProjView: { value: new Matrix4() },
        uCamPos: { value: new Vector3() },
        uPrevCamPos: { value: new Vector3() },
        uCurTexelSize: { value: new Vector2() },
        uDt: { value: 1 / 60 },
        uSpinSense: { value: 1 },
        uHistoryWeight: { value: 0 },
      },
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  resize(width: number, height: number): void {
    const w = Math.max(2, width);
    const h = Math.max(2, height);
    if (this.history[0].width === w && this.history[0].height === h) return;
    this.history[0].setSize(w, h);
    this.history[1].setSize(w, h);
    this.reset();
  }

  reset(): void {
    this.initialized = false;
  }

  /** Returns NDC sub-pixel jitter offset scaled to the current ray-pass resolution. */
  getJitterNdc(rayW: number, rayH: number, enabled: boolean, out: Vector2): Vector2 {
    if (!enabled) return out.set(0, 0);
    const [hx, hy] = HALTON_16[this.frameIdx & 15];
    return out.set((hx * 2) / Math.max(1, rayW), (hy * 2) / Math.max(1, rayH));
  }

  render(
    renderer: WebGLRenderer,
    curTex: Texture,
    rayW: number,
    rayH: number,
    invCurProjView: Matrix4,
    curProjView: Matrix4,
    camPos: Vector3,
    dt: number,
    spinSense: number,
    historyWeight: number,
  ): Texture {
    const writeIdx = 1 - this.readIdx;
    const readTarget = this.history[this.readIdx];
    const writeTarget = this.history[writeIdx];

    if (!this.initialized) {
      this.prevProjView.copy(curProjView);
      this.prevCamPos.copy(camPos);
    }

    const weight = this.initialized ? historyWeight : 0;
    this.curTexel.set(1 / Math.max(1, rayW), 1 / Math.max(1, rayH));

    const u = this.material.uniforms;
    u.uCurTex.value = curTex;
    u.uHistoryTex.value = readTarget.texture;
    (u.uInvCurProjView.value as Matrix4).copy(invCurProjView);
    (u.uPrevProjView.value as Matrix4).copy(this.prevProjView);
    (u.uCamPos.value as Vector3).copy(camPos);
    (u.uPrevCamPos.value as Vector3).copy(this.prevCamPos);
    (u.uCurTexelSize.value as Vector2).copy(this.curTexel);
    u.uDt.value = dt;
    u.uSpinSense.value = spinSense;
    u.uHistoryWeight.value = weight;

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(writeTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;

    this.prevProjView.copy(curProjView);
    this.prevCamPos.copy(camPos);
    this.initialized = true;
    this.readIdx = writeIdx;
    this.frameIdx++;

    return writeTarget.texture;
  }

  dispose(): void {
    this.history[0].dispose();
    this.history[1].dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
