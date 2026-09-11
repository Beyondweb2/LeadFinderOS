/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CURATED STOCK SET — data only, no imports. Shared by the picker and the server.

   Paul's strategy, 2026-09-10, and it is deliberately the whole of it:
     · Google Maps is the PRIMARY pool (~8.6 photos per business, measured). Own-site images are a
       bonus, not something to design around.
     · Stock is ONE CURATED SET in the repo, reused every build. Never a random pull, never
       per-business generation.
     · 🔴 STOCK NEVER GOES IN THE HERO. Below the fold only.
     · Captions and alt text are generic and TRUE. Never captioned as their own work, never naming
       the owner or the town.

   ⛔ THE HERO EXCEPTION IS THE POINT, NOT A DETAIL. The hero is what renders in the WhatsApp
   preview, so a stock photo there is the first thing a prospect sees where their own shop should
   be — and it reads as a template, which is fatal for an asset whose whole job is to look like
   THEIR site. Hero gets a real photo or no photo. Measured: three of six locksmiths have no
   hero-capable own-site photo, which is exactly why the template must collapse without one
   (src/lib/mockupRender.ts, scripts/mockup-render.test.ts) rather than reach for stock.

   ⛔ ONE SET, AND IT LIVES IN public/mockup-stock/. Paul's other session is producing the six real
   locksmith files; this is the same set, not a second one. The folder is forced by who has to READ
   it: the picker needs an HTTP URL for its drag strip, the mockup HTML references it with
   <img src="/mockup-stock/…">, Cloudflare's screenshot fetches it like any browser, and — the
   decisive one — Step 8's canvas composite needs it SAME-ORIGIN, because a canvas tainted by a
   cross-origin image cannot export a PNG and the PNG is the product. public/ is the only directory
   Vite copies verbatim into dist/.
   ⚠️ THE FILES HERE ARE PLACEHOLDERS UNTIL THE REAL JPGs LAND, and they are real files rather than
   data URIs so a swap means replacing a FILE, not editing code — and so a placeholder is obvious on
   screen instead of silently passing for a photo.

   ⛔ AND THE PICKER ASSIGNS STOCK, NOT THE RENDERER. If the renderer substituted stock for an
   empty slot it would be making a layout decision, which is precisely what the template contract
   forbids. The picker fills below-fold slots at save time, visibly, and the operator can override.
   The renderer stays a pure substitution engine that knows nothing about stock.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface StockImage {
  /** 🔴 TRUE while this entry is still a labelled SVG placeholder rather than a photograph.
   *  buildPhotos SKIPS these, so "REPLACE WITH stock-04" can never appear in a prospect's
   *  gallery. Delete the flag on the row when the real file lands. */
  placeholder?: boolean;
  id: string;
  /** What the photograph actually shows. Self-documenting so a numbered file can be identified. */
  subject: string;
  /** Served from /public. Swap the FILE to swap the image; the id and copy stay put. */
  path: string;
  /**
   * Generic and TRUE. ⛔ Never "our work", never a place name, never an owner's name — a stock
   * caption that claims the business's own job is a false claim about them on a document they
   * are being shown about themselves.
   */
  alt: string;
  /** Optional visible caption. Same rule as alt. */
  caption?: string;
  /** Which niches this image suits. Empty = suits all. */
  niches?: string[];
}

/**
 * ⛔ THE SLOT STOCK MAY NEVER FILL. Asserted as a POSITIVE list of forbidden slots rather than
 * "any slot except the ones I listed as allowed", because slot names are FREE-FORM (the operator
 * invents them in the template) — so an allowlist would silently refuse stock in a new slot,
 * while this refuses it only where it is actually harmful.
 * ⚠️ Matched case-insensitively and on the whole name, so a template that calls its hero "Hero"
 * or "HERO" is still covered, while "hero_detail" is not accidentally caught by a substring.
 */
export const STOCK_FORBIDDEN_SLOTS = ["hero", "banner", "masthead"];

/** May stock be placed in this slot? */
export function stockAllowedInSlot(slot: string): boolean {
  const s = String(slot ?? "").trim().toLowerCase();
  if (!s) return false;
  return !STOCK_FORBIDDEN_SLOTS.includes(s);
}

/**
 * The set. Placeholders — swap the files in public/mockup-stock/.
 *
 * ⚠️ Captions describe a GENERIC trade scene and nothing else. Read each one and ask "could this
 * be false about this business?" — if it names a place, a person, a date, a price or a claim about
 * work they did, it is wrong for a stock image.
 */
export const MOCKUP_STOCK: StockImage[] = [
  /* ⛔ ONE SET, AND THE REPO NOW OWNS IT — 2026-09-11, same ruling as the template. The design
     session produced these six photographs; this file carries the MEANING, because a numbered
     file carries none and `alt` has to be TRUE.
     🔴 THE CAPTIONS BELOW ARE COPIED VERBATIM FROM THAT SESSION'S captions.json, AND THEY HAD
     ALREADY DRIFTED. A golden diff of the two derivations found this file saying "Out of hours"
     and "In the workshop" where the design session said "Out-of-hours call-out" and "Key cutting
     and lock workshop" — two stock sets with two sets of words, which is precisely what "one
     curated set" exists to prevent. If they are edited, edit them HERE and let that session read
     this file.
     ⚠️ Still generic and true only: never claim the photo is this business's own work, and never
     name the owner or the town. `subject` exists so the mapping is self-documenting — without it
     nobody can tell which file is the euro cylinder, and the next person to swap one would guess.
     ⚠️ ALL SIX ARE REAL PHOTOGRAPHS NOW. The `placeholder` flag stays on the interface because the
     NEXT niche will go through the same half-finished state, and buildPhotos skipping a flagged
     row is what stops a labelled "REPLACE WITH" panel reaching a prospect's gallery.
     ⚠️ 01-03 ARE ~2MB PNGs AND 04-06 ARE ~250KB JPEGs. The PNGs are far too heavy for a
     below-the-fold gallery image; flagged rather than silently re-encoded, because resizing
     someone's photography is a design decision, not a build step. */
  { id: "stock-01", subject: "front door lock", path: "/mockup-stock/stock-01.png", alt: "A black lever handle on a composite front door", caption: "Composite front door, lever handle", niches: ["locksmith"] },
  { id: "stock-02", subject: "euro cylinder", path: "/mockup-stock/stock-02.png", alt: "A brass euro profile cylinder on dark slate", caption: "Brass euro cylinder", niches: ["locksmith"] },
  { id: "stock-03", subject: "anti-snap cylinder", path: "/mockup-stock/stock-03.png", alt: "An anti-snap cylinder cut away with the pins exposed", caption: "Anti-snap cylinder, pins exposed", niches: ["locksmith"] },
  { id: "stock-04", subject: "lit doorway", path: "/mockup-stock/stock-04.jpg", alt: "A lit doorway at night", caption: "Out-of-hours call-out", niches: ["locksmith"] },
  { id: "stock-05", subject: "workshop bench", path: "/mockup-stock/stock-05.jpg", alt: "A workshop bench with lock tools", caption: "Key cutting and lock workshop", niches: ["locksmith"] },
  { id: "stock-06", subject: "cut keys", path: "/mockup-stock/stock-06.jpg", alt: "A set of freshly cut keys", caption: "Cut keys", niches: ["locksmith"] },
];

/** The stock available for a niche, in set order. Niche-specific first, then the generics. */
export function stockFor(niche: string | null | undefined): StockImage[] {
  const n = String(niche ?? "").trim().toLowerCase();
  const specific = MOCKUP_STOCK.filter((s) => (s.niches ?? []).includes(n));
  const generic = MOCKUP_STOCK.filter((s) => !s.niches || s.niches.length === 0);
  return [...specific, ...generic];
}

/** Look one up by id. Null for an unknown id — never a substitute, which would silently place a
 *  different image than the one recorded. */
export function stockById(id: string | null | undefined): StockImage | null {
  return MOCKUP_STOCK.find((s) => s.id === id) ?? null;
}
