/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE MOCKUP NICHE REGISTRY — data only, no React, no imports.

   ⛔ IT IS DATA BECAUSE IT HAS TO LOAD SERVER-SIDE. The deleted src/templates/registry.ts had the
   right idea and the wrong shape: it imported three React components through the `@/` alias, so it
   could not be read by an edge function at all — and the mockup HTML is built server-side. It also
   meant "adding a niche" meant writing another 1,100-2,100 line component, which is why there were
   three near-identical ones totalling 4,856 lines instead of three data files.
   ⚠️ KEEP THIS FILE IMPORT-FREE. It is loaded by BOTH the SPA and a Deno edge function
   (`../../../src/lib/mockupNiche.ts`), and the Supabase bundler rejects the `@/` alias outright
   even though `deno check` passes on it (CLAUDE.md §4).

   ADDING A NICHE IS THIS FILE PLUS A TEMPLATE FILE. No code changes — that is the contract Paul
   is authoring templates against.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** One vertical. `template` is resolved by the renderer (Step 5); nothing here loads it. */
export interface MockupNiche {
  /** Stored in generated_sites.template. Stable — it is a database value, not a label. */
  key: string;
  /** Operator-facing label. Never rendered on a mockup. */
  label: string;
  /** Title-case trade word used INSIDE the mockup, e.g. "Locksmith in Huntingdon". */
  trade: string;
  /** The template file Paul authors. Resolved relative to src/mockup/templates/. */
  template: string;
  /**
   * `outreach_leads.search_keyword` values that mean this niche, lowercased.
   *
   * ⛔ THIS EXISTS BECAUSE THE DATA IS NOT NORMALISED AND CANNOT BE FIXED AT SOURCE. Measured
   * 2026-09-10 over 3,203 leads: "plumbers" 1,046 AND "plumber" 166; "locksmiths" 1,034 AND
   * "locksmith" 11; "accountants" 266 AND "accountant" 204; plus "plumbing" and "plummer".
   * ⚠️ AND `category` IS NOT AN ALTERNATIVE — it is populated on 1 lead of 3,203. search_keyword
   * (3,063 of 3,203) is the only usable niche signal there is.
   */
  matches: string[];
}

/**
 * ⛔ CAPS LIVE HERE, NOT IN THE TEMPLATE — Paul's call, and it is what makes his design job
 * tractable. Measured ranges across six real locksmith sites:
 *   services  2 → 37   (median 9)
 *   areas     0 → 38   (median 11; TWO of the six returned 0 or 1)
 * A template that must look right at any length is a far harder design job than one that never
 * sees more than six. Truncation is the renderer's, so no template writes defensive markup.
 *
 * ⛔ AND THE AREA CAP IS A PRODUCT DECISION, NOT A LAYOUT ONE. A 38-town footer is a
 * doorway/keyword-stuffing signal — precisely what RG Locksmiths' site is being rewritten to
 * remove (CLAUDE.md §5). Putting 38 towns on a mockup would reproduce the defect the product
 * exists to fix. Eight reads as real coverage; thirty-eight reads as spam.
 * ⚠️ 8 rather than 6 (services') because town names are 1-3 words and 8 sits on one line.
 * ⚠️ DISPLAY ONLY. If location pages are built, one page per town is the product and that is a
 * different number — scan-site-details' `max_areas` already allows 60.
 */
export const MOCKUP_MAX_SERVICES = 6;
export const MOCKUP_MAX_AREAS = 8;

/** How many areas to ASK the scraper for. Above the display cap so the picker can offer a choice. */
export const MOCKUP_SCRAPE_MAX_AREAS = 40;

export const MOCKUP_NICHES: Record<string, MockupNiche> = {
  locksmith: {
    key: "locksmith",
    label: "Locksmith",
    trade: "Locksmith",
    template: "locksmith.html",
    matches: ["locksmith", "locksmiths", "auto locksmith", "auto locksmiths", "car locksmith"],
  },
  plumber: {
    key: "plumber",
    label: "Plumber",
    trade: "Plumber",
    template: "plumber.html",
    matches: ["plumber", "plumbers", "plumbing", "plummer", "heating engineer", "plumber and heating"],
  },
};

/** The niche used when a lead's trade is not one we have a template for. */
export const NO_NICHE = null;

/**
 * Resolve a lead's `search_keyword` to a niche key, or null.
 *
 * ⛔ NULL IS A REAL ANSWER AND MUST NOT BECOME A DEFAULT. The deleted registry's
 * `normaliseTemplate()` coerced every unknown value to "barber" — right for a product with one
 * vertical, wrong here: silently building a LOCKSMITH mockup for an accountant would put the wrong
 * trade, the wrong services and the wrong copy in front of a prospect. No template, no mockup.
 * (The absent-value law, on the field that decides what a stranger is shown about themselves.)
 *
 * Matching is on the WHOLE normalised string, never a substring: "locksmith" as a substring of a
 * longer keyword is not evidence, and CLAUDE.md §4 records substring matching costing real time
 * twice ("bing" in plum*bing*, "acca" in M*acca*-Gas).
 */
export function nicheForKeyword(searchKeyword: unknown): string | null {
  if (typeof searchKeyword !== "string") return NO_NICHE;
  const k = searchKeyword.trim().toLowerCase().replace(/\s+/g, " ");
  if (!k) return NO_NICHE;
  for (const n of Object.values(MOCKUP_NICHES)) {
    if (n.matches.includes(k)) return n.key;
  }
  return NO_NICHE;
}

/** Full definition for a stored key, or null. Never invents a fallback (see nicheForKeyword). */
export function nicheByKey(key: unknown): MockupNiche | null {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(MOCKUP_NICHES, key)
    ? MOCKUP_NICHES[key]
    : null;
}

/** Ordered list for menus. */
export const MOCKUP_NICHE_LIST: MockupNiche[] = Object.values(MOCKUP_NICHES);
