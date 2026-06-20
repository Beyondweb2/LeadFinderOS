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

export type SourceKey = "maps" | "contact_scraper";
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
    estCostUsd: 0.02, // deep enrich (reviews+images+contacts) for one place
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
};

/* ─────────────────────────── maps source: discovery ─────────────────────── */

export interface MapsDiscoverInput {
  keyword: string;
  location: string;
  maxPlaces: number;
  token: string;
  timeoutMs?: number;
}

/** Cheap SEARCH: base list (detail page for phone/website/rating, NO reviews/
 *  images/contacts add-ons). Returns normalised places + the run duration. */
export async function mapsDiscover(
  input: MapsDiscoverInput,
): Promise<{ places: NormalizedPlace[]; ms: number }> {
  const body = {
    searchStringsArray: [input.keyword],
    locationQuery: input.location,
    maxCrawledPlacesPerSearch: input.maxPlaces,
    language: "en",
    // Search-page-only: NO per-place detail visits → fast + cheap. Returns the
    // fields discovery needs (title, website, url, address). Phone/rating/reviews/
    // images all come later in the deep-enrich (mapsEnrich) on pick/generate.
    scrapePlaceDetailPage: false,
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
}

/** Deep ENRICH for ONE picked place: reviews + images + contacts. */
export async function mapsEnrich(
  input: MapsEnrichInput,
): Promise<{ place: NormalizedPlace | null; ms: number }> {
  // startUrls (the maps place URL) is the most reliable way to pull a single
  // place WITH review/image add-ons; fall back to placeIds if no URL.
  const target = input.googleMapsUrl
    ? { startUrls: [{ url: input.googleMapsUrl }] }
    : { placeIds: [input.placeId] };
  const body = {
    ...target,
    language: "en",
    maxReviews: input.maxReviews ?? 8,
    reviewsSort: "newest",
    maxImages: input.maxImages ?? 10,
    scrapeContacts: true,
    scrapeSocialMediaProfiles: { facebooks: true, instagrams: true },
  };
  const { items, ms } = await runApifyActor(MAPS_ACTOR_ID, body, {
    token: input.token,
    timeoutMs: input.timeoutMs,
  });
  const place = items.length ? mapCompassPlace(items[0]) : null;
  return { place, ms };
}
