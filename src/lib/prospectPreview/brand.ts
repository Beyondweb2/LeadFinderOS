/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the prospect's genuine brand, read from their own homepage HTML.

   Logo, colours, photos. String-level and deliberately conservative: a wrong logo on a mock-up is
   worse than none (the wordmark fallback reads as intentional; a partner badge in the header reads
   as a mistake the prospect spots in one second). Never throws.

   ⛔ The logo is used AS FOUND — never redrawn, recoloured or cropped. A small/low-grade one is
   used anyway and flagged for the operator.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { isBrandish, parseColor, toHex, toHsl, hueDistance, type Rgb } from './color.ts';

export interface BrandRead {
  logoUrl: string | null;
  /** Why the logo may be poor (tiny, favicon-grade, raster at low width). Operator-only. */
  logoWarning: string | null;
  primary: string | null;
  accent: string | null;
  /** How the colours were found, for the operator. */
  colourSource: string | null;
  photos: string[];
}

const NOT_A_PHOTO = /logo|icon|sprite|badge|avatar|gravatar|placeholder|blank|spacer|pixel|emoji|flag|payment|visa|mastercard|paypal|social|facebook|twitter|instagram|linkedin|whatsapp|youtube|tiktok|google|trustpilot|checkatrade|niceic|napit|gas-?safe|trustmark|accredit|certif|award|cookie|loader|arrow|chevron|star|rating|map[-_]|maps\.|captcha|wp-emoji/i;
/* ⛔ STOCK AND CLIP-ART ARE NOT "GENUINE BUSINESS PHOTOS" even when their own site uses them — the
   preview would present a library image as their work. Found live (2026-09-26): an AdobeStock hero
   and a WordPress site icon ("cropped-…", an svgrepo clip-art warning sign) on E.E.S Electrical. */
const STOCK_OR_CLIPART = /adobestock|shutterstock|istock|gettyimages|depositphotos|dreamstime|123rf|freepik|unsplash|pexels|pixabay|bigstock|alamy|envato|stock[-_]?photo|svgrepo|clip-?art|vecteezy|flaticon|\/cropped-|site-?icon|favicon/i;
const PHOTO_EXT = /\.(?:jpe?g|webp|png|avif)(?:$|\?)/i;
const LOGO_WORD = /logo/i;

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : null;
}

function decode(s: string): string {
  return s.replace(/&amp;/gi, '&').replace(/&#0*38;/g, '&').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'");
}

export function absoluteUrl(raw: string | null | undefined, base: string): string | null {
  const v = decode((raw ?? '').trim());
  if (!v || v.startsWith('data:') || v.startsWith('javascript:')) return null;
  try {
    const u = new URL(v, base);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch { return null; }
}

/** The biggest candidate in a srcset ("a.jpg 300w, b.jpg 1024w" → b.jpg). */
function largestFromSrcset(srcset: string | null): string | null {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(',')) {
    const [url, size] = part.trim().split(/\s+/);
    const w = size ? parseFloat(size) : 1;
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url ?? null;
}

/** WordPress-style size suffixes ("-300x200") and query strings — one photo, many URLs. */
function photoKey(url: string): string {
  try {
    const u = new URL(url);
    // Size variants, "-scaled", and hover/rollover twins of the same picture are one photo.
    return (u.host + u.pathname).toLowerCase().replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, '').replace(/-scaled(?=\.\w+$)/, '')
      // Numbers stay: job-1.jpg and job-2.jpg are two photos.
      .replace(/(?:[-_](?:rollover|hover|active|over|img|image))+(?=\.\w+$)/, '');
  } catch { return url; }
}

interface ImgTag { tag: string; src: string | null; index: number; inHeader: boolean }

function imgTags(html: string, base: string): ImgTag[] {
  const headerEnd = (() => {
    const m = /<\/header>/i.exec(html);
    return m ? m.index : Math.min(html.length, 12_000);
  })();
  const out: ImgTag[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const raw = largestFromSrcset(attr(tag, 'data-srcset') ?? attr(tag, 'srcset'))
      ?? attr(tag, 'data-src') ?? attr(tag, 'data-lazy-src') ?? attr(tag, 'src');
    out.push({ tag, src: absoluteUrl(raw, base), index: m.index ?? 0, inHeader: (m.index ?? 0) < headerEnd });
  }
  return out;
}

function schemaLogo(html: string, base: string): string | null {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const l = /"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*?"url"\s*:\s*"([^"]+)")/.exec(m[1]);
    const url = absoluteUrl(l?.[1] ?? l?.[2] ?? null, base);
    if (url) return url;
  }
  return null;
}

export function findLogo(html: string, base: string, businessName: string | null | undefined): { url: string | null; warning: string | null } {
  const imgs = imgTags(html, base).filter((i) => i.src);
  const nameWords = (businessName ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const score = (i: ImgTag) => {
    const hay = `${attr(i.tag, 'class') ?? ''} ${attr(i.tag, 'id') ?? ''} ${attr(i.tag, 'alt') ?? ''} ${i.src}`.toLowerCase();
    let s = 0;
    if (LOGO_WORD.test(hay)) s += 5;
    if (nameWords.some((w) => (attr(i.tag, 'alt') ?? '').toLowerCase().includes(w))) s += 2;
    if (i.inHeader) s += 3;
    // A partner / accreditation badge is not their logo.
    if (/niceic|napit|gas-?safe|trustmark|checkatrade|which|trustpilot|google|facebook|payment|award|accredit|member|partner|footer/i.test(hay)) s -= 8;
    return s;
  };
  const ranked = imgs.map((i) => ({ i, s: score(i) })).filter((x) => x.s >= 5).sort((a, b) => b.s - a.s || a.i.index - b.i.index);
  const pick = ranked[0]?.i.src ?? schemaLogo(html, base);
  if (!pick) return { url: null, warning: null };
  const tag = ranked[0]?.i.tag ?? '';
  const width = Number(attr(tag, 'width') ?? '0');
  const warning = /\.ico(?:$|\?)/i.test(pick) ? 'The only logo found is favicon-grade (.ico); used as found.'
    : width > 0 && width < 90 && !/\.svg(?:$|\?)/i.test(pick) ? `The logo on their site is small (${width}px wide); used as found, it may look soft.`
    : null;
  return { url: pick, warning };
}

/** Brand colours, in order of how deliberately the site declared them. */
/* ⛔ A PLATFORM'S DEFAULT PALETTE IS NOT A BRAND. Every WordPress page ships the core block palette
   (vivid red #cf2e2e, vivid green-cyan #00d084 …) in its global styles; Elementor ships default
   globals; Wix its UI blue. The same two WordPress defaults came back as "brand" for three unrelated
   real sites in the 2026-09-26 validation. */
export const PLATFORM_DEFAULT_COLOURS = new Set([
  '#cf2e2e', '#ff6900', '#fcb900', '#7bdcb5', '#00d084', '#8ed1fc', '#0693e3', '#abb8c3', '#9b51e0', '#f78da7',
  // Theme defaults: OceanWP accent, Astra/GeneratePress/Divi link blues.
  '#13aff0', '#0274be', '#0170b9', '#046bd2', '#1e73be', '#2ea3f2',
  '#6ec1e4', '#54595f', '#7a7a7a', '#61ce70', '#116dff', '#ffde11', '#3899ec', '#0073aa', '#2271b1', '#135e96', '#d63638', '#00a32a',
]);
const PLATFORM_STYLE_BLOCK = /id=["'][^"']*(?:global-styles|wp-block|core-block|classic-theme|wp-emoji|elementor-frontend|wix)[^"']*["']/i;

/** The site's own theme stylesheets worth reading for colour: same host; never core, plugins, fonts. */
export function stylesheetsToRead(html: string, base: string, max = 2): string[] {
  let host = '';
  try { host = new URL(base).hostname.replace(/^www\./, ''); } catch { return []; }
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
    const u = absoluteUrl(attr(m[0], 'href'), base);
    if (!u) continue;
    let h = '';
    try { h = new URL(u).hostname.replace(/^www\./, ''); } catch { continue; }
    if (h !== host || /wp-includes|wp-admin|\/plugins\/|block-library|dashicons|font|icon|awesome|jquery|slick|swiper|bootstrap/i.test(u)) continue;
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

export function findColours(html: string, extraCss = ''): { primary: string | null; accent: string | null; source: string | null } {
  const declared: Array<{ c: Rgb; from: string }> = [];
  const usable = (c: Rgb | null): c is Rgb => !!c && isBrandish(c) && !PLATFORM_DEFAULT_COLOURS.has(toHex(c));
  const theme = /<meta[^>]+name=["']theme-color["'][^>]*>/i.exec(html);
  const themeColour = parseColor(theme ? attr(theme[0], 'content') : null);
  if (usable(themeColour)) declared.push({ c: themeColour, from: 'theme-color meta tag' });

  // The site's OWN CSS: inline blocks that are not the platform's, plus their theme stylesheet.
  const ownStyles = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].filter((m) => !PLATFORM_STYLE_BLOCK.test(m[1])).map((m) => m[2]).join('\n') + '\n' + extraCss;

  // Named CSS custom properties from the common builders (Elementor, Astra, WP theme presets).
  const VAR = /--(?:e-global-color-(?:primary|accent|secondary)|ast-global-color-[0-2]|wp--preset--color--(?:primary|secondary|accent)|(?:color-)?(?:primary|brand|accent|secondary|main|theme)(?:-colou?r)?)\s*:\s*([^;}{]+)/gi;
  for (const m of ownStyles.matchAll(VAR)) {
    const c = parseColor(m[1]);
    if (usable(c)) declared.push({ c, from: 'the site’s CSS colour variables' });
  }

  // Fallback: the saturated colours their own CSS uses most (three uses or more).
  const counts = new Map<string, number>();
  const styleText = ownStyles + '\n' + [...html.matchAll(/\sstyle=["']([^"']+)["']/gi)].map((m) => m[1]).join('\n');
  for (const m of styleText.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]+\)/gi)) {
    const c = parseColor(m[0]);
    if (!usable(c)) continue;
    const hex = toHex(c);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const frequent = [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([h]) => parseColor(h)!);

  const all = [...declared.map((d) => d.c), ...frequent];
  if (!all.length) return { primary: null, accent: null, source: null };
  const primary = all[0];
  const accent = all.find((c) => hueDistance(c, primary) >= 25) ?? null;
  const source = declared.length ? declared[0].from : 'the colours used most in the site’s CSS';
  return { primary: toHex(primary), accent: accent ? toHex(accent) : null, source };
}

export function findPhotos(html: string, base: string, logoUrl: string | null, max = 8): string[] {
  const seen = new Set<string>();
  if (logoUrl) seen.add(photoKey(logoUrl));
  const out: string[] = [];
  const push = (u: string | null) => {
    if (!u || out.length >= max) return;
    const k = photoKey(u);
    if (seen.has(k) || NOT_A_PHOTO.test(u) || STOCK_OR_CLIPART.test(u) || !PHOTO_EXT.test(u)) return;
    seen.add(k);
    out.push(u);
  };
  for (const i of imgTags(html, base)) {
    const hay = `${attr(i.tag, 'class') ?? ''} ${attr(i.tag, 'alt') ?? ''}`;
    if (NOT_A_PHOTO.test(hay)) continue;
    const w = Number(attr(i.tag, 'width') ?? '0');
    const h = Number(attr(i.tag, 'height') ?? '0');
    if ((w && w < 280) || (h && h < 180)) continue;
    push(i.src);
  }
  // CSS background images on sections (hero banners are often only this).
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) push(absoluteUrl(m[1], base));
  const og = /<meta[^>]+property=["']og:image["'][^>]*>/i.exec(html);
  push(absoluteUrl(og ? attr(og[0], 'content') : null, base));
  return out;
}

export function readBrand(html: string, base: string, businessName: string | null | undefined, extraCss = ''): BrandRead {
  if (!html) return { logoUrl: null, logoWarning: null, primary: null, accent: null, colourSource: null, photos: [] };
  const logo = findLogo(html, base, businessName);
  const colours = findColours(html, extraCss);
  return {
    logoUrl: logo.url, logoWarning: logo.warning,
    primary: colours.primary, accent: colours.accent, colourSource: colours.source,
    photos: findPhotos(html, base, logo.url),
  };
}

/** Brand colours from an SVG logo's own fills — the most deliberate brand statement a small
 *  business makes. Most used first; platform defaults and greys excluded. */
export function svgLogoColours(svg: string): { primary: string | null; accent: string | null } {
  const counts = new Map<string, number>();
  for (const m of svg.matchAll(/(?:fill|stop-color|stroke)\s*[:=]\s*["']?\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]+\))/gi)) {
    const c = parseColor(m[1]);
    if (!c || !isBrandish(c) || PLATFORM_DEFAULT_COLOURS.has(toHex(c))) continue;
    counts.set(toHex(c), (counts.get(toHex(c)) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => parseColor(h)!);
  if (!ranked.length) return { primary: null, accent: null };
  // The deeper colour carries text and fills; the most different hue becomes the accent.
  const primary = [...ranked].sort((a, b) => toHsl(a).l - toHsl(b).l)[0];
  const accent = ranked.filter((c) => hueDistance(c, primary) >= 25).sort((a, b) => hueDistance(b, primary) - hueDistance(a, primary))[0] ?? null;
  return { primary: toHex(primary), accent: accent ? toHex(accent) : null };
}
