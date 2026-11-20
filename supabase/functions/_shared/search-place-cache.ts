/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SEARCH FILLS THE PHONE CACHE (2026-11-20, v1-fast-bulk-add) — pure helpers + one best-effort write.

   Find Leads' text search already bills at Text Search ENTERPRISE (its mask asks for websiteUri). Phone, rating and
   review count are Enterprise fields and addressComponents is a Pro field, so asking the SAME search for them costs
   nothing extra (Google bills a request once, at the highest tier any field touches — see place-details.ts).
   Before this, every lead added from Find Leads paid a separate Place Details (Enterprise) call, $0.020 each, just to
   learn its phone, and the add was slowed by the per-minute guard on those calls.

   Now search-leads writes what it got into phone_cache (the SAME row, shape v2, that google-place-details writes), so
   the add's lookup is a cache hit: no Google call, no cost, a fast answer.
   ⛔ The phone is NEVER put in the search response or the search_cache blob. A salesperson still gets a number only
      through google-place-details, which keeps its ownership check (mayLookUpBusiness) and its guard.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { townFromComponents, type AddressComponent } from "./place-details.ts";

/** Added to every Find Leads text-search mask. Same tier as websiteUri (Enterprise) or below — free. */
export const SEARCH_DETAIL_FIELDS =
  "places.nationalPhoneNumber,places.internationalPhoneNumber,places.addressComponents,places.rating,places.userRatingCount";

/** Must match google-place-details' CACHE_VERSION: a v2 row carries address, rating, reviews and town. */
export const PHONE_CACHE_VERSION = 2;

export interface SearchPlaceDetails {
  phone: string | null;
  address: string | null;
  website: string | null;
  category: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  derivedTown: string | null;
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** What one Google text-search place says, for the phone cache. Pure. */
// deno-lint-ignore no-explicit-any
export function placeDetailsOf(place: any): SearchPlaceDetails {
  const comps: AddressComponent[] = Array.isArray(place?.addressComponents) ? place.addressComponents : [];
  return {
    phone: s(place?.internationalPhoneNumber) ?? s(place?.nationalPhoneNumber),
    address: s(place?.formattedAddress),
    website: s(place?.websiteUri),
    category: s(place?.primaryTypeDisplayName?.text),
    googleMapsUri: s(place?.googleMapsUri),
    rating: n(place?.rating),
    reviewCount: n(place?.userRatingCount),
    derivedTown: townFromComponents(comps),
  };
}

/** The phone_cache rows for a list of results that carry `_pd`. One row per place id. Pure. */
export function phoneCacheRowsOf(
  leads: readonly { id: string; _pd?: SearchPlaceDetails }[],
  nowIso: string,
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const l of leads) {
    const d = l._pd;
    if (!d || !l.id || seen.has(l.id)) continue;
    seen.add(l.id);
    out.push({
      place_id: l.id,
      phone: d.phone,
      address: d.address,
      category: d.category,
      google_maps_uri: d.googleMapsUri,
      website: d.website,
      rating: d.rating,
      review_count: d.reviewCount,
      derived_town: d.derivedTown,
      details_version: PHONE_CACHE_VERSION,
      created_at: nowIso,
    });
  }
  return out;
}

/** The results without the private `_pd` field — what the response and search_cache get. Pure. */
export function withoutPlaceDetails<T extends { _pd?: unknown }>(leads: readonly T[]): T[] {
  return leads.map((l) => {
    if (!("_pd" in l)) return l;
    const { _pd: _drop, ...rest } = l;
    return rest as T;
  });
}

/** Best-effort: never fails the search. Chunks of 200 rows. */
export async function storeSearchPlaceDetails(
  // deno-lint-ignore no-explicit-any
  service: any,
  leads: readonly { id: string; _pd?: SearchPlaceDetails }[],
): Promise<number> {
  const rows = phoneCacheRowsOf(leads, new Date().toISOString());
  let stored = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    try {
      const { error } = await service.from("phone_cache").upsert(part, { onConflict: "place_id" });
      if (error) { console.warn("[search-place-cache] store failed (non-blocking):", error.message); continue; }
      stored += part.length;
    } catch (e) {
      console.warn("[search-place-cache] store error (non-blocking):", e instanceof Error ? e.message : e);
    }
  }
  return stored;
}
