/* PROSPECT PREVIEW — the screenshot policy, shared by the local driver (scripts/prospect-preview-
   local.ts, Chrome over DevTools) and the edge driver (_shared/prospect-preview-shot.ts, Cloudflare
   Browser Rendering). Same viewports, same settle, so the picture checked locally is the picture
   a prospect receives. Real rendered HTML only — never an image generator. */

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
}

/** Fonts + hotlinked photos load, then a short settle. */
export const SHOT_SETTLE_MS = 1200;
export const SHOT_NAV_TIMEOUT_MS = 20_000;
/** A full-page capture taller than this is cut (a runaway layout must not make a 40 MB PNG). */
export const SHOT_MAX_HEIGHT_PX = 9000;

export const SHOTS: readonly ShotSpec[] = [
  { asset: 'desktop_hero', doc: 'homepage', width: 1440, height: 900, fullPage: false, deviceScaleFactor: 1, mobile: false },
  { asset: 'desktop_full', doc: 'homepage', width: 1440, height: 900, fullPage: true, deviceScaleFactor: 1, mobile: false },
  { asset: 'mobile_hero', doc: 'homepage', width: 390, height: 844, fullPage: false, deviceScaleFactor: 2, mobile: true },
  { asset: 'mobile_full', doc: 'homepage', width: 390, height: 844, fullPage: true, deviceScaleFactor: 2, mobile: true },
  // The card is shot LAST: it embeds mobile_hero.
  { asset: 'evidence_card', doc: 'card', width: 1080, height: 1350, fullPage: true, deviceScaleFactor: 1, mobile: false },
];

/** Visual-QA only (never stored): the narrow phone. */
export const QA_SHOTS: readonly ShotSpec[] = [
  { asset: 'mobile_375', doc: 'homepage', width: 375, height: 812, fullPage: true, deviceScaleFactor: 2, mobile: true },
];
