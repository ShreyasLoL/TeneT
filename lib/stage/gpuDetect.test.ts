import { describe, expect, it } from 'vitest';
import { classifyGpuRenderer, parseTierOverride, tierToQualityPatch } from './gpuDetect';

describe('offline GPU capability detector', () => {
  it('classifies discrete NVIDIA/AMD/Arc and Apple Silicon desktop GPUs as high tier', () => {
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)').tier).toBe('high');
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti)').tier).toBe('high');
    expect(classifyGpuRenderer('ANGLE (AMD, AMD Radeon RX 7800 XT)').tier).toBe('high');
    expect(classifyGpuRenderer('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics)').tier).toBe('high');
    expect(classifyGpuRenderer('Apple M3 Pro', { touch: false }).tier).toBe('high');
  });

  it('classifies modern Intel Iris Xe, Arc iGPU, and AMD RDNA iGPUs as mid tier', () => {
    const iris = classifyGpuRenderer('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)');
    expect(iris.tier).toBe('mid');
    expect(iris.isIntegrated).toBe(true);

    expect(classifyGpuRenderer('ANGLE (Intel, Intel(R) Arc(TM) Graphics)').tier).toBe('mid');
    expect(classifyGpuRenderer('ANGLE (AMD, AMD Radeon 780M Graphics)').tier).toBe('mid');
  });

  it('classifies Intel UHD/HD, older AMD Vega/generic low-spec iGPUs, and software renderers as low tier', () => {
    expect(classifyGpuRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620)').tier).toBe('low');
    expect(classifyGpuRenderer('Intel(R) HD Graphics 520').tier).toBe('low');
    expect(classifyGpuRenderer('AMD Radeon(TM) Vega 8 Graphics').tier).toBe('low');
    expect(
      classifyGpuRenderer('ANGLE (AMD, AMD Radeon(TM) Graphics)', { cores: 8, deviceMemory: 8 }).tier,
    ).toBe('low');
    expect(
      classifyGpuRenderer('ANGLE (AMD, AMD Radeon(TM) Graphics)', { cores: 16, deviceMemory: 16 }).tier,
    ).toBe('mid');

    const swift = classifyGpuRenderer('Google SwiftShader');
    expect(swift.tier).toBe('low');
    expect(swift.isSoftware).toBe(true);
    expect(classifyGpuRenderer('llvmpipe (LLVM 15.0.7, 256 bits)').tier).toBe('low');
  });

  it('parses ?tier=high|mid|low overrides and maps tiers to quality patches', () => {
    expect(parseTierOverride('?tier=low')).toBe('low');
    expect(parseTierOverride('?foo=1&tier=MID')).toBe('mid');
    expect(parseTierOverride('?tier=high')).toBe('high');
    expect(parseTierOverride('?tier=ultra')).toBeNull();
    expect(parseTierOverride('')).toBeNull();

    expect(tierToQualityPatch('high')).toEqual({ level: 0, lowPower: false });
    expect(tierToQualityPatch('mid')).toEqual({ level: 2, lowPower: false });
    expect(tierToQualityPatch('low')).toEqual({ level: 4, lowPower: true });
  });
});
