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

   ⚠️ THESE ARE PLACEHOLDERS. Paul swaps the real set in later. They are real files in
   public/mockup-stock/ rather than data URIs so that swapping means replacing a FILE, not editing
   code — and so a placeholder is obvious on screen instead of silently passing for a photo.

   ⛔ AND THE PICKER ASSIGNS STOCK, NOT THE RENDERER. If the renderer substituted stock for an
   empty slot it would be making a layout decision, which is precisely what the template contract
   forbids. The picker fills below-fold slots at save time, visibly, and the operator can override.
   The renderer stays a pure substitution engine that knows nothing about stock.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface StockImage {
  id: string;
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
  { id: "tools-01", path: "/mockup-stock/tools-01.svg", alt: "Locksmith tools", caption: "Professional tools", niches: ["locksmith"] },
  { id: "lock-01", path: "/mockup-stock/lock-01.svg", alt: "A door lock", caption: "Door locks", niches: ["locksmith"] },
  { id: "keys-01", path: "/mockup-stock/keys-01.svg", alt: "Cut keys", caption: "Key cutting", niches: ["locksmith"] },
  { id: "van-01", path: "/mockup-stock/van-01.svg", alt: "A mobile service van", caption: "Mobile service", niches: ["locksmith", "plumber"] },
  { id: "pipes-01", path: "/mockup-stock/pipes-01.svg", alt: "Copper pipework", caption: "Pipework", niches: ["plumber"] },
  { id: "boiler-01", path: "/mockup-stock/boiler-01.svg", alt: "A domestic boiler", caption: "Heating", niches: ["plumber"] },
  { id: "generic-door-01", path: "/mockup-stock/generic-door-01.svg", alt: "A front door", caption: "Home security" },
  { id: "generic-work-01", path: "/mockup-stock/generic-work-01.svg", alt: "Tradesperson at work", caption: "On the job" },
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
