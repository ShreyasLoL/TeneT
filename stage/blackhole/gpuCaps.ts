export type GpuCaps = {
  colorBufferFloat: boolean;
  colorBufferHalfFloat: boolean;
  textureHalfFloatLinear: boolean;
  textureFloatLinear: boolean;
  disjointTimerQuery: boolean;
  parallelShaderCompile: boolean;
  maxTextureSize: number;
  max3DTextureSize: number;
  rendererName: string;
  isSoftwareRenderer: boolean;
};

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|microsoft basic render/i;

let cachedCaps: GpuCaps | null = null;

export function detectGpuCaps(gl: WebGL2RenderingContext): GpuCaps {
  if (cachedCaps) return cachedCaps;

  const colorBufferFloat = Boolean(gl.getExtension('EXT_color_buffer_float'));
  const colorBufferHalfFloat = Boolean(gl.getExtension('EXT_color_buffer_half_float'));
  const textureHalfFloatLinear = Boolean(
    gl.getExtension('OES_texture_half_float_linear') || colorBufferHalfFloat || true,
  );
  const textureFloatLinear = Boolean(gl.getExtension('OES_texture_float_linear'));
  const disjointTimerQuery = Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2'));
  const parallelShaderCompile = Boolean(gl.getExtension('KHR_parallel_shader_compile'));

  let rendererName = 'unknown';
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    rendererName = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? 'unknown')
      : String(gl.getParameter(gl.RENDERER) ?? 'unknown');
  } catch {
    rendererName = 'unknown';
  }

  cachedCaps = {
    colorBufferFloat,
    colorBufferHalfFloat,
    textureHalfFloatLinear,
    textureFloatLinear,
    disjointTimerQuery,
    parallelShaderCompile,
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 4096),
    max3DTextureSize: Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) ?? 256),
    rendererName,
    isSoftwareRenderer: SOFTWARE_RE.test(rendererName),
  };
  return cachedCaps;
}
