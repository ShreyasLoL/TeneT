import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  GLSL3,
  HalfFloatType,
  Mesh,
  NearestFilter,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { bhFullscreenVertexShader } from '@/components/stage/shaders/bhCommon.glsl';
import { bhParticlesSimFragmentShader } from '@/components/stage/shaders/bhParticlesSim.glsl';
import { BH_PARTICLE_COUNTS } from './constants';

const FBO_SIZE = 512; // 512 * 512 = 262,144 particles
const TAU = Math.PI * 2;

const bhParticlesSeedFragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uSeedPos;
uniform sampler2D uSeedVel;
layout(location = 0) out vec4 outPos;
layout(location = 1) out vec4 outVel;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  outPos = texelFetch(uSeedPos, c, 0);
  outVel = texelFetch(uSeedVel, c, 0);
}
`;

export class GpgpuParticleSim {
  private readonly targets: [WebGLRenderTarget, WebGLRenderTarget];
  private readonly simMat: ShaderMaterial;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh;
  private readIdx = 0;
  private seeded = false;

  constructor(colorBufferFloat: boolean) {
    const texType = colorBufferFloat ? FloatType : HalfFloatType;
    const opts = {
      count: 2,
      format: RGBAFormat,
      type: texType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.targets = [
      new WebGLRenderTarget(FBO_SIZE, FBO_SIZE, opts),
      new WebGLRenderTarget(FBO_SIZE, FBO_SIZE, opts),
    ];

    this.simMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhParticlesSimFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uStatePos: { value: null },
        uStateVel: { value: null },
        uDt: { value: 1 / 60 },
        uSpinSense: { value: 1 },
        uKerrMode: { value: 0 },
        uTime: { value: 0 },
      },
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.simMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get posTexture(): Texture {
    return this.targets[this.readIdx].textures[0];
  }

  get isSeeded(): boolean {
    return this.seeded;
  }

  seed(renderer: WebGLRenderer, particlesInit: Float32Array): void {
    const total = BH_PARTICLE_COUNTS.T2; // 262144
    const baseCount = Math.max(1, Math.floor(particlesInit.length / 4));
    const posBuf = new Float32Array(total * 4);
    const velBuf = new Float32Array(total * 4);

    for (let i = 0; i < total; i++) {
      const s = (i % baseCount) * 4;
      const tileIdx = i >>> 15;
      const r0 = particlesInit[s];
      const phi0 = particlesInit[s + 1];
      const z0 = particlesInit[s + 2];
      const packedSeed = particlesInit[s + 3];

      const phiNorm = (((phi0 / TAU) % 1) + 1) % 1;
      const fracSeed = (((packedSeed % 1) + 1) % 1);
      const staggeredSeed = (fracSeed + tileIdx * 0.137) % 1;

      posBuf[i * 4] = r0;
      posBuf[i * 4 + 1] = phiNorm;
      posBuf[i * 4 + 2] = z0;
      posBuf[i * 4 + 3] = 1.0;

      velBuf[i * 4] = 0.0;
      velBuf[i * 4 + 1] = phiNorm;
      velBuf[i * 4 + 2] = staggeredSeed;
      velBuf[i * 4 + 3] = r0;
    }

    const posTex = new DataTexture(posBuf, FBO_SIZE, FBO_SIZE, RGBAFormat, FloatType);
    posTex.minFilter = NearestFilter;
    posTex.magFilter = NearestFilter;
    posTex.needsUpdate = true;

    const velTex = new DataTexture(velBuf, FBO_SIZE, FBO_SIZE, RGBAFormat, FloatType);
    velTex.minFilter = NearestFilter;
    velTex.magFilter = NearestFilter;
    velTex.needsUpdate = true;

    const seedMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhFullscreenVertexShader,
      fragmentShader: bhParticlesSeedFragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      uniforms: {
        uSeedPos: { value: posTex },
        uSeedVel: { value: velTex },
      },
    });

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.quad.material = seedMat;
    renderer.setRenderTarget(this.targets[0]);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(this.targets[1]);
    renderer.render(this.scene, this.camera);
    this.quad.material = this.simMat;
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;

    posTex.dispose();
    velTex.dispose();
    seedMat.dispose();

    this.readIdx = 0;
    this.seeded = true;
  }

  step(renderer: WebGLRenderer, dt: number, spinSense: number, kerrMode: number, simTime: number): void {
    if (!this.seeded || dt <= 0) return;

    const writeIdx = 1 - this.readIdx;
    const src = this.targets[this.readIdx];
    const dst = this.targets[writeIdx];

    const u = this.simMat.uniforms;
    u.uStatePos.value = src.textures[0];
    u.uStateVel.value = src.textures[1];
    u.uDt.value = dt;
    u.uSpinSense.value = spinSense;
    u.uKerrMode.value = kerrMode;
    u.uTime.value = simTime;

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(dst);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;

    this.readIdx = writeIdx;
  }

  dispose(): void {
    this.targets[0].dispose();
    this.targets[1].dispose();
    this.quad.geometry.dispose();
    this.simMat.dispose();
  }
}
