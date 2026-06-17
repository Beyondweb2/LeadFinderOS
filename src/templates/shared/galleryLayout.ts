// Mosaic layout config for the public-site gallery (1–10 images), shared by the
// barber + salon templates so they can never drift.
//
// Each layout is "large tiles first, then 1×1 fillers" with total tile area
// EXACTLY = columns × rows. Because 1×1 fillers slot into any leftover cell,
// `grid-auto-flow: dense` always completes the rectangle with NO gaps at any
// count. Spans apply at sm:+ only; on mobile everything collapses to a clean
// 2-column square grid. All class strings are literal so Tailwind's purge keeps
// them.

export interface GalleryLayout {
  /** sm:+ column-count class for the container. */
  container: string;
  /** Per-tile sm:+ span classes, index-aligned to the images. */
  tiles: string[];
}

const F = 'sm:col-span-2 sm:row-span-2'; // 2×2 feature
const W = 'sm:col-span-2';               // 2×1 wide
const T = 'sm:row-span-2';               // 1×2 tall
const o = '';                            // 1×1 filler

// Keyed by image count (2–10). Count 1 is handled specially (wide feature tile).
export const GALLERY_LAYOUTS: Record<number, GalleryLayout> = {
  2:  { container: 'sm:grid-cols-2', tiles: [o, o] },
  3:  { container: 'sm:grid-cols-3', tiles: [F, o, o] },                     // 1 large + 2 stacked
  4:  { container: 'sm:grid-cols-2', tiles: [o, o, o, o] },                  // 2×2
  5:  { container: 'sm:grid-cols-4', tiles: [F, o, o, o, o] },              // feature + 4
  6:  { container: 'sm:grid-cols-3', tiles: [o, o, o, o, o, o] },           // 3×2
  7:  { container: 'sm:grid-cols-4', tiles: [W, o, o, o, o, o, o] },        // wide feature + 6
  8:  { container: 'sm:grid-cols-4', tiles: [F, T, o, o, o, o, o, o] },     // feature + tall + 6
  9:  { container: 'sm:grid-cols-3', tiles: [o, o, o, o, o, o, o, o, o] },  // 3×3
  10: { container: 'sm:grid-cols-4', tiles: [F, T, T, T, o, o, o, o, o, o] }, // feature + 3 tall + 6 (4×4, tiles cleanly)
};

/** Container grid classes: mobile 2-col squares; sm:+ dense mosaic with fixed row height. */
export const GALLERY_GRID_BASE =
  'grid grid-cols-2 gap-3 sm:gap-4 sm:grid-flow-row-dense sm:auto-rows-[8.5rem] md:auto-rows-[11rem] lg:auto-rows-[13rem]';
