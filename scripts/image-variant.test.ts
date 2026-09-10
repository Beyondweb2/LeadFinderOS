/* ============================================================
   ASKING A CDN FOR A REAL SIZE, PINNED.

   🔴 WHY: Paul said "some of the images are blurry". They were placeholders — Wix serves a
   blurred 73x49 LQIP in `src` and swaps the photo in with JavaScript — and the vision scorer was
   grading MY HARVESTING as their photography. The same class of fault, on builders with nothing
   to do with Wix, is reading the FIRST srcset entry, which is conventionally the smallest.

   ⛔ THE PROPERTY MOST AT RISK OF A WELL-MEANING "SIMPLIFICATION": the place URL and the grid
   thumb use DIFFERENT rules, and the asymmetry is measured. Making them agree costs either the
   hero or the grid speed — both were measured on 2026-09-11 across six real locksmith sites:
     - srcset-largest for BOTH: grid 11,563KB -> 2,056KB, but hero-capable photos 25 -> 22.
     - CDN-original for BOTH:   hero-capable held, but Grays' grid alone stayed at 10,071KB.
   So: never undershoot the hero, always prefer the small one for a 420px tile.
   ============================================================ */
import { imageVariant, looksLikePlaceholder, parseSrcset, pickFromSrcset, resolveImgSizes,
         LQIP_MAX_EDGE, GRID_WIDTH, PLACE_WIDTH } from "../supabase/functions/_shared/image-variant.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const BASE = "https://example.co.uk/";

/* ── The Wix placeholder that started it ───────────────────────────────────────────────── */
const WIX_LQIP = "https://static.wixstatic.com/media/abc123~mv2.jpg/v1/fill/w_73,h_49,al_c,q_80,usm_0.66_1.00_0.01,blur_2,enc_avif/photo.jpg";
ok(looksLikePlaceholder(WIX_LQIP), "the real Wix LQIP is recognised as a placeholder");
const wixUp = imageVariant(WIX_LQIP, PLACE_WIDTH);
ok(!/blur_2/.test(wixUp), "upgrading DROPS blur_2 rather than keeping it");
ok(/w_1600/.test(wixUp), "upgrading asks for the width we wanted");
ok(/\/fit\//.test(wixUp) && !/\/fill\//.test(wixUp), "fit, not fill: a crop is the template's call, not a URL's");
ok(!looksLikePlaceholder(wixUp), "and the upgraded URL no longer reads as a placeholder");
ok(imageVariant(WIX_LQIP, PLACE_WIDTH) !== imageVariant(WIX_LQIP, GRID_WIDTH), "the two widths differ");

/* ⛔ NEVER THE ORIGINAL. Measured: those Wix originals are 2-7.5MB each, ~50MB a business. */
ok(/w_\d+/.test(imageVariant("https://static.wixstatic.com/media/abc123~mv2.jpg", PLACE_WIDTH)),
   "a bare Wix original gets a bounding transform, never served raw");

/* ── looksLikePlaceholder: the guard that must never let a blur be SCORED ───────────────── */
ok(looksLikePlaceholder("https://x.com/i/v1/fill/w_20,h_20/a.jpg"), "tiny w_/h_ is a placeholder");
ok(looksLikePlaceholder("https://x.com/a-64x64.jpg"), "a -64x64 suffix is a placeholder");
ok(!looksLikePlaceholder("https://x.com/a-1024x768.jpg"), "a -1024x768 suffix is NOT");
ok(!looksLikePlaceholder("https://x.com/i/v1/fit/w_1600,h_1600/a.jpg"), "a real requested size is NOT");
ok(!looksLikePlaceholder("not a url at all"), "an unparseable string is not claimed as a placeholder");
ok(looksLikePlaceholder(`https://x.com/i/v1/fill/w_${LQIP_MAX_EDGE},h_10/a.jpg`), "the edge is INCLUSIVE");
ok(!looksLikePlaceholder(`https://x.com/i/v1/fill/w_${LQIP_MAX_EDGE + 1},h_10/a.jpg`), "one px above is not");

/* ── An unrecognised host is returned UNCHANGED, never guessed at ───────────────────────── */
const odd = "https://cdn.somebuilder.example/photo.jpg";
ok(imageVariant(odd, 1600) === odd, "an unknown host is left alone (a mangled URL 404s and the photo vanishes)");
ok(imageVariant("javascript:alert(1)", 1600) === "javascript:alert(1)", "an unparseable input is returned as-is");

/* ── srcset parsing ─────────────────────────────────────────────────────────────────────── */
const SS = "a-300x200.jpg 300w, a-768x512.jpg 768w, a-1024x683.jpg 1024w, a.jpg 2000w";
const cands = parseSrcset(SS, BASE);
ok(cands.length === 4, "four candidates parsed");
ok(cands[0].url === BASE + "a-300x200.jpg", "relative candidates are resolved against the page");
ok(pickFromSrcset(cands, 420) === BASE + "a-768x512.jpg", "420 picks 768: at-or-above, never the 300 below it");
ok(pickFromSrcset(cands, 1600) === BASE + "a.jpg", "1600 picks the 2000w");
ok(pickFromSrcset(cands, 4000) === BASE + "a.jpg", "above everything falls back to the LARGEST, never the first");
ok(pickFromSrcset(parseSrcset("a.jpg 2x, b.jpg 1x", BASE), 420) === null, "x-descriptors carry no width, so no pick");
ok(pickFromSrcset(parseSrcset("", BASE), 420) === null, "an empty srcset picks nothing");
ok(parseSrcset("  ,  , a.jpg 100w ", BASE).length === 1, "blank entries are skipped, not counted");

/* ── resolveImgSizes: the order, and the asymmetry ──────────────────────────────────────── */
{
  // A lazy-loading Wix tag: src is the blurred placeholder, data-src the real photo.
  const r = resolveImgSizes({ src: WIX_LQIP, lazy: "https://static.wixstatic.com/media/abc123~mv2.jpg" },
                            BASE, { place: PLACE_WIDTH, grid: GRID_WIDTH })!;
  ok(!/blur_2/.test(r.url) && !/blur_2/.test(r.thumb), "🔴 src is read LAST: the placeholder never wins over data-src");
}
{
  // srcset reaches 1600+, so it wins on BOTH sides: the builder's own sizes, nothing guessed.
  const r = resolveImgSizes({ src: BASE + "a-300x200.jpg", srcset: SS }, BASE,
                            { place: PLACE_WIDTH, grid: GRID_WIDTH })!;
  ok(r.url === BASE + "a.jpg", "place takes the 2000w srcset entry");
  ok(r.thumb === BASE + "a-768x512.jpg", "⛔ the thumb takes 768, NOT the 2000w — this is the 10MB grid fix");
  ok(r.url !== r.thumb, "and the two are genuinely different requests");
}
{
  /* 🔴 THE BRISTOL CASE, and the reason for the asymmetry. WordPress publishes a srcset topping
     out at 720w while `src` carries a -200x300 suffix that strips to a 2089px original. Taking
     srcset's largest here cost Bristol two of its three hero-capable photos. */
  const SMALL = "a-300x200.jpg 300w, a-720x480.jpg 720w";
  const r = resolveImgSizes({ src: BASE + "DSC_0394-200x300.webp", srcset: SMALL }, BASE,
                            { place: PLACE_WIDTH, grid: GRID_WIDTH })!;
  ok(r.url === BASE + "DSC_0394.webp", "place falls back to the CDN original when srcset cannot reach 1600");
  ok(r.thumb === BASE + "a-720x480.jpg", "the thumb still prefers srcset's small entry — grid weight is the point");
}
{
  // Nothing usable at all.
  ok(resolveImgSizes({}, BASE, { place: PLACE_WIDTH, grid: GRID_WIDTH }) === null, "no attributes resolves to null");
  ok(resolveImgSizes({ src: "data:image/gif;base64,R0lGOD" }, BASE, { place: PLACE_WIDTH, grid: GRID_WIDTH }) === null,
     "an inline data URI is not an image we can size");
}
{
  // A thumb is never left empty — it falls back to the full URL rather than an empty src.
  const r = resolveImgSizes({ src: odd }, BASE, { place: PLACE_WIDTH, grid: GRID_WIDTH })!;
  ok(!!r.thumb, "the thumb is always populated (an empty src attribute renders as a broken image)");
}

/* ── The other builders, so this is not special-cased to Wix ────────────────────────────── */
ok(/=w420-h420/.test(imageVariant("https://lh3.googleusercontent.com/p/AF1abc=w1920-h1080-k-no", GRID_WIDTH)),
   "Google: the existing size suffix is REPLACED, not appended to");
ok(/format=1600w/.test(imageVariant("https://images.squarespace-cdn.com/content/v1/x/y.jpg?format=750w", PLACE_WIDTH)),
   "Squarespace: format is rewritten");
ok(imageVariant("https://s.co.uk/wp-content/uploads/2026/07/photo-300x200.jpg", PLACE_WIDTH)
   === "https://s.co.uk/wp-content/uploads/2026/07/photo.jpg",
   "WordPress: the size suffix is STRIPPED to the original, never rewritten to a size that was never generated");
ok(imageVariant("https://s.co.uk/wp-content/uploads/photo.jpg", PLACE_WIDTH)
   === "https://s.co.uk/wp-content/uploads/photo.jpg", "a WordPress original with no suffix is untouched");

console.log(f === 0 ? "\nOK all image-variant assertions hold" : `\n${f} FAILED`);
if (f) process.exit(1);
