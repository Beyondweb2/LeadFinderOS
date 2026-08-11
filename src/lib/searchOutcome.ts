/* ════════════════════════════════════════════════════════════════════════════════════════════
   DID THAT SEARCH DO ANYTHING? — the line shown after a lead search finishes.

   ⛔ IT SAYS "FOUND", NEVER "ADDED", AND THE DIFFERENCE IS NOT PEDANTRY. A search writes NOTHING to
   the CRM: it returns businesses and the operator chooses which to add. A banner reading "12 leads
   added" after a click that added nothing would be the one thing this codebase keeps being caught
   by — a sentence that is more confident than the thing it describes. The count that answers "did
   this do something" honestly is: how many came back, how many are NEW to you, and how many you
   already hold.

   ⚠️ "already in your CRM" IS THE SAME TEST THE ROWS USE. The caller passes a count derived from
   getCrmState — google_maps_url OR business_name OR place_id, mirroring addLead's own dedupe — so
   the summary and the per-row buttons cannot disagree about what counts as a duplicate.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export type SearchOutcomeTone =
  /** Something new to work with. */
  | "new"
  /** Results came back, every one already in the CRM. */
  | "all_known"
  /** The search ran and found nothing. */
  | "empty";

export interface SearchOutcome {
  found: number;
  alreadyInCrm: number;
  /** found − alreadyInCrm, floored at 0. */
  newCount: number;
  tone: SearchOutcomeTone;
  /** The sentence to render. Complete, so the page never assembles copy of its own. */
  headline: string;
}

/**
 * Summarise a finished lead search.
 *
 * ⛔ EVERY BRANCH IS A POSITIVE TEST ON A COUNT, and the absent case is explicit: a non-finite or
 * negative input is clamped rather than allowed to produce "NaN leads found" or a negative "new".
 * The page renders this string directly, so a bad number here is a bad number on screen.
 */
export function summariseSearchResults(
  foundRaw: number,
  alreadyInCrmRaw: number,
  where?: { trade?: string | null; town?: string | null },
): SearchOutcome {
  const clamp = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const found = clamp(foundRaw);
  /* Cannot exceed what came back: a stale CRM list could otherwise make `newCount` negative, which
     would print as "-2 new". Bounded by `found` rather than trusted. */
  const alreadyInCrm = Math.min(clamp(alreadyInCrmRaw), found);
  const newCount = found - alreadyInCrm;

  const trade = (where?.trade ?? "").trim();
  const town = (where?.town ?? "").trim();
  /* Named only when BOTH are known — "locksmiths in" with no town reads like a bug, and this line
     exists to make the operator confident about what just happened. */
  const forWhat = trade && town ? ` for ${trade} in ${town}` : "";

  if (found === 0) {
    return {
      found, alreadyInCrm, newCount, tone: "empty",
      headline: `Nothing found${forWhat}. Try a broader trade, or check the town spelling.`,
    };
  }
  if (newCount === 0) {
    /* Paul's own words for this state. It is the most useful of the three: it means the town is
       already pulled, and the click DID work. */
    return {
      found, alreadyInCrm, newCount, tone: "all_known",
      headline: `${found} found${forWhat} — already added, 0 new.`,
    };
  }
  const knownPart = alreadyInCrm > 0
    ? `, ${alreadyInCrm} already in your CRM`
    : "";
  return {
    found, alreadyInCrm, newCount, tone: "new",
    headline: `${found} found${forWhat}: ${newCount} new to add${knownPart}.`,
  };
}
