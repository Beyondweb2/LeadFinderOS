/**
 * Bundled stock assets for the salon template.
 *
 * Each import resolves (via Vite) to a hashed, locally-served URL — the bytes
 * are baked into the build. These are the fallbacks used when the content
 * payload doesn't supply its own hero / about / gallery image URLs. All shots
 * are bright, natural-light salon photography to suit the light/airy theme.
 *
 * See ./assets/CREDITS.md for licensing (Unsplash License).
 */

import heroImg from "./assets/img/salon-hero.jpg";
import portraitImg from "./assets/img/salon-portrait.jpg";
import interiorImg from "./assets/img/salon-interior.jpg";
import detailImg from "./assets/img/salon-detail.jpg";
import neonImg from "./assets/img/salon-neon.jpg";
import receptionImg from "./assets/img/salon-reception.jpg";

/** Bundled fallback hero image (bright, wide salon interior). */
export const STOCK_HERO = heroImg;

/** Bundled fallback "about" accent image (portrait orientation, 4:5). */
export const STOCK_INTERIOR = portraitImg;

/** Bundled fallback gallery set (used when no gallery URLs are supplied). */
export const STOCK_GALLERY: string[] = [interiorImg, neonImg, detailImg, receptionImg];
