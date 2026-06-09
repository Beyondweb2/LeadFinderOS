/**
 * Bundled stock assets for the barbershop template.
 *
 * Each import resolves (via Vite) to a hashed, locally-served URL — the bytes
 * are baked into the build. These are the fallbacks used when the content
 * payload doesn't supply its own hero / gallery image URLs.
 *
 * See ./assets/CREDITS.md for licensing (Unsplash License).
 */

import heroImg from "./assets/img/barber-hero.jpg";
import interiorImg from "./assets/img/barber-interior.jpg";
import lineupImg from "./assets/img/barber-lineup.jpg";
import cutImg from "./assets/img/barber-cut.jpg";
import clippersImg from "./assets/img/barber-clippers.jpg";

/** Bundled fallback hero image. */
export const STOCK_HERO = heroImg;

/** Bundled fallback "about" accent image. */
export const STOCK_INTERIOR = interiorImg;

/** Bundled fallback gallery set (used when no gallery URLs are supplied). */
export const STOCK_GALLERY: string[] = [interiorImg, lineupImg, cutImg, clippersImg];
