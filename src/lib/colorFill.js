// =============================================================
// colorFill.js — v2.4 — 13-09-2026
// New in v2.4: turns a colour name from stock data into an actual
// swatch fill for the grid's big colour cells (Option B). Most names
// coming from the upload files are ordinary CSS colours once you
// lower-case them ("Black", "Green"), so those are resolved directly
// via CSS.supports(). A short curated list covers common fashion
// names CSS doesn't know (e.g. "Navy Blue", "Offwhite", "Wine").
// Anything unrecognized falls back to a neutral swatch rather than
// guessing — never renders a random colour for an unknown name.
// =============================================================

const FALLBACK_HEX = {
  offwhite: '#F1EAD9',
  'off white': '#F1EAD9',
  navy: '#22304F',
  'navy blue': '#22304F',
  'dark green': '#1F4D2C',
  'bottle green': '#123524',
  olive: '#5C6B2A',
  mustard: '#D8A642',
  wine: '#6B1F2A',
  maroon: '#6B1F2A',
  rust: '#B5551E',
  beige: '#E8DCC4',
  khaki: '#C3B27A',
  grey: '#8A8F8C',
  gray: '#8A8F8C',
  charcoal: '#3A3E3D',
  cream: '#F3ECD9',
  'sky blue': '#8FC1E3',
  'baby pink': '#F3C8D0',
  peach: '#F4C9A6',
  mint: '#B7E1C9',
  mauve: '#9C7A8A',
  teal: '#2f7d78',
};

function contrastText(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#1c2b29';
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#20302d' : '#ffffff';
}

function toHex(cssColor) {
  if (typeof document === 'undefined') return null;
  if (!toHex._canvas) toHex._canvas = document.createElement('canvas');
  const ctx = toHex._canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillStyle = cssColor;
  const resolved = ctx.fillStyle; // browsers normalize valid colours to #rrggbb here
  return /^#([0-9a-f]{6})$/i.test(resolved) ? resolved : null;
}

export function resolveColorFill(name) {
  const NEUTRAL = { bg: '#C7CDC9', text: '#20302d' };
  if (!name) return NEUTRAL;
  const key = String(name).trim().toLowerCase();
  let hex = FALLBACK_HEX[key];
  if (!hex && typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', name)) {
    hex = toHex(name) || name; // prefer the normalized hex so contrast text is accurate
  }
  if (!hex) return NEUTRAL;
  return { bg: hex, text: contrastText(hex) };
}
