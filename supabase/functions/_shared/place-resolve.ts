/* ════════════════════════════════════════════════════════════════════════════════════════════
   GUARDED PLACE-ID RESOLUTION — one Places Text Search, three guards, never a guess.

   ⛔ EXTRACTED VERBATIM from backfill-lead-towns 2026-08-19 so the free-check funnel could reuse
   it instead of carrying a second copy. NOTHING about the behaviour changed in the move: the
   guards, the cost constant, the cap, the cache key and the transient-vs-refusal distinction are
   byte-for-byte what that function shipped with. Two callers now — backfill-lead-towns (CSV rows
   with no place_id) and free-check lead creation (a stranger typing their business name into the
   site) — and BOTH must be redeployed when this file changes (CLAUDE.md §4's shared-file trap).

   ⛔ THE TOP RESULT IS NEVER TAKEN ON RANK. Rank carries no identity; a name+address search can
   return a similar-named different business, and a wrong town is worse than none.
     1. NAME GUARD  — nameMatches (the guarantee-grade matcher, tried both ways so
                      "Timpson" ↔ "Timpson Ltd" passes whichever side is fuller). No scores.
     2. UNIQUENESS  — exactly ONE distinct place may pass; two survivors is ambiguity, and
                      ambiguity refuses.
     3. TOWN-HINT   — the caller's location text must share a significant whole token with the
                      candidate's formattedAddress (never substrings — the plum-BING trap). No
                      location text refuses outright: a nationwide name-only match is exactly the
                      wrong-business trap.
   The residual false match that survives all three is a same-name business in the same hinted
   town — whose town is still the right town, the quantity being verified.

   ⛔ PRICED AND TIER-NAMED (§4's constants rule): Text Search **Pro** — the mask requests
   places.id, places.displayName, places.formattedAddress, and displayName/formattedAddress are
   Pro-tier fields, so the request bills once at Pro, $32/1,000 = $0.032. From Google's SKU table,
   not yet confirmed against a billed row. The IDs-only mask would be free but returns no name, and
   a resolver that cannot check the name is the blind-top-result this exists to prevent.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { runEnrichSource } from "./enrichment/runner.ts";
import { nameMatches, normalizeForMatch } from "./enrichment/ai-search.ts";

export const TEXT_SEARCH_PRO_USD = 0.032;
/** This source's own ceiling, mirroring PLACE_DETAILS_CAP_USD's reasoning in place-town.ts: judged
 *  against its own spend, not the day's unrelated audit spend. ~60 guarded lookups a day. */
export const TEXT_SEARCH_CAP_USD = 2;

export interface PlaceCandidate { id: string; name: string; address: string }

/** Significant tokens for the town-hint guard: alphabetic, 4+ chars — street numbers and short
 *  connectives cannot place a business. */
export function significantTokens(s: string): string[] {
  return normalizeForMatch(s).split(/\s+/).filter((t) => t.length >= 4 && /^[a-z]+$/.test(t));
}

/** The three-guard match. Returns a place id or the refusal reason — never a guess. */
export function guardedPlaceMatch(
  candidates: PlaceCandidate[],
  businessName: string,
  hint: string,
): { placeId: string } | { refused: string } {
  const hintTokens = new Set(significantTokens(hint));
  if (hintTokens.size === 0) return { refused: "no location text on the row to anchor a match" };
  if (candidates.length === 0) return { refused: "Google returned no result for the name and location" };
  const ctx = { town: hint };
  const passers = candidates.filter((c) => {
    const nameOk = nameMatches(c.name, businessName, ctx) || nameMatches(businessName, c.name, ctx);
    if (!nameOk) return false;
    const addr = new Set(significantTokens(c.address));
    return [...hintTokens].some((t) => addr.has(t));
  });
  const distinct = [...new Set(passers.map((c) => c.id))];
  if (distinct.length === 0) return { refused: `no result matched both the business name and its location (${candidates.length} candidate${candidates.length === 1 ? "" : "s"} rejected)` };
  if (distinct.length > 1) return { refused: `ambiguous: ${distinct.length} different places match the name and location` };
  return { placeId: distinct[0] };
}

/** One Text Search (New) call, guarded above. Wrapped in runEnrichSource so it is capped and
 *  logged like every other paid source. */
export async function resolvePlaceId(
  // deno-lint-ignore no-explicit-any
  service: any,
  userId: string,
  businessName: string,
  hint: string,
  country: string | null,
  apiKey: string,
): Promise<{ placeId: string | null; refused: string | null; capped: boolean; spent: boolean }> {
  const query = `${businessName}, ${hint}`;
  const outcome = await runEnrichSource<PlaceCandidate[] | null>({
    service,
    userId,
    type: "place_search",
    cacheKey: `place_search:${normalizeForMatch(query)}`,
    estCostUsd: TEXT_SEARCH_PRO_USD,
    capUsd: TEXT_SEARCH_CAP_USD,
    run: async () => {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
        },
        body: JSON.stringify({
          textQuery: query,
          // GB unless the caller says otherwise — the same default the lead rows carry.
          regionCode: (country ?? "UK") === "UK" ? "GB" : String(country ?? "GB"),
          maxResultCount: 5,
        }),
      });
      if (!res.ok) {
        console.warn(`[place-resolve] place search ${res.status} for "${query}"`);
        return { result: null, costUsd: 0 };
      }
      // deno-lint-ignore no-explicit-any
      const d = await res.json() as any;
      const places: PlaceCandidate[] = (Array.isArray(d.places) ? d.places : []).map((p: Record<string, unknown>) => ({
        id: String(p.id ?? ""),
        name: String((p.displayName as { text?: string } | undefined)?.text ?? ""),
        address: String(p.formattedAddress ?? ""),
      })).filter((p: PlaceCandidate) => p.id);
      return { result: places, costUsd: TEXT_SEARCH_PRO_USD };
    },
    isEmpty: (r) => !r || r.length === 0,
    /* A null result is a TRANSIENT Google failure — never cache it, or a 24h empty-cache entry
       would make the retry return the same nothing for free and look permanent. */
    noCacheWrite: (r) => r === null,
  });
  if (outcome.capReached) return { placeId: null, refused: null, capped: true, spent: false };
  if (outcome.result === null || outcome.result === undefined) {
    // TRANSIENT (Google errored) — no refusal is stamped; the caller stays unchecked and retryable.
    return { placeId: null, refused: null, capped: false, spent: false };
  }
  const verdict = guardedPlaceMatch(outcome.result, businessName, hint);
  return "placeId" in verdict
    ? { placeId: verdict.placeId, refused: null, capped: false, spent: !outcome.cached }
    : { placeId: null, refused: verdict.refused, capped: false, spent: !outcome.cached };
}
