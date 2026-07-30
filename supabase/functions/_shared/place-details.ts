/* ============================================================
   GOOGLE PLACE DETAILS — the raw call and the pure parsing, with NO dependencies.

   Deliberately dependency-free so `google-place-details` can import it without dragging in the
   enrichment runner (cost caps, DB writes) that `place-town.ts` needs. place-town.ts owns the
   caching/cost orchestration; this file owns the field masks, the fetch and the extraction. One
   definition of each, because a duplicated field list is how `address` came to be missing in the
   first place: search-leads' mask was slimmed and google-place-details' comment still claimed the
   search covered it.

   ── THE BILLING RULE, verified against Google's own docs 2026-07-30 ──────────────────────────
   A Place Details request is billed ONCE, at the HIGHEST SKU tier any requested field belongs to.
   Google: "You are then billed at the highest SKU applicable to your request. That means if you
   select fields in both the Essentials and the Pro SKUs, you are billed based on the Pro SKU."

   Consequences, and both directions matter:
     • Adding an Essentials field to a request that already asks for an Enterprise field is FREE.
     • Adding ONE Enterprise field to an Essentials-only request re-prices the ENTIRE call.

   So the two masks below are kept apart on purpose. Mixing them is not a tidy-up.
   ============================================================ */

/** Essentials tier. Cheapest fields that carry an address. */
export const ESSENTIALS_FIELDS = ["formattedAddress", "addressComponents", "location"] as const;

/** Enterprise tier. Phone, website, rating and review count all sit HERE, together — which is why
 *  rating + userRatingCount are free to add to a call that already asks for a phone number. */
export const ENTERPRISE_FIELDS = [
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
] as const;

export interface AddressComponent {
  longText?: string;
  types?: string[];
}

export interface PlaceDetails {
  formattedAddress: string | null;
  addressComponents: AddressComponent[];
  location: { latitude?: number; longitude?: number } | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
}

/**
 * One Place Details call, for exactly the fields asked for.
 *
 * Returns null on any non-OK response — the caller decides whether that is fatal. Fields not in
 * `fields` come back null; that is indistinguishable from "Google has no value", which is fine
 * because every caller knows what it asked for.
 */
export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
  fields: readonly string[],
): Promise<PlaceDetails | null> {
  if (!placeId || !apiKey || fields.length === 0) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fields.join(","),
    },
  });
  if (!res.ok) {
    console.warn(`[place-details] ${res.status} for ${placeId}`);
    return null;
  }
  // deno-lint-ignore no-explicit-any
  const d = await res.json() as any;
  const rating = typeof d.rating === "number" ? d.rating : null;
  const reviewCount = typeof d.userRatingCount === "number" ? d.userRatingCount : null;
  return {
    formattedAddress: typeof d.formattedAddress === "string" ? d.formattedAddress : null,
    addressComponents: Array.isArray(d.addressComponents) ? d.addressComponents : [],
    location: d.location ?? null,
    phone: d.internationalPhoneNumber || d.nationalPhoneNumber || null,
    website: typeof d.websiteUri === "string" ? d.websiteUri : null,
    rating,
    reviewCount,
  };
}

/** REUSED AS-IS from generate-barber-site:307-310 — UK postal_town, then locality, then
 *  administrative_area_level_2. The verified town from Google's structured components, never
 *  guessed and never the town that was searched. */
export function townFromComponents(comps: AddressComponent[]): string | null {
  const pick = (t: string) => comps.find((c) => Array.isArray(c.types) && c.types.includes(t))?.longText;
  const town = pick("postal_town") || pick("locality") || pick("administrative_area_level_2");
  return typeof town === "string" && town.trim() ? town.trim() : null;
}

/* ── WHY derived_town IS NULL, when it is ────────────────────────────────────────────────────────
   `town_fetched_at` alone only separates "never ran" from "ran". It cannot separate "Google
   answered and this place genuinely has no postal_town" from "the call failed" — and that
   distinction decides whether re-fetching would help or just re-pay to be told the same thing.
   A null town with no note means the town WAS found (see TOWN_FOUND).                            */
export type TownFetchNote =
  | null                          // a town was found
  | "no_place_id"                 // nothing to look up, and nothing will change that
  | "no_api_key"                  // our misconfiguration
  | "cost_cap_reached"            // we chose not to spend
  | "place_details_unavailable"   // Google errored or returned nothing
  | "no_town_in_address";         // Google answered; there is no postal_town/locality/admin_2

export const TOWN_FOUND: TownFetchNote = null;

/** Notes where re-asking Google would change nothing — either the answer is settled or there is
 *  nothing to ask about. A fresh `town_fetched_at` carrying one of these counts as a cache HIT.
 *  Everything else is transient (our key, our cap, their outage) and SHOULD be retried. */
export const SETTLED_TOWN_NOTES: ReadonlySet<string> = new Set<string>([
  "no_place_id",
  "no_town_in_address",
]);
