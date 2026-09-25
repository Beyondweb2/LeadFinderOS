/* PROSPECT PREVIEW — the screenshot policy, shared by the local driver (scripts/prospect-preview-
   local.ts, Chrome over DevTools) and the edge driver (_shared/prospect-preview-shot.ts, Cloudflare
   Browser Rendering). Same viewports, same settle, same HEIGHT CAP, so the picture checked locally
   is the picture a prospect receives. Real rendered HTML only — never an image generator.

   ⛔ EVERY FULL-PAGE SHOT IS BOUNDED (Paul, 2026-09-26). The cap lives IN THE DOCUMENT
   (`withShotCap`), so it holds whichever browser takes the picture: before capture, an inline script
   removes whole lower sections (gallery → FAQs → about → areas) until the page fits, and only as a
   last resort clips at the cap. Hero, services, the contact band and the footer are kept, so a
   capped page still ends cleanly. After capture, `shotWithinCap` reads the PNG header and refuses
   anything taller or heavier than the policy — an unbounded image is never stored. */

import type { PreviewAsset } from './types.ts';

export interface ShotSpec {
  asset: PreviewAsset | 'mobile_375';
  /** Which document is photographed. */
  doc: 'homepage' | 'card';
  width: number;
  height: number;
  fullPage: boolean;
  deviceScaleFactor: number;
  mobile: boolean;
  /** Full-page shots: the tallest page, in CSS px, that may be captured. */
  maxCssHeight: number;
}

/** Fonts + the stored photos load, then a short settle. */
export const SHOT_SETTLE_MS = 1200;
export const SHOT_NAV_TIMEOUT_MS = 20_000;
/** No stored screenshot is heavier than this, whatever the page. */
export const SHOT_MAX_BYTES = 12_000_000;

export const SHOTS: readonly ShotSpec[] = [
  { asset: 'desktop_hero', doc: 'homepage', width: 1440, height: 900, fullPage: false, deviceScaleFactor: 1, mobile: false, maxCssHeight: 900 },
  { asset: 'desktop_full', doc: 'homepage', width: 1440, height: 900, fullPage: true, deviceScaleFactor: 1, mobile: false, maxCssHeight: 6000 },
  { asset: 'mobile_hero', doc: 'homepage', width: 390, height: 844, fullPage: false, deviceScaleFactor: 2, mobile: true, maxCssHeight: 844 },
  { asset: 'mobile_full', doc: 'homepage', width: 390, height: 844, fullPage: true, deviceScaleFactor: 2, mobile: true, maxCssHeight: 8000 },
  // The card is shot LAST: it embeds mobile_hero.
  { asset: 'evidence_card', doc: 'card', width: 1080, height: 1350, fullPage: true, deviceScaleFactor: 1, mobile: false, maxCssHeight: 2400 },
];

/** Visual-QA only (never stored): the narrow phone. */
export const QA_SHOTS: readonly ShotSpec[] = [
  { asset: 'mobile_375', doc: 'homepage', width: 375, height: 812, fullPage: true, deviceScaleFactor: 2, mobile: true, maxCssHeight: 8000 },
];

/** Sections a capped page gives up first. Selectors match the templates' section markup. */
export const SHED_ORDER = ['.gallery', '#faq', '#about', '#areas', '.trust'];

/**
 * The document to photograph for `s`: for a full-page shot, with the height cap built in.
 * ⛔ No backtick may appear in the injected script (it is written into a template literal chain).
 */
export function withShotCap(html: string, s: ShotSpec): string {
  if (!s.fullPage) return html;
  const cap = Math.max(s.height, Math.floor(s.maxCssHeight));
  const shed = JSON.stringify(SHED_ORDER);
  const script = '<script>(function(){var cap=' + cap + ',shed=' + shed + ';' +
    'function h(){return Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);}' +
    'function fit(){for(var i=0;i<shed.length&&h()>cap;i++){var el=document.querySelector(shed[i]);if(el)el.remove();}' +
    'if(h()>cap){document.documentElement.style.maxHeight=cap+"px";document.documentElement.style.overflow="hidden";document.body.style.maxHeight=cap+"px";document.body.style.overflow="hidden";}' +
    'document.documentElement.setAttribute("data-shot-height",String(Math.min(h(),cap)));}' +
    'if(document.readyState==="complete")fit();else window.addEventListener("load",fit);' +
    'if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);})();</script>';
  return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
}

/** Width/height from a PNG's IHDR, or null if it is not a PNG. */
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const u32 = (o: number) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  return { width: u32(16), height: u32(20) };
}

export type CapCheck = { ok: true; width: number; height: number } | { ok: false; reason: string };

export function shotWithinCap(bytes: Uint8Array, s: ShotSpec): CapCheck {
  if (bytes.length > SHOT_MAX_BYTES) return { ok: false, reason: `screenshot too heavy (${Math.round(bytes.length / 1e6)} MB)` };
  const d = pngDimensions(bytes);
  if (!d) return { ok: false, reason: 'screenshot is not a PNG' };
  const maxH = Math.ceil((s.fullPage ? s.maxCssHeight : s.height) * s.deviceScaleFactor) + 2;
  if (d.height > maxH) return { ok: false, reason: `screenshot ${d.height}px tall exceeds the ${maxH}px cap` };
  return { ok: true, width: d.width, height: d.height };
}
