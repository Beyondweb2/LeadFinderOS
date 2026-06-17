// Portrait-biased collage layout for the public-site gallery (3–10 images),
// shared by the barber + salon templates. Counts 1–2 are handled in the template
// (simple centered portraits).
//
// Tiles are only SQUARE (1×1), TALL PORTRAIT (1×2), or BIG FEATURE (2×2) — there
// are deliberately NO wide (2:1) tiles, because barber/salon shots are mostly
// portrait and a wide tile letterbox-crops the top/bottom off a haircut. Combined
// with tall rows, a 1-cell tile renders ~square and a tall tile renders portrait,
// so faces/cuts aren't sliced.
//
// Each layout is "large tiles first, then 1×1 fillers" with total tile area
// EXACTLY = columns × rows, so `grid-auto-flow: dense` tiles the rectangle with
// no gaps (verified by placement simulation for every count). The mosaic applies
// at md:+ (4 columns); below md it collapses to a clean 2-column square grid.
// All class strings are literal so Tailwind's purge keeps them.

export interface GalleryLayout {
  /** md:+ column-count class for the container. */
  container: string;
  /** Per-tile md:+ span classes, index-aligned to the images. */
  tiles: string[];
}

const F = 'md:col-span-2 md:row-span-2'; // 2×2 big feature (near-square)
const T = 'md:row-span-2';               // 1×2 tall portrait
const o = '';                            // 1×1 small square filler

// Keyed by image count (3–10).
export const GALLERY_LAYOUTS: Record<number, GalleryLayout> = {
  3:  { container: 'md:grid-cols-4', tiles: [F, T, T] },                              // feature + 2 portraits
  4:  { container: 'md:grid-cols-4', tiles: [F, T, o, o] },                           // feature + portrait + 2 small
  5:  { container: 'md:grid-cols-4', tiles: [T, T, T, o, o] },                        // 3 portraits + 2 small
  6:  { container: 'md:grid-cols-4', tiles: [F, F, o, o, o, o] },                     // 2 features + 4 small
  7:  { container: 'md:grid-cols-4', tiles: [F, T, T, o, o, o, o] },                  // feature + 2 portraits + 4 small
  8:  { container: 'md:grid-cols-4', tiles: [T, T, T, T, o, o, o, o] },               // 4 portraits + 4 small
  9:  { container: 'md:grid-cols-4', tiles: [T, T, T, o, o, o, o, o, o] },            // 3 portraits + 6 small
  10: { container: 'md:grid-cols-4', tiles: [F, T, T, T, o, o, o, o, o, o] },         // feature + 3 portraits + 6 small
};

/** Container grid classes: mobile 2-col squares; md:+ dense collage with tall rows
 *  (so 1-cell tiles are ~square and tall tiles are portrait — never wide letterbox). */
export const GALLERY_GRID_BASE =
  'grid grid-cols-2 gap-3 sm:gap-4 md:grid-flow-row-dense md:auto-rows-[13rem] lg:auto-rows-[15rem]';
