/* PROSPECT PREVIEW — colour arithmetic for brand adaptation. Pure. */

export interface Rgb { r: number; g: number; b: number }

export function parseColor(raw: string | null | undefined): Rgb | null {
  const s = (raw ?? '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(s);
  if (m) return { r: Math.min(255, +m[1]), g: Math.min(255, +m[2]), b: Math.min(255, +m[3]) };
  return null;
}

export function toHex(c: Rgb): string {
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

export function toHsl(c: Rgb): { h: number; s: number; l: number } {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h, s, l };
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

/** A colour that reads as a BRAND colour: not a grey, not near-white, not near-black. */
export function isBrandish(c: Rgb): boolean {
  const { s, l } = toHsl(c);
  return s >= 0.28 && l >= 0.14 && l <= 0.82;
}

export function hueDistance(a: Rgb, b: Rgb): number {
  const d = Math.abs(toHsl(a).h - toHsl(b).h);
  return Math.min(d, 360 - d);
}

function luminance(c: Rgb): number {
  const ch = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Shift lightness to `l` keeping hue; saturation capped so a neon brand stays usable. */
export function withLightness(c: Rgb, l: number, maxS = 0.9): Rgb {
  const hsl = toHsl(c);
  return fromHsl(hsl.h, Math.min(hsl.s, maxS), l);
}

/** Text colour for a fill: white when it reads, otherwise near-black. */
export function inkOn(fill: Rgb): string {
  return contrast(fill, { r: 255, g: 255, b: 255 }) >= 3 ? '#ffffff' : '#0b1220';
}

/** The page palette from the prospect's brand. With no brand colour, a neutral deep navy/amber
 *  pair is used — neutral, not another client's colour. */
export interface Palette {
  primary: string;
  primaryInk: string;
  /** A deep version of the primary, for dark sections (hero, CTA band, footer). */
  deep: string;
  deeper: string;
  /** A pale tint of the primary for light sections. */
  tint: string;
  accent: string;
  accentInk: string;
  fromBrand: boolean;
}

export const NEUTRAL_PRIMARY = '#1d4ed8';
export const NEUTRAL_ACCENT = '#f59e0b';

export function paletteFrom(primaryRaw: string | null | undefined, accentRaw: string | null | undefined): Palette {
  const p = parseColor(primaryRaw);
  const fromBrand = !!p;
  const primary = p ?? parseColor(NEUTRAL_PRIMARY)!;
  let accent = parseColor(accentRaw);
  if (!accent || hueDistance(accent, primary) < 25) {
    // No distinct second colour: the CTA uses the primary itself if it pops on dark, else amber.
    const onDark = contrast(primary, withLightness(primary, 0.1)) >= 3.2;
    accent = onDark && fromBrand ? primary : parseColor(NEUTRAL_ACCENT)!;
  }
  // A very pale primary cannot carry white text on buttons; deepen it for use as a fill.
  const fill = contrast(primary, { r: 255, g: 255, b: 255 }) < 3 && toHsl(primary).l > 0.5 ? withLightness(primary, 0.4) : primary;
  return {
    primary: toHex(fill),
    primaryInk: inkOn(fill),
    deep: toHex(withLightness(primary, 0.13, 0.55)),
    deeper: toHex(withLightness(primary, 0.08, 0.5)),
    tint: toHex(withLightness(primary, 0.965, 0.6)),
    accent: toHex(accent),
    accentInk: inkOn(accent),
    fromBrand,
  };
}
