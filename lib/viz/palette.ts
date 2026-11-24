export type TenetPalette = {
  bg: string;
  surface: string;
  line: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentDim: string;
  accentAbyss: string;
  accentHot: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
};

const FALLBACK_PALETTE = {
  bg: '#0B0910',
  surface: '#13111B',
  line: 'rgba(255, 255, 255, 0.08)',
  text: '#F5F3F7',
  textDim: '#A19DAA',
  textFaint: '#85818F',
  accent: '#E04DEA',
  accentDim: '#9E2FA6',
  accentAbyss: '#5F1764',
  statusSuccess: '#5DCAA5',
  statusWarning: '#EF9F27',
  statusDanger: '#E24B4A',
} as const;

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [224, 77, 234];
}

export function mixTowardWhite(hex: string, amount: number): string {
  const [r, g, b] = parseHexRgb(hex);
  const t = Math.min(1, Math.max(0, amount));
  const mr = Math.round(r + (255 - r) * t);
  const mg = Math.round(g + (255 - g) * t);
  const mb = Math.round(b + (255 - b) * t);
  return `#${mr.toString(16).padStart(2, '0')}${mg.toString(16).padStart(2, '0')}${mb.toString(16).padStart(2, '0')}`.toUpperCase();
}

export function hexToRgbNormalized(hex: string): [number, number, number] {
  const [r, g, b] = parseHexRgb(hex);
  return [r / 255, g / 255, b / 255];
}

function readVar(styles: CSSStyleDeclaration | null, name: string, fallback: string): string {
  if (!styles) return fallback;
  const val = styles.getPropertyValue(name).trim();
  return val || fallback;
}

/** Read color tokens at runtime from CSS custom properties and derive accentHot. */
export function readPalette(): TenetPalette {
  const styles =
    typeof window !== 'undefined' && typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement)
      : null;

  const accent = readVar(styles, '--accent', FALLBACK_PALETTE.accent);
  return {
    bg: readVar(styles, '--bg', FALLBACK_PALETTE.bg),
    surface: readVar(styles, '--surface', FALLBACK_PALETTE.surface),
    line: readVar(styles, '--line', FALLBACK_PALETTE.line),
    text: readVar(styles, '--text', FALLBACK_PALETTE.text),
    textDim: readVar(styles, '--text-dim', FALLBACK_PALETTE.textDim),
    textFaint: readVar(styles, '--text-faint', FALLBACK_PALETTE.textFaint),
    accent,
    accentDim: readVar(styles, '--accent-dim', FALLBACK_PALETTE.accentDim),
    accentAbyss: readVar(styles, '--accent-abyss', FALLBACK_PALETTE.accentAbyss),
    accentHot: mixTowardWhite(accent, 0.7),
    statusSuccess: readVar(styles, '--status-success', FALLBACK_PALETTE.statusSuccess),
    statusWarning: readVar(styles, '--status-warning', FALLBACK_PALETTE.statusWarning),
    statusDanger: readVar(styles, '--status-danger', FALLBACK_PALETTE.statusDanger),
  };
}
