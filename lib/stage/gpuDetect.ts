import type { QualityLevel } from './tiers';

export type GpuTier = 'high' | 'mid' | 'low';

export type GpuProfileReport = {
  renderer: string;
  tier: GpuTier;
  isSoftware: boolean;
  isIntegrated: boolean;
  reason: string;
};

export type GpuHints = {
  cores?: number;
  deviceMemory?: number;
  touch?: boolean;
  maxTextureSize?: number;
};

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|microsoft basic render|warp/i;

const INTEL_STRONG_IGPU_RE = /intel.*(iris\s*(xe|plus|pro)|arc(?:\(tm\)|\s)*graphics)/i;
const INTEL_WEAK_IGPU_RE = /intel.*(uhd|hd graphics|gma)/i;
const INTEL_ARC_DISCRETE_RE = /intel.*arc(?:\(tm\)|\s)*(?:a[357]\d\d|b[57]\d\d|pro)/i;

const AMD_WEAK_IGPU_RE =
  /(vega\s*(3|6|7|8|9|10|11)\b|radeon\s*r[234567]\b|radeon\s*610m|picasso|raven|renoir|cezanne|barcelo|mendocino)/i;
const AMD_GENERIC_IGPU_RE = /amd radeon\(tm\) graphics/i;
const AMD_STRONG_IGPU_RE = /radeon.*(660m|680m|740m|760m|780m|880m|890m)/i;
const AMD_DISCRETE_RE =
  /radeon.*(rx\s*[56789]\d{2,3}|pro\s*w|vega\s*(56|64)|fury|\bvii\b)|rdna/i;

const NVIDIA_ANCIENT_RE = /gt\s*(610|710|720|730)\b/i;
const NVIDIA_DISCRETE_RE = /nvidia|geforce|quadro|titan|rtx|gtx/i;

const APPLE_DESKTOP_RE = /apple\s*m[1-9]/i;
const APPLE_GENERIC_RE = /apple gpu/i;

const MOBILE_WEAK_RE = /adreno.*(3\d\d|4\d\d|5\d\d)|mali-[gt][3456]\d|powervr/i;
const MOBILE_STRONG_RE = /adreno.*[678]\d\d|mali-g7[789]|immortalis/i;

export function parseTierOverride(search?: string): GpuTier | null {
  const raw =
    search !== undefined
      ? search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
  if (!raw) return null;
  const val = new URLSearchParams(raw).get('tier')?.toLowerCase();
  if (val === 'high' || val === 'mid' || val === 'low') return val;
  return null;
}

export function classifyGpuRenderer(
  renderer: string,
  hints: GpuHints = {},
): GpuProfileReport {
  const r = renderer.trim() || 'unknown';
  const cores = hints.cores ?? 4;
  const mem = hints.deviceMemory ?? 8;
  const touch = hints.touch ?? false;
  const maxTex = hints.maxTextureSize;

  if (SOFTWARE_RE.test(r)) {
    return { renderer: r, tier: 'low', isSoftware: true, isIntegrated: true, reason: 'software-renderer' };
  }
  if (maxTex !== undefined && maxTex < 4096) {
    return { renderer: r, tier: 'low', isSoftware: false, isIntegrated: true, reason: 'low-max-texture-size' };
  }

  // Discrete GPUs (high)
  if (NVIDIA_DISCRETE_RE.test(r) && !NVIDIA_ANCIENT_RE.test(r)) {
    return { renderer: r, tier: 'high', isSoftware: false, isIntegrated: false, reason: 'nvidia-discrete' };
  }
  if (AMD_DISCRETE_RE.test(r)) {
    return { renderer: r, tier: 'high', isSoftware: false, isIntegrated: false, reason: 'amd-discrete' };
  }
  if (INTEL_ARC_DISCRETE_RE.test(r)) {
    return { renderer: r, tier: 'high', isSoftware: false, isIntegrated: false, reason: 'intel-arc-discrete' };
  }
  if (APPLE_DESKTOP_RE.test(r) || (APPLE_GENERIC_RE.test(r) && !touch)) {
    return { renderer: r, tier: 'high', isSoftware: false, isIntegrated: false, reason: 'apple-silicon' };
  }

  // Modern capable iGPUs & flagship mobile GPUs (mid)
  if (INTEL_STRONG_IGPU_RE.test(r)) {
    return { renderer: r, tier: 'mid', isSoftware: false, isIntegrated: true, reason: 'intel-modern-igpu' };
  }
  if (AMD_STRONG_IGPU_RE.test(r)) {
    return { renderer: r, tier: 'mid', isSoftware: false, isIntegrated: true, reason: 'amd-modern-igpu' };
  }
  if (AMD_GENERIC_IGPU_RE.test(r) && (cores > 8 || mem > 8)) {
    return { renderer: r, tier: 'mid', isSoftware: false, isIntegrated: true, reason: 'amd-igpu-high-core' };
  }
  if ((APPLE_GENERIC_RE.test(r) && touch) || MOBILE_STRONG_RE.test(r)) {
    return { renderer: r, tier: 'mid', isSoftware: false, isIntegrated: true, reason: 'mobile-modern-gpu' };
  }

  // Legacy / entry Intel & AMD iGPUs and low-end mobile (low)
  if (INTEL_WEAK_IGPU_RE.test(r)) {
    return { renderer: r, tier: 'low', isSoftware: false, isIntegrated: true, reason: 'intel-entry-igpu' };
  }
  if (AMD_WEAK_IGPU_RE.test(r) || AMD_GENERIC_IGPU_RE.test(r) || NVIDIA_ANCIENT_RE.test(r)) {
    return { renderer: r, tier: 'low', isSoftware: false, isIntegrated: true, reason: 'amd-entry-igpu' };
  }
  if (MOBILE_WEAK_RE.test(r)) {
    return { renderer: r, tier: 'low', isSoftware: false, isIntegrated: true, reason: 'mobile-entry-gpu' };
  }

  if (touch && (cores <= 4 || mem <= 4)) {
    return { renderer: r, tier: 'low', isSoftware: false, isIntegrated: true, reason: 'touch-low-spec' };
  }
  if (cores <= 4 || mem <= 4) {
    return { renderer: r, tier: 'mid', isSoftware: false, isIntegrated: true, reason: 'low-core-fallback' };
  }
  return { renderer: r, tier: 'mid', isSoftware: false, isIntegrated: false, reason: 'unknown-safe-mid' };
}

export function tierToQualityPatch(tier: GpuTier): {
  level: QualityLevel;
  lowPower: boolean;
} {
  if (tier === 'high') return { level: 0, lowPower: false };
  if (tier === 'mid') return { level: 2, lowPower: false };
  return { level: 4, lowPower: true };
}
