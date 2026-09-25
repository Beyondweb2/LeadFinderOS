/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the prospect's images, COPIED, never hotlinked (Paul, 2026-09-26).

   Only the images the homepage will actually show (the template's imageBudget: the logo and the
   first N photos) are fetched — never a media library. Each is validated (declared type AND magic
   bytes, size bounds; an SVG logo must carry no script), stored privately under the preview, and
   the page is rendered from OUR copy. A fetch or validation failure OMITS that image — no
   replacement, no stock. Provenance is kept: source URL → stored path.

   Rendered pages reference stored copies through a placeholder origin on the reserved `.invalid`
   TLD (it can never resolve to anyone's site). A driver swaps it for real URLs at render/view
   time: signed Storage URLs on the edge, the local server in the fixture driver. So the stored
   HTML never contains an expiring link, and the contamination check can prove nothing points at
   the prospect's production site.

   Pure: the caller does the fetching and the storing.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ProspectConfig, ProspectTemplate } from './types.ts';
import { svgLogoColours } from './brand.ts';

export const STORED_ASSET_HOST = 'prospect-preview.invalid';
export const STORED_ASSET_BASE = `https://${STORED_ASSET_HOST}/`;

export const MAX_PHOTO_BYTES = 6_000_000;
export const MAX_LOGO_BYTES = 1_000_000;
export const MIN_PHOTO_BYTES = 8_000;

export type ImageRole = 'logo' | 'photo';

export interface ImageToCopy { role: ImageRole; source: string; index: number }

/** The images the template will show — nothing more. */
export function imagesToCopy(cfg: ProspectConfig, t: Pick<ProspectTemplate, 'imageBudget'>): ImageToCopy[] {
  const out: ImageToCopy[] = [];
  if (t.imageBudget.logo && cfg.brand.logoUrl) out.push({ role: 'logo', source: cfg.brand.logoUrl.value, index: 0 });
  cfg.brand.photos.slice(0, t.imageBudget.photos).forEach((p, i) => out.push({ role: 'photo', source: p.value, index: i }));
  return out;
}

export type Sniff = { ok: true; type: string; ext: string } | { ok: false; reason: string };

/** Magic bytes decide, the header only has to agree it is an image. */
export function sniffImage(bytes: Uint8Array, contentType: string | null, role: ImageRole): Sniff {
  const max = role === 'logo' ? MAX_LOGO_BYTES : MAX_PHOTO_BYTES;
  if (bytes.length > max) return { ok: false, reason: `too large (${Math.round(bytes.length / 1024)} KB)` };
  if (role === 'photo' && bytes.length < MIN_PHOTO_BYTES) return { ok: false, reason: 'too small to be a photo' };
  const ct = (contentType ?? '').toLowerCase();
  if (ct && !ct.startsWith('image/') && !ct.startsWith('application/octet-stream')) return { ok: false, reason: `not an image (${ct.split(';')[0]})` };
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ok: true, type: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ok: true, type: 'image/png', ext: 'png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ok: true, type: 'image/webp', ext: 'webp' };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ok: true, type: 'image/gif', ext: 'gif' };
  if (b.length > 12 && String.fromCharCode(...b.subarray(4, 12)).startsWith('ftypavif')) return { ok: true, type: 'image/avif', ext: 'avif' };
  if (role === 'logo') {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, Math.min(b.length, 200_000)));
    if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) {
      if (/<script|\son\w+\s*=|javascript:|<foreignObject/i.test(head)) return { ok: false, reason: 'SVG carries script' };
      return { ok: true, type: 'image/svg+xml', ext: 'svg' };
    }
  }
  return { ok: false, reason: 'unrecognised image format' };
}

export function storedPathFor(dir: string, img: ImageToCopy, ext: string): string {
  return `${dir}/src/${img.role}-${img.index}.${ext}`;
}

export interface CopiedImage {
  role: ImageRole; source: string; stored: string | null; bytes?: number; type?: string; failed?: string;
  /** An SVG logo's own fill colours — the preferred brand colours when present. */
  logoColours?: { primary: string | null; accent: string | null };
}

/** Point the config at the stored copies. Anything not copied is dropped — never hotlinked. */
export function applyStoredImages(cfg: ProspectConfig, copied: CopiedImage[]): ProspectConfig {
  const bySource = new Map(copied.map((c) => [`${c.role}|${c.source}`, c]));
  const flags = [...cfg.flags];
  let logo = cfg.brand.logoUrl;
  let primary = cfg.brand.primary;
  let accent = cfg.brand.accent;
  if (logo) {
    const c = bySource.get(`logo|${logo.value}`);
    if (c?.stored) {
      const found = logo;
      logo = { ...found, value: STORED_ASSET_BASE + c.stored, quote: `copied from ${found.value}` };
      if (c.logoColours?.primary) {
        // Their logo's own colours outrank anything read from CSS (a theme default can pass for a brand there).
        primary = { value: c.logoColours.primary, source: found.source, url: found.url, quote: 'the colours in their logo' };
        accent = c.logoColours.accent ? { value: c.logoColours.accent, source: found.source, url: found.url, quote: 'the colours in their logo' } : accent;
        const keep = flags.filter((f) => !/No brand colour found/.test(f));
        flags.splice(0, flags.length, ...keep);
      }
    } else {
      flags.push(`Their logo (${logo.value}) could not be copied${c?.failed ? ` — ${c.failed}` : ''}; the text wordmark is used.`);
      logo = null;
    }
  }
  const photos: ProspectConfig['brand']['photos'] = [];
  let dropped = 0;
  for (const p of cfg.brand.photos) {
    const c = bySource.get(`photo|${p.value}`);
    if (c?.stored) photos.push({ ...p, value: STORED_ASSET_BASE + c.stored, quote: `copied from ${p.value}` });
    else if (c) dropped++;
  }
  if (dropped) flags.push(`${dropped} selected photo(s) could not be copied and were left out.`);
  return { ...cfg, brand: { ...cfg.brand, logoUrl: logo, primary, accent, photos }, flags };
}

/** Swap the placeholder origin for real URLs (signed Storage URLs, or a local server). */
export function resolveStoredAssets(html: string, urlFor: (path: string) => string | null): string {
  return html.replace(/https:\/\/prospect-preview\.invalid\/([^"')\s<>]+)/g, (m, path: string) => urlFor(path) ?? m);
}

/** Every image a page loads must be our stored copy (or inline). */
export function hotlinkedImages(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/gi)) {
    if (!m[1].startsWith(STORED_ASSET_BASE) && !m[1].startsWith('data:')) out.push(m[1]);
  }
  for (const m of html.matchAll(/url\(\s*['"]?(https?:[^'")]+)/gi)) if (!m[1].startsWith(STORED_ASSET_BASE)) out.push(m[1]);
  return out;
}

export interface CopyDeps {
  /** A capped, timed-out, public-address-only fetch. null = failed. */
  fetchBytes: (url: string, maxBytes: number) => Promise<{ bytes: Uint8Array; contentType: string | null } | null>;
  store: (path: string, bytes: Uint8Array, contentType: string) => Promise<void>;
}

/** Fetch, validate and store exactly the listed images. A failure omits that image, never the preview. */
export async function copyImages(list: ImageToCopy[], dir: string, deps: CopyDeps): Promise<CopiedImage[]> {
  return await Promise.all(list.map(async (img): Promise<CopiedImage> => {
    try {
      const max = (img.role === 'logo' ? MAX_LOGO_BYTES : MAX_PHOTO_BYTES) + 1;
      const got = await deps.fetchBytes(img.source, max);
      if (!got) return { role: img.role, source: img.source, stored: null, failed: 'could not be fetched' };
      const sniff = sniffImage(got.bytes, got.contentType, img.role);
      if (sniff.ok === false) return { role: img.role, source: img.source, stored: null, failed: sniff.reason };
      const path = storedPathFor(dir, img, sniff.ext);
      await deps.store(path, got.bytes, sniff.type);
      const logoColours = img.role === 'logo' && sniff.type === 'image/svg+xml' ? svgLogoColours(new TextDecoder('utf-8', { fatal: false }).decode(got.bytes)) : undefined;
      return { role: img.role, source: img.source, stored: path, bytes: got.bytes.length, type: sniff.type, ...(logoColours?.primary ? { logoColours } : {}) };
    } catch (e) {
      return { role: img.role, source: img.source, stored: null, failed: String((e as Error)?.message ?? e).slice(0, 120) };
    }
  }));
}
