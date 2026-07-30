import { runEnrichSource } from "./enrichment/runner.ts";
import { SOURCES } from "./enrichment/sources.ts";

/* ============================================================
   THE REAL TOWN, from Google Place Details.

   THE BUG THIS EXISTS TO FIX. Lead search has a radius, so a business found by a "Wisbech" search may
   trade 25 miles away. Audits were asking "plumber in <the town I SEARCHED>", so a Huntingdon
   locksmith was told AI does not know he exists — he is top of his own patch and said so. 37 reports
   went out with that fault. The searched town is a property of MY QUERY; it is not where the business
   is, and only Google's structured address can say where that is.

   place_id is populated on 758 of 758 leads. address on 0. So the data to fix this has always been
   available and was simply never fetched.

   getPlaceDetails was deleted in a8fd7003 and is restored here, trimmed to the three fields this
   needs. Deliberately NOT rating/userRatingCount: those move the call to a dearer Google SKU and the
   rates are what matter first.
   ============================================================ */

/** 30 days. A business does not move often, and re-fetching on every audit would pay Google to be
 *  told the same thing. Keyed on the lead's place_id via town_fetched_at. */
export const TOWN_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

export interface PlaceDetailsLite {
  formattedAddress: string | null;
  addressComponents: Array<{ longText?: string; types?: string[] }>;
  location: { latitude?: number; longitude?: number } | null;
}

/** RESTORED from a8fd7003^:supabase/functions/search-leads/index.ts, trimmed to three fields.
 *  Places API v1, same endpoint shape generate-barber-site already calls successfully. */
export async function getPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetailsLite | null> {
  if (!placeId || !apiKey) return null;
  const fieldMask = ["formattedAddress", "addressComponents", "location"].join(",");
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
  });
  if (!res.ok) {
    console.warn(`[place-town] place details ${res.status} for ${placeId}`);
    return null;
  }
  // deno-lint-ignore no-explicit-any
  const d = await res.json() as any;
  return {
    formattedAddress: typeof d.formattedAddress === "string" ? d.formattedAddress : null,
    addressComponents: Array.isArray(d.addressComponents) ? d.addressComponents : [],
    location: d.location ?? null,
  };
}

/** REUSED AS-IS from generate-barber-site:307-310 — UK postal_town, then locality, then
 *  administrative_area_level_2. Verified town from Google's structured components, never guessed. */
export function townFromComponents(comps: Array<{ longText?: string; types?: string[] }>): string | null {
  const pick = (t: string) => comps.find((c) => Array.isArray(c.types) && c.types.includes(t))?.longText;
  const town = pick("postal_town") || pick("locality") || pick("administrative_area_level_2");
  return typeof town === "string" && town.trim() ? town.trim() : null;
}

export interface DerivedTown {
  /** The town the business is actually in, or null when it could not be established. */
  town: string | null;
  /** Google's formatted address, stored so a directory signup has something to paste. */
  address: string | null;
  /** How this was obtained — surfaced on the audit so a wrong town is diagnosable later. */
  source: "cache" | "fetched" | "unavailable";
  /** Set when the fetch was attempted and failed. The audit still proceeds — see the caller. */
  error: string | null;
}

/**
 * Resolve the real town for a lead, caching for 30 days.
 *
 * NEVER THROWS. An audit must not be blocked by enrichment: a failure returns
 * `{ town: null, source: 'unavailable' }` and the caller falls back to the searched town with a flag.
 * The wrong town is a bad audit; no audit at all is worse.
 */
// deno-lint-ignore no-explicit-any
export async function resolveDerivedTown(service: any, leadId: string | null): Promise<DerivedTown> {
  const none: DerivedTown = { town: null, address: null, source: "unavailable", error: null };
  if (!leadId) return none;
  try {
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, user_id, place_id, address, derived_town, town_fetched_at")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return none;

    // Cache hit: fetched recently AND we actually got a town last time.
    const fetchedAt = lead.town_fetched_at ? Date.parse(String(lead.town_fetched_at)) : 0;
    if (lead.derived_town && fetchedAt && Date.now() - fetchedAt < TOWN_CACHE_MS) {
      return { town: String(lead.derived_town), address: lead.address ?? null, source: "cache", error: null };
    }

    const placeId = typeof lead.place_id === "string" ? lead.place_id : "";
    if (!placeId) return { ...none, error: "no place_id on the lead" };
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
    if (!apiKey) return { ...none, error: "GOOGLE_MAPS_API_KEY not set" };

    /* Capped and logged like every other paid source. NOTE on the correction mechanism: Google returns
       no per-call price, so estimated IS actual here and there is nothing to reconcile — unlike the
       Apify actors, where the bill only exists once the run finishes. Logging it through the same
       runner is what keeps it inside the rolling-24h ceiling. */
    const est = SOURCES.place_details.estCostUsd;
    const outcome = await runEnrichSource<PlaceDetailsLite | null>({
      service,
      userId: lead.user_id ?? null,
      type: "place_details",
      cacheKey: `place_details:${placeId}`,
      estCostUsd: est,
      run: async () => {
        const details = await getPlaceDetails(placeId, apiKey);
        return { result: details, costUsd: details ? est : 0 };
      },
      isEmpty: (r) => !r,
    });
    if (outcome.capReached) return { ...none, error: "daily cost cap reached" };
    const details = outcome.result;
    if (!details) return { ...none, error: "place details unavailable" };

    const town = townFromComponents(details.addressComponents);
    const address = details.formattedAddress;

    /* Persist so the next audit is free. town_fetched_at is stamped even when no town came back, so a
       place that genuinely has no postal_town is not re-fetched every single audit. */
    await service.from("outreach_leads").update({
      address: address ?? lead.address ?? null,
      derived_town: town,
      town_fetched_at: new Date().toISOString(),
    }).eq("id", leadId);

    return { town, address, source: "fetched", error: town ? null : "no town in address components" };
  } catch (e) {
    return { ...none, error: e instanceof Error ? e.message : String(e) };
  }
}

/** THE PRECEDENCE, in one place so every caller agrees.
 *  confirmed_location (a human said it) || derived_town (Google's address) || search_location (my query).
 *  Returns the town AND why, because a wrong town must be diagnosable after the fact. */
export function pickAuditTown(args: {
  confirmedLocation?: string | null;
  derivedTown?: string | null;
  searchLocation?: string | null;
}): { town: string; source: "confirmed" | "derived" | "search" | "none" } {
  const c = (args.confirmedLocation ?? "").trim();
  if (c) return { town: c, source: "confirmed" };
  const d = (args.derivedTown ?? "").trim();
  if (d) return { town: d, source: "derived" };
  const s = (args.searchLocation ?? "").trim();
  if (s) return { town: s, source: "search" };
  return { town: "", source: "none" };
}
