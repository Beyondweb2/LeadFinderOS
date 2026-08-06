/**
 * Pluggable enrichment SOURCES.
 *
 * Each source adds fields to a lead. Maps is source #1 (discovery + deep enrich).
 * Future sources (contact_scraper/vdrmota for email, Checkatrade, LinkedIn,
 * verifier, B2B) register here with the SAME shape and slot into the runner
 * (./runner.ts) with no pipeline rewrite. Discovery vs enrich is the `stage`.
 *
 * Honesty rule: a source returns ONLY what it really found. Missing fields are
 * omitted/empty — never fabricated.
 */
import {
  MAPS_ACTOR_ID,
  mapCompassPlace,
  runApifyActor,
  type NormalizedPlace,
} from "./apify.ts";
import { AI_SEARCH_ACTOR } from "./ai-search.ts";

/** ⛔ MUST EQUAL src/lib/marketView.ts AUDIT_EST_USD_PER_QUESTION. Asserted by
 *  scripts/check-cross-repo-sync.mjs — these two DID drift (marketView was re-measured to 0.0104 and
 *  this was left at 0.0125), so the app quoted one price while the server reserved another.
 *  A named export rather than a bare property because the sync check can only read a named const —
 *  and a checker that cannot see a value cannot guard it. */
export const AI_SEARCH_USD_PER_QUESTION = 0.0104;

/** ⛔ MUST EQUAL src/lib/marketView.ts SEO_SCAN_USD. Same reasoning. */
export const SEO_SCAN_USD_PER_SCAN = 0.04;

export type SourceKey = "maps" | "contact_scraper" | "social_images" | "whatsapp" | "ai_search" | "seo_audit" | "place_details";
export type SourceStage = "discovery" | "enrich";

export interface EnrichmentSourceDef {
  key: SourceKey;
  stage: SourceStage | SourceStage[];
  /** Apify actor id (if the source is an Apify actor). */
  actorId?: string;
  /** Rough per-call cost for the cap pre-check + logging. */
  estCostUsd: number;
  description: string;
  /** Whether the source is wired in this build. */
  enabled: boolean;
}

/**
 * Source registry — the one place to add a vertical/source. contact_scraper is
 * declared (Phase 3) but not enabled yet, to show the shape.
 */
export const SOURCES: Record<SourceKey, EnrichmentSourceDef> = {
  maps: {
    key: "maps",
    stage: ["discovery", "enrich"],
    actorId: MAPS_ACTOR_ID,
    // REAL price (Apify dashboard, 2026-07-26): compass/crawler-google-places bills
    // $3.00 per 1,000 places.
    estCostUsd: 0.003,
    description: "Google Maps via compass/crawler-google-places",
    enabled: true,
  },
  contact_scraper: {
    key: "contact_scraper",
    stage: "enrich",
    actorId: "vdrmota~contact-info-scraper",
    estCostUsd: 0.0011, // ~$1.05 / 1k pages
    description: "Email/contact scraper from a business website (Phase 3)",
    enabled: false,
  },
  social_images: {
    key: "social_images",
    stage: "enrich",
    actorId: "apify~facebook-photos-scraper / apify~instagram-scraper",
    estCostUsd: 0.01, // per business (FB + IG photo pull); actor ids verify-on-test
    description: "Facebook/Instagram photo pool for the image picker (2A)",
    enabled: true,
  },
  whatsapp: {
    key: "whatsapp",
    stage: "enrich",
    estCostUsd: 0.005, // Twilio Lookup line_type_intelligence (HLR proxy)
    description: "HLR line-type (mobile/landline) via Twilio Lookup — WhatsApp-capable proxy",
    enabled: true,
  },
  place_details: {
    key: "place_details",
    stage: "enrich",
    actorId: "",  // NOT an Apify actor — a direct Google Places API v1 call.
    /* Google Places API v1, "Place Details (Essentials)" SKU: formattedAddress + addressComponents +
       location only, at $5 per 1,000 calls = $0.005 per call. Asking for rating/userRatingCount would
       re-price this call, which is why those fields are excluded HERE (see _shared/place-town.ts).
       ⚠️ CORRECTED 2026-07-30: this comment used to say rating moves it to "the Pro SKU at ~4x". Wrong
       tier — rating and userRatingCount are ENTERPRISE, alongside phone and websiteUri. The
       conclusion still holds for THIS call (Essentials → Enterprise is dearer), but the corollary is
       the useful part: the lead-creation call in `google-place-details` already asks for a phone, so
       it is ALREADY Enterprise and gets rating + reviews + address for nothing. Google bills one
       request once, at the highest tier it touches. Verified against Google's docs, not assumed.
       Cached 30 days per lead, so the steady-state cost is far below this: a lead is charged once and
       then re-used by every later audit of that business. */
    estCostUsd: 0.005,
    description: "Real town + address from Google Place Details, keyed on the lead's place_id",
    enabled: true,
  },
  ai_search: {
    key: "ai_search",
    stage: "enrich",
    actorId: AI_SEARCH_ACTOR,
    /* Per QUESTION — one queue row, one actor run, covering ChatGPT + Gemini + AI Overview +
       organic. NOT per audit run: process-ai-audit-queue charges this once per row in startRow(),
       and create-ai-audit multiplies it by the question count.

       MEASURED 2026-07-30 from ai_audit_runs.actor_cost_usd, which records what Apify actually
       billed: 81 runs, $3.4075 total, 295 questions across those runs = **$0.01155 per question**
       (mean $0.04207 per run, at a mean 3.64 questions per run; the runs are 70x3q, 5x5q, 6x10q).
       Window 26-30 July. Was stored as 0.0125, rounded UP on the reasoning that a spend ceiling
       should err high — SUPERSEDED 2026-08-06 by the re-measurement below, because the same figure
       is now the estimate the operator is SHOWN, and rounding a quoted price up is not failing safe,
       it is quoting wrong.

       WHY THIS MATTERED, AND WHY IT WAS NOT AN EMERGENCY. It was 0.0025, read off a price list ($2.50
       per 1,000 result pages) rather than a bill — but a question returns SEVERAL result pages, so the
       real cost is ~4.6x that.
       It did NOT corrupt the spend accounting, which is what it first looked like: recordCostCorrection
       (runner.ts) writes a second enrichment_usage row for `actual - estimated` once the actor
       finishes, so sum(cost_usd) already equalled real spend at any estimate. What a wrong estimate
       DID distort is the reservation in the cap pre-check and how many rows a tick is allowed to
       start — under-reserving by ~$0.01 per question. Worth fixing, not a fire.

       DO NOT re-derive this from a price list again. actor_cost_usd is the bill; use it. */
    /* ⛔ RE-MEASURED 2026-08-06: 60 completed runs / 206 questions of real actor_cost_usd give a
       mean of $0.01095 and a median of $0.01038. Was 0.0125, ~20% high.
       ⚠️ THIS MUST EQUAL src/lib/marketView.ts's AUDIT_EST_USD_PER_QUESTION. It briefly did not —
       marketView was corrected to 0.0104 and this was left, so the app quoted one price and the
       server reserved another. The sync check now asserts the pair. */
    estCostUsd: AI_SEARCH_USD_PER_QUESTION,
    description: "AI Visibility Audit multi-engine SERP via apify/google-search-scraper",
    enabled: true,
  },
  seo_audit: {
    key: "seo_audit",
    stage: "enrich",
    // The actor the live scan actually runs: seo-scan-core.ts's SEO_SCAN_ACTOR, used by the
    // queue and run-seo-scan. Named as a literal rather than imported to avoid pulling
    // seo-scan-core into every consumer of this module; seo-scan-core remains the source of
    // truth for which actor is CALLED (this field is descriptive — nothing invokes it).
    // The legacy misceres~seo-audit-tool in seo-audit.ts is no longer the scan in use.
    actorId: "smart-digital~complete-seo-audit-tool",
    /* ⛔ WAS 0.12, DERIVED FROM THE PRICE LIST ($40 per 1,000 pages x MAX_PAGES=3) AND NEVER
       CHECKED AGAINST SPEND. Measured 2026-08-06 across 218 enrichment_usage rows: the figures
       Apify actually reported are $0.02 (x65), $0.04 (x41), $0.08 (x4), $0.20 (x1). The 57 rows at
       exactly $0.12 are this constant echoed back by the fallback below when Apify returns no usage
       figure, so including them would let the constant validate itself.
       ⚠️ The two are indistinguishable in the data, so $0.04 is the top of the measured band rather
       than a precise figure. Chosen over the $0.031 mean because this value also reserves headroom
       in the cap pre-check, where under-reserving is the worse failure.
       Note the 2026-07-26 note claiming $0.02 was "6x too LOW" had it backwards: $0.02 is the
       single most common real value. See src/lib/marketView.ts SEO_SCAN_USD, which must match. */
    estCostUsd: SEO_SCAN_USD_PER_SCAN,
    description: "On-page SEO audit (misceres/seo-audit-tool), graded for the AI-audit report's SEO section",
    enabled: true,
  },
};

/* ─────────────────────────── maps source: discovery ─────────────────────── */

export interface MapsDiscoverInput {
  keyword: string;
  location: string;
  maxPlaces: number;
  token: string;
  timeoutMs?: number;
  /** Fact-dense mode (directory scrape): visit each place's detail page so rating +
   *  review COUNT come back reliably. Reviews text/images stay OFF to control cost.
   *  Default false → unchanged cheap search-page-only discovery for existing callers. */
  detail?: boolean;
}

/** Cheap SEARCH: base list (detail page for phone/website/rating, NO reviews/
 *  images/contacts add-ons). Returns normalised places + the run duration.
 *  With detail:true the per-place detail page IS visited (rating + reviewCount),
 *  still without review text / images / contacts. */
export async function mapsDiscover(
  input: MapsDiscoverInput,
): Promise<{ places: NormalizedPlace[]; ms: number }> {
  const body = {
    searchStringsArray: [input.keyword],
    locationQuery: input.location,
    maxCrawledPlacesPerSearch: input.maxPlaces,
    language: "en",
    // Search-page-only by default: NO per-place detail visits → fast + cheap. Returns the
    // fields discovery needs (title, website, url, address). Phone/rating/reviews/
    // images all come later in the deep-enrich (mapsEnrich) on pick/generate.
    // detail:true flips ONLY the detail-page visit on (rating + review count) — reviews text
    // and images stay off, so the cost bump is bounded. Existing callers omit `detail` → false.
    scrapePlaceDetailPage: input.detail === true,
    maxReviews: 0,
    maxImages: 0,
    scrapeContacts: false,
    skipClosedPlaces: true,
  };
  const { items, ms, usageTotalUsd } = await runApifyActor(MAPS_ACTOR_ID, body, {
    token: input.token,
    timeoutMs: input.timeoutMs,
  });
  const places = items.map(mapCompassPlace).filter((p) => p.placeId && p.title);
  return { places, ms };
}

/* ──────────────────────────── maps source: enrich ───────────────────────── */

export interface MapsEnrichInput {
  /** Prefer the Google Maps place URL (most reliable for add-ons); placeId is a fallback. */
  googleMapsUrl?: string;
  placeId?: string;
  token: string;
  maxReviews?: number;
  maxImages?: number;
  timeoutMs?: number;
  /** Photos-focused variant for the SYNCHRONOUS generate (9a): keep the detail-page
   *  scrape + images (+ whatever maxReviews the caller passes) but DROP the heavier
   *  add-ons (contacts / social profiles / web results) so the run finishes inside
   *  the tight timeout more often. 9b keeps them ON for FB/IG/contacts discovery. */
  photosOnly?: boolean;
  /** Opt-in bounded retry (passed straight to runApifyActor). Default: no retry. */
  retry?: { on429?: boolean; onAbort?: boolean };
}

/** Deep ENRICH for ONE picked place: reviews + images + contacts. */
export async function mapsEnrich(
  input: MapsEnrichInput,
): Promise<{ place: NormalizedPlace | null; ms: number; raw?: unknown; usageTotalUsd?: number | null }> {
  // startUrls (the maps place URL) is the most reliable way to pull a single
  // place WITH review/image add-ons; fall back to placeIds if no URL.
  const target = input.googleMapsUrl
    ? { startUrls: [{ url: input.googleMapsUrl }] }
    : { placeIds: [input.placeId] };
  // photosOnly (9a): lean add-ons — drop the HEAVY extras (contacts + web-results;
  // web-results triggers a separate web search) so the detail-page scrape stays fast.
  // KEEP scrapeSocialMediaProfiles: it reads FB/IG off the SAME detail page already
  // scraped for photos (no extra actor run / negligible runtime), and the 9a→9b
  // :maps_enrich cache dedup means these socials feed 9b's social-discovery cascade —
  // without them, newly-generated sites lose Facebook/Instagram. Full add-ons (9b
  // default) additionally surface contacts/web-results.
  const addOns = input.photosOnly
    ? { scrapeContacts: false, includeWebResults: false, scrapeSocialMediaProfiles: { facebooks: true, instagrams: true } }
    : {
        scrapeContacts: true,
        scrapeSocialMediaProfiles: { facebooks: true, instagrams: true },
        // Web-results discovery: surfaces FB/website that the bare listing lacks (e.g.
        // no-website businesses). $0 extra — billed under the "additional place
        // details" flat fee we already incur by scraping reviews+images. DEEP-ENRICH
        // ONLY (mapsDiscover keeps these off to stay fast/cheap).
        includeWebResults: true,
      };
  const body = {
    ...target,
    language: "en",
    maxReviews: input.maxReviews ?? 8,
    reviewsSort: "newest",
    maxImages: input.maxImages ?? 10,
    scrapePlaceDetailPage: true,
    ...addOns,
  };
  const { items, ms, usageTotalUsd } = await runApifyActor(MAPS_ACTOR_ID, body, {
    token: input.token,
    timeoutMs: input.timeoutMs,
    retry: input.retry,
  });
  const place = items.length ? mapCompassPlace(items[0]) : null;
  return { place, ms, raw: items[0] ?? null, usageTotalUsd };
}
