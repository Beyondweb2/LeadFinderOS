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
import { SEO_AUDIT_ACTOR } from "./seo-audit.ts";

export type SourceKey = "maps" | "contact_scraper" | "social_images" | "whatsapp" | "ai_search" | "seo_audit";
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
  ai_search: {
    key: "ai_search",
    stage: "enrich",
    actorId: AI_SEARCH_ACTOR,
    // Per QUESTION (one actor run covers ChatGPT+Perplexity+Gemini+AI Overview+organic).
    // REAL price (Apify dashboard, 2026-07-26): apify/google-search-scraper bills $2.50 per
    // 1,000 search result pages, so one question is $0.0025 — the previous $0.05 estimate was
    // 20x too high. Note this is the CEILING the cap pre-check uses; the actual per-run cost is
    // now recorded from the Apify run itself (ai_audit_runs.actor_cost_usd), so unit economics
    // come from measurement rather than from this number.
    estCostUsd: 0.0025,
    description: "AI Visibility Audit multi-engine SERP via apify/google-search-scraper",
    enabled: true,
  },
  seo_audit: {
    key: "seo_audit",
    stage: "enrich",
    actorId: SEO_AUDIT_ACTOR,
    // REAL price (Apify dashboard, 2026-07-26): the SEO scan actually in use is
    // smart-digital/complete-seo-audit-tool (see seo-scan-core.ts), billed $40 per 1,000 pages
    // at MAX_PAGES=3, so ~$0.12 per scan — the previous $0.02 was 6x too LOW. NOTE the actorId
    // below still names the legacy misceres actor used by the older seo-audit.ts path; the live
    // queue/run-seo-scan path uses SEO_SCAN_ACTOR.
    estCostUsd: 0.12,
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
  const { items, ms } = await runApifyActor(MAPS_ACTOR_ID, body, {
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
): Promise<{ place: NormalizedPlace | null; ms: number; raw?: unknown }> {
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
  const { items, ms } = await runApifyActor(MAPS_ACTOR_ID, body, {
    token: input.token,
    timeoutMs: input.timeoutMs,
    retry: input.retry,
  });
  const place = items.length ? mapCompassPlace(items[0]) : null;
  return { place, ms, raw: items[0] ?? null };
}
