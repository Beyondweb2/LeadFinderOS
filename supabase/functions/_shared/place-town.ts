import { runEnrichSource } from "./enrichment/runner.ts";
import { SOURCES } from "./enrichment/sources.ts";
import {
  ESSENTIALS_FIELDS,
  fetchPlaceDetails,
  type PlaceDetails,
  SETTLED_TOWN_NOTES,
  TOWN_FOUND,
  type TownFetchNote,
  townFromComponents,
} from "./place-details.ts";

export { townFromComponents };
export type { TownFetchNote };

/* ============================================================
   THE REAL TOWN, from Google Place Details.

   THE BUG THIS EXISTS TO FIX. Lead search has a radius, so a business found by a "Wisbech" search may
   trade 25 miles away. Audits were asking "plumber in <the town I SEARCHED>", so a Huntingdon
   locksmith was told AI does not know he exists — he is top of his own patch and said so. 37 reports
   went out with that fault. The searched town is a property of MY QUERY; it is not where the business
   is, and only Google's structured address can say where that is.

   place_id is populated on 758 of 758 leads. address on 0. So the data to fix this has always been
   available and was simply never fetched.

   The call and the town extraction now live in ./place-details.ts, dependency-free, so the
   lead-creation path (`google-place-details`) can share them without importing the cost runner.
   This file keeps the caching, the cost accounting and the precedence.

   THIS PATH STAYS ON THE ESSENTIALS MASK. rating/userRatingCount are Enterprise-tier fields, so
   adding them HERE would re-price this whole call — see the billing rule in place-details.ts.
   Lead creation gets them free because its call already asks Google for a phone number.

   PREFERRED ORDER OF EVENTS: lead creation fetches address + components + rating + reviews in the
   phone call it already makes, and writes derived_town + town_fetched_at then. By the time an audit
   runs, resolveDerivedTown finds a fresh stamp and calls Google ZERO times. This function is now the
   backstop for leads that predate that, or whose creation-time fetch failed.
   ============================================================ */

/** 30 days. A business does not move often, and re-fetching on every audit would pay Google to be
 *  told the same thing. Keyed on the lead's place_id via town_fetched_at. */
export const TOWN_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

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
 * Stamp the outcome of a town-fetch ATTEMPT on the lead, whatever the outcome was.
 *
 * `town_fetched_at` is written on every completed attempt — that is what separates "never ran" from
 * "ran and found nothing", and it is the only reason the missing-enrichment bug was diagnosable at
 * all. `town_fetch_note` then separates the reasons, so a later reader knows whether re-asking
 * Google would help.
 *
 * MIGRATION-TOLERANT, and not theoretically: `town_fetch_note` is added by SQL Paul applies BY HAND,
 * and PostgREST rejects the WHOLE update for one unknown column. A failed stamp must never cost us
 * the town itself, so this retries without the note. Same shape as the derived_town tolerance in
 * audit-baseline.ts and AiAudit.tsx.
 */
// deno-lint-ignore no-explicit-any
async function stampTownFetch(service: any, leadId: string, patch: {
  address?: string | null;
  derived_town: string | null;
  town_fetch_note: TownFetchNote;
  lat?: number | null;
  lng?: number | null;
}): Promise<void> {
  const base: Record<string, unknown> = {
    derived_town: patch.derived_town,
    town_fetched_at: new Date().toISOString(),
  };
  if (patch.address !== undefined) base.address = patch.address;

  /* ⛔ COORDINATES, WHICH WE HAVE ALWAYS BEEN PAYING FOR AND THROWING AWAY. ESSENTIALS_FIELDS asks
     Google for "location" on every one of these calls; nothing stored it. They are what makes
     "is this business inside the town its audit asked about?" answerable — derived_town cannot
     answer it, because Wilson's postal_town IS Cambridge while he sits outside the built-up area.
     ⚠️ Only written when Google actually returned a pair. A missing coordinate stays NULL, never
     0/0 — which is a real place in the Gulf of Guinea and would read as 5,000 km from everywhere. */
  const optional: Record<string, unknown> = { town_fetch_note: patch.town_fetch_note };
  if (typeof patch.lat === "number" && typeof patch.lng === "number"
      && Number.isFinite(patch.lat) && Number.isFinite(patch.lng)) {
    optional.lat = patch.lat;
    optional.lng = patch.lng;
  }

  /* MIGRATION-TOLERANT IN BOTH DIRECTIONS. town_fetch_note, lat and lng are all applied by hand in
     the SQL editor, and PostgREST rejects the WHOLE update for one unknown column — so a column
     that has not landed yet must never cost us the town itself. Retry with the base only. */
  const { error } = await service.from("outreach_leads")
    .update({ ...base, ...optional }).eq("id", leadId);
  if (error && /town_fetch_note|lat|lng|column/i.test(error.message ?? "")) {
    console.warn(`[place-town] optional column missing (${error.message}) — stamping without them`);
    await service.from("outreach_leads").update(base).eq("id", leadId);
  } else if (error) {
    console.warn(`[place-town] stamp failed for ${leadId}: ${error.message}`);
  }
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
    /* MIGRATION-TOLERANT read. town_fetch_note is applied BY HAND, and one unknown column fails the
       WHOLE select — which would make every audit re-fetch. Try with it, fall back without. */
    const LEAD_COLS = "id, user_id, place_id, address, derived_town, town_fetched_at";
    let lead = (await service.from("outreach_leads")
      .select(`${LEAD_COLS}, town_fetch_note`).eq("id", leadId).maybeSingle()).data;
    if (!lead) {
      lead = (await service.from("outreach_leads")
        .select(LEAD_COLS).eq("id", leadId).maybeSingle()).data;
    }
    if (!lead) return none;

    /* CACHE HIT. This used to require `derived_town` to be truthy, which quietly defeated the stamp:
       a place with no postal_town was stamped and then re-fetched on EVERY subsequent audit, paying
       Google each time to be told the same nothing. The comment below the fetch claimed otherwise.
       A fresh stamp now counts as a hit when the town was found OR when the note says re-asking
       cannot help. Transient notes (our cap, our key, their outage) still fall through and retry. */
    const fetchedAt = lead.town_fetched_at ? Date.parse(String(lead.town_fetched_at)) : 0;
    const fresh = !!fetchedAt && Date.now() - fetchedAt < TOWN_CACHE_MS;
    const settled = SETTLED_TOWN_NOTES.has(String(lead.town_fetch_note ?? ""));
    if (fresh && (lead.derived_town || settled)) {
      return {
        town: lead.derived_town ? String(lead.derived_town) : null,
        address: lead.address ?? null,
        source: "cache",
        error: lead.derived_town ? null : String(lead.town_fetch_note ?? "no town for this place"),
      };
    }

    const placeId = typeof lead.place_id === "string" ? lead.place_id : "";
    if (!placeId) {
      // Permanent for this lead: stamp it so every future audit stops asking.
      await stampTownFetch(service, leadId, { derived_town: null, town_fetch_note: "no_place_id" });
      return { ...none, error: "no place_id on the lead" };
    }
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
    if (!apiKey) {
      // OUR misconfiguration and fixable, so this stamp is deliberately retried next time.
      await stampTownFetch(service, leadId, { derived_town: null, town_fetch_note: "no_api_key" });
      return { ...none, error: "GOOGLE_MAPS_API_KEY not set" };
    }

    /* Capped and logged like every other paid source. NOTE on the correction mechanism: Google returns
       no per-call price, so estimated IS actual here and there is nothing to reconcile — unlike the
       Apify actors, where the bill only exists once the run finishes. Logging it through the same
       runner is what keeps it inside the rolling-24h ceiling. */
    const est = SOURCES.place_details.estCostUsd;
    const outcome = await runEnrichSource<PlaceDetails | null>({
      service,
      userId: lead.user_id ?? null,
      type: "place_details",
      cacheKey: `place_details:${placeId}`,
      estCostUsd: est,
      run: async () => {
        const details = await fetchPlaceDetails(placeId, apiKey, ESSENTIALS_FIELDS);
        return { result: details, costUsd: details ? est : 0 };
      },
      isEmpty: (r) => !r,
    });
    /* Both of these are TRANSIENT — we chose not to spend, or Google was unreachable. They are
       stamped so `town_fetched_at` still answers "did this ever run", but their notes are absent
       from SETTLED_TOWN_NOTES, so the next audit retries rather than inheriting a bad answer. */
    if (outcome.capReached) {
      await stampTownFetch(service, leadId, { derived_town: null, town_fetch_note: "cost_cap_reached" });
      return { ...none, error: "daily cost cap reached" };
    }
    const details = outcome.result;
    if (!details) {
      await stampTownFetch(service, leadId, { derived_town: null, town_fetch_note: "place_details_unavailable" });
      return { ...none, error: "place details unavailable" };
    }

    const town = townFromComponents(details.addressComponents);
    const address = details.formattedAddress;

    // Persist so the next audit is free. A null town here is a REAL answer from Google, so its note
    // is settled and the 30-day stamp is honoured instead of re-paying for the same nothing.
    await stampTownFetch(service, leadId, {
      address: address ?? lead.address ?? null,
      derived_town: town,
      town_fetch_note: town ? TOWN_FOUND : "no_town_in_address",
      /* Free: the Essentials mask already asked for it. This is the ONLY thing that can answer
         whether a business sits outside the town its audit asked about — see the column comment
         in 20260809120000_lead_coordinates.sql. */
      lat: details.location?.latitude ?? null,
      lng: details.location?.longitude ?? null,
    });

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
