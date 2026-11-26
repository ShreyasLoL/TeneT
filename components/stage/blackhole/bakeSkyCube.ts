import {
  BackSide,
  BoxGeometry,
  CubeCamera,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three';
import { blackHoleSkyGlsl } from '../shaders/blackholeSky.glsl';

const skyBakeVertexShader = /* glsl */ `
  out vec3 vWorldDir;
  void main() {
    vWorldDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyBakeFragmentShader = /* glsl */ `
  precision highp float;
  in vec3 vWorldDir;

  uniform mediump vec3 uBgColor;
  uniform mediump vec3 uAccent;
  uniform mediump vec3 uAccentDim;
  uniform mediump vec3 uAccentAbyss;
  uniform mediump vec3 uAmber;

  out vec4 fragColor;

  ${blackHoleSkyGlsl}

  void main() {
    vec3 dir = normalize(vWorldDir);
    mediump vec3 sky = sampleDeepSpaceStatic(
      dir,
      0.00055,
      uBgColor,
      uAccent,
      uAccentDim,
      uAccentAbyss,
      uAmber
    );
    fragColor = vec4(sky, 1.0);
  }
`;

export function bakeDeepSpaceCube(
  renderer: WebGLRenderer,
  faceSize: number,
  colors: {
    bg: Vector3;
    accent: Vector3;
    accentDim: Vector3;
    accentAbyss: Vector3;
    amber: Vector3;
  },
): WebGLCubeRenderTarget {
  const cubeTarget = new WebGLCubeRenderTarget(faceSize, {
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    type: HalfFloatType,
  });

  const bakeScene = new Scene();
  const geom = new BoxGeometry(2, 2, 2);
  const mat = new ShaderMaterial({
    glslVersion: GLSL3,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uBgColor: { value: colors.bg.clone() },
      uAccent: { value: colors.accent.clone() },
      uAccentDim: { value: colors.accentDim.clone() },
      uAccentAbyss: { value: colors.accentAbyss.clone() },
      uAmber: { value: colors.amber.clone() },
    },
    vertexShader: skyBakeVertexShader,
    fragmentShader: skyBakeFragmentShader,
  });

  const mesh = new Mesh(geom, mat);
  bakeScene.add(mesh);

  const cubeCam = new CubeCamera(0.1, 10, cubeTarget);
  cubeCam.update(renderer, bakeScene);
  renderer.initTexture(cubeTarget.texture);

  geom.dispose();
  mat.dispose();
  return cubeTarget;
}
