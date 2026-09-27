// Resolve um tom vibrante e legível a partir da cor (possivelmente pastel) salva.

const TONE_MAP: Record<string, string> = {
  '#FBEAF0': '#BE185D',
  '#E6F1FB': '#1D4ED8',
  '#E1F1EA': '#15803D',
  '#EEEDFE': '#6D28D9',
  '#FAEEDA': '#B45309',
  '#EAF3DE': '#4D7C0F',
};

const PALETTE = ['#1E3A8A', '#0369A1', '#15803D', '#B45309', '#BE185D', '#6D28D9'];

// Cores oferecidas no seletor de avatar (espelhadas na API em users/user-icons.ts).
// Todas com luminância < 0.62 → resolveTone usa como estão, texto branco legível.
export const AVATAR_COLORS = [
  '#1E3A8A', '#0369A1', '#0F766E', '#15803D',
  '#B45309', '#B91C1C', '#BE185D', '#6D28D9',
];

function hashIndex(seed: string, mod: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function resolveTone(color: string | undefined, seed: string): string {
  if (color && TONE_MAP[color.toUpperCase()]) return TONE_MAP[color.toUpperCase()];
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum < 0.62) return color;
  }
  return PALETTE[hashIndex(seed, PALETTE.length)];
}
