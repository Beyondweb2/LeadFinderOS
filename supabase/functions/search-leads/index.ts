import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.22.4';
import { mapsDiscover } from '../_shared/enrichment/sources.ts';
import { BOOKING_PLATFORM_DOMAINS, DIRECTORY_AND_RECORD_DOMAINS } from '../_shared/aggregators.ts';
import { qualifierInfo, resolveGeoBias } from '../_shared/geobias.ts';
import { generateCacheKey } from '../_shared/search-cache-key.ts';

// ═══════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const MAX_RESULTS = 50;
const BROAD_MAX = 120; // List-builder mode cap — return the full discovered pool.
const CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
const FREE_SEARCH_LIMIT = 5;
const MIN_NO_WEBSITE_TARGET = 1; // Only expand if ZERO no-website leads found
const MAX_EXPANSION_ATTEMPTS = 2; // Down from 6 — max 2 expansion centres
const MAX_TEXT_SEARCH_CALLS = 4; // Hard cap: total text search API calls per user search

// ─── Region tiling (Phase 1: fixed grid) ───────────────────────────────────
const REGION_MAX = 500;          // region-mode result cap (normal caps unchanged)
const MAX_TILES = 25;            // hard ceiling; grid auto-coarsens to fit
const TILE_CONCURRENCY = 6;      // bounded parallel tile fetches
const TILE_MAX_PAGES = 2;        // pages per tile → up to 40 results/tile
const DAILY_BUDGET_USD = 10;     // region downgrades to a single search above this
const DENSITY_KM: Record<'fine' | 'medium' | 'coarse', number> = { fine: 5, medium: 8, coarse: 12 };
const KM_PER_DEG_LAT = 110.574;  // mean km per degree latitude
const KM_PER_DEG_LNG = 111.320;  // km per degree longitude at the equator (× cos lat)

// ═══════════════════════════════════════════════
// INPUT VALIDATION
// ═══════════════════════════════════════════════
const SearchRequestSchema = z.object({
  keyword: z.string().min(1, 'Keyword is required').max(100).transform(s => s.trim()),
  location: z.string().min(1, 'Location is required').max(200).transform(s => s.trim()),
  radius: z.number().int().min(100).max(100000).default(5000),
  skipTrialCount: z.boolean().default(false),
  demo: z.boolean().default(false),
  guest: z.boolean().default(false),
  country: z.string().max(10).optional(),
  // List-builder "cast wide" mode: return the FULL discovered pool (with + without
  // websites), no no-website-first culling, no expansion. Default off = curated.
  broad: z.boolean().default(false),
  // Region tiling mode: tile the geocoded area's bbox into a grid of search
  // centres, merge + dedupe, no-website-first. Separate from broad/curated.
  region: z.boolean().default(false),
  density: z.enum(['fine', 'medium', 'coarse']).default('medium'),
  // "This town only": swap the SOFT locationBias circle for a HARD
  // locationRestriction rectangle built from the geocoded town's own bounds.
  // WHY IT IS A SEPARATE MODE AND NOT A SMALLER RADIUS: locationBias is a hint —
  // Google returns results outside the circle whatever the radius, which is how a
  // Huntingdon locksmith came back from a Wisbech search. Dragging the slider to
  // 1km narrows the hint; it does not exclude a neighbouring town.
  // Default false, so every existing call is byte-identical to before.
  townOnly: z.boolean().default(false),
  // Legacy fields — accepted but ignored
  minRating: z.number().optional(),
  minReviews: z.number().optional(),
  requirePhone: z.boolean().optional(),
  deepSearch: z.boolean().optional(),
});

// ═══════════════════════════════════════════════
// DIRECTORY BLACKLIST
// ═══════════════════════════════════════════════
const DIRECTORY_BLACKLIST = new Set([
  'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com',
  // Short/alt social domains (fb.com, fb.me, fb.watch, m.me, instagr.am) — a
  // listing whose only "website" is one of these is a social link, NOT an own
  // website, so the lead stays NO_WEBSITE and remains in no-website targeting.
  'fb.com', 'fb.me', 'fb.watch', 'm.me', 'instagr.am',
  'linkedin.com', 'youtube.com', 'pinterest.com', 'snapchat.com',
  'yell.com', 'thomsonlocal.com', 'yelp.com', 'yelp.co.uk', 'checkatrade.com',
  'mybuilder.com', 'bark.com', 'trustatrader.com', 'ratedpeople.com',
  'freeindex.co.uk', 'yell.co.uk', 'scoot.co.uk', 'hotfrog.co.uk',
  'tripadvisor.com', 'tripadvisor.co.uk', 'booking.com', 'airbnb.com',
  'justeat.co.uk', 'justeat.com', 'deliveroo.com', 'deliveroo.co.uk',
  'ubereats.com', 'opentable.com', 'opentable.co.uk',
  'google.com', 'maps.google.com', 'business.google.com',
  'apple.com', 'bing.com',
  // Extended directory / listing sites
  'trustpilot.com', 'nextdoor.com', 'nextdoor.co.uk',
  'cylex.co.uk', 'cylex-uk.co.uk', '192.com',
  'brownbook.net', 'hotfrog.com', 'bizify.co.uk',
  'misterwhat.co.uk', 'lacartes.com', 'findopen.co.uk',
  'panpages.com', 'indiamart.com', 'justdial.com',
  'sulekha.com', 'tradeindia.com',
  'gumtree.com', 'locanto.co.uk', 'fyple.co.uk',
  'citylocal.co.uk', 'thebestof.co.uk', 'locallife.co.uk',
]);

// Booking platforms (Fresha/Booksy/Treatwell/…) are NOT a business's own website
// either — a lead whose only "website" is one of these is NO_WEBSITE. Shared with
// enrich-business so both treat them identically.
for (const d of BOOKING_PLATFORM_DOMAINS) DIRECTORY_BLACKLIST.add(d);
// Directories / review sites / government records (Companies House etc.) — also not
// a business's own website. Shared with enrich-business via the same module.
for (const d of DIRECTORY_AND_RECORD_DOMAINS) DIRECTORY_BLACKLIST.add(d);

/* ⚠️ A FREE SUBDOMAIN IS STILL THEIR OWN WEBSITE. This list was written for the OLD product, where
   the thing being sold was a website and a business on a free Wix subdomain was a prospect for one.
   For AI visibility it is the wrong call: a `something.wixsite.com` business HAS a site AI can read,
   it is simply on Wix — which the onboarding's platform question and the migrate question now handle
   properly (see src/lib/serveGate.ts). Classifying them NO_WEBSITE pitched them the wrong way round
   and, downstream, told the audit not to scan a site that exists.
   Removed 2026-08-05: myshopify.com, wixsite.com, squarespace.com, wordpress.com.
   ⚠️ STILL HERE AND ARGUABLY THE SAME MISTAKE: webflow.io, godaddysites.com, weebly.com and carrd.co
   are also real sites on free subdomains. Left in deliberately — Paul named the four above and
   widening the list further changes what lead search returns, which is his call, not a tidy-up.
   blogspot.com and notion.site are genuinely marginal and belong here either way. */
const PLATFORM_PATTERNS = [
  /\.webflow\.io$/i, /\.blogspot\.com$/i,
  /\.godaddysites\.com$/i, /\.weebly\.com$/i, /\.carrd\.co$/i, /\.notion\.site$/i,
];

// ═══════════════════════════════════════════════
// RATE LIMITER (in-memory, per isolate)
// ═══════════════════════════════════════════════
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = rateLimiter.get(userId);
  if (!limit || now > limit.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (limit.count >= 10) return false;
  limit.count++;
  return true;
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return null; }
}

function isDirectoryUrl(url: string): boolean {
  const domain = extractDomain(url);
  if (!domain) return false;
  if (DIRECTORY_BLACKLIST.has(domain)) return true;
  for (const blocked of DIRECTORY_BLACKLIST) {
    if (domain.endsWith(`.${blocked}`)) return true;
  }
  for (const pattern of PLATFORM_PATTERNS) {
    if (pattern.test(domain)) return true;
  }
  return false;
}

// Strip sensitive fields for non-subscribed (gated) users
// Keep googleMapsUrl — it's a public link and needed for outreach cards
function stripGatedFields(leads: SearchLead[]): SearchLead[] {
  return leads.map(lead => ({
    ...lead,
    phone: undefined,
    address: undefined,
  }));
}

/* normalizeKeyword + generateCacheKey MOVED to ../_shared/search-cache-key.ts, unchanged, so
   market-view can read this cache with the identical hash. A second copy would drift and the
   market view would silently report "no lead pool" for a town searched minutes ago. This
   function remains the only WRITER of search_cache. */

// ═══════════════════════════════════════════════
// DIAGNOSTIC: track Google API calls
// ═══════════════════════════════════════════════
interface DebugMeta {
  googleCallsMade: { geocode: number; textSearchPages: number; placeDetails: number };
  apiKeyPresent: boolean;
  authMethod: 'getClaims' | 'getUser' | 'failed' | 'demo';
  cached: boolean;
}

function createDebugMeta(): DebugMeta {
  return {
    googleCallsMade: { geocode: 0, textSearchPages: 0, placeDetails: 0 },
    apiKeyPresent: false,
    authMethod: 'failed',
    cached: false,
  };
}

const GEOCODE_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function normalizeLocationKey(location: string): string {
  return location.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Area bounding box (from Google geocoding geometry.bounds ?? geometry.viewport).
interface Viewport { latMin: number; latMax: number; lngMin: number; lngMax: number }

// ─── Geocode outcome errors (handled at the top level as clean 2xx, never 5xx) ──
/** The place genuinely doesn't resolve (Google ZERO_RESULTS / no results) even
 *  after the un-biased retry. Carries the raw location so the notice can name it. */
class LocationNotFoundError extends Error {
  location: string;
  constructor(location: string) { super('Location not found'); this.name = 'LocationNotFoundError'; this.location = location; }
}
/** Google geocoding itself hiccuped (quota, denied, network, non-JSON) — distinct
 *  from "no such place" so the user gets a "try again" notice, not "not found". */
class GeocodeServiceError extends Error {
  constructor(detail: string) { super(`Geocode service error: ${detail}`); this.name = 'GeocodeServiceError'; }
}

// Country-bias resolution (qualifierInfo / resolveGeoBias) lives in ../_shared/geobias.ts
// so it's pure + unit-tested (geobias.test.ts) without importing this module's server.

/** Country ISO2 from a geocode result's address_components (short_name), else null. */
function countryOfResult(result: any): string | null {
  const comps = result?.address_components;
  if (!Array.isArray(comps)) return null;
  for (const c of comps) {
    if (Array.isArray(c.types) && c.types.includes('country')) {
      return (c.short_name ?? '').toString().toUpperCase() || null;
    }
  }
  return null;
}

/** Pull a bbox from a geocode result's geometry (prefer bounds — the true area
 *  extent — over viewport, the padded display box). null if neither is present. */
function extractViewport(geometry: any): Viewport | null {
  const box = geometry?.bounds ?? geometry?.viewport;
  const ne = box?.northeast, sw = box?.southwest;
  if (typeof ne?.lat !== 'number' || typeof sw?.lat !== 'number') return null;
  return { latMin: sw.lat, latMax: ne.lat, lngMin: sw.lng, lngMax: ne.lng };
}

type GeoHit = { lat: number; lng: number; viewport: Viewport | null };

/** Echoed to the client whenever townOnly was REQUESTED, so the SPA can tell the difference
 *  between "the hard boundary was used" and "we fell back to the radius". Absent entirely on a
 *  normal search. `applied: false` must always carry a human-readable `reason`. */
interface TownFilterResult { requested: true; applied: boolean; reason?: string }

async function geocodeLocation(
  location: string,
  apiKey: string,
  debug: DebugMeta,
  // deno-lint-ignore no-explicit-any -- loose-typed to avoid supabase-js generic 'never' friction
  serviceClient?: any,
  needViewport = false,
  country?: string,
): Promise<GeoHit> {
  // Worldwide-safe country bias (SOFT region hint): bare "Reading" → region=gb so it
  // resolves to the UK; any qualifier ("Reading, PA", "Reading PA", a country word) →
  // no forced bias + (for a foreign state without a country word) the country appended
  // so Google resolves it unambiguously. Pure logic lives in _shared/geobias.ts.
  const q = qualifierInfo(location);
  const bias = resolveGeoBias(location, country);          // ISO2 region hint, or null
  const expected = bias ?? q.country;                      // country we expect back, if any
  const primaryAddress = q.appendCountry ? `${location}, ${q.appendCountry}` : location;
  // Bias is part of the cache identity — a GB-biased "reading" must not satisfy a
  // later US-biased "reading" (cross-country cache poisoning). Qualified inputs carry
  // no bias suffix, so they never collide with a stale "@GB" row.
  const locationKey = normalizeLocationKey(location) + (bias ? `@${bias}` : '');

  // ─── GEOCODE CACHE CHECK ─────────────────────
  if (serviceClient) {
    try {
      const cutoff = new Date(Date.now() - GEOCODE_CACHE_TTL_MS).toISOString();
      const { data: cached } = await serviceClient
        .from('geocode_cache')
        .select('lat, lng, viewport')
        .eq('location_key', locationKey)
        .gte('created_at', cutoff)
        .maybeSingle();

      // Use the cached row only if it has the viewport we now need (region mode);
      // an older row predating the viewport column falls through to a re-geocode.
      if (cached && (!needViewport || cached.viewport)) {
        console.log(`[GEOCODE-CACHE] HIT for "${locationKey}" — lat: ${cached.lat}, lng: ${cached.lng}`);
        return { lat: cached.lat, lng: cached.lng, viewport: (cached.viewport as Viewport | null) ?? null };
      }
    } catch (e) {
      console.error('[GEOCODE-CACHE] Check failed (non-blocking):', e);
    }
  }

  // ─── GOOGLE GEOCODING API ────────────────────
  // One attempt for a given address + optional SOFT region bias. Returns a hit (with
  // the resolved country) or null for ZERO_RESULTS. Throws GeocodeServiceError for a
  // genuine service problem (HTTP error, quota, denied, non-JSON) — never a raw 5xx.
  type GeoAttempt = GeoHit & { resultCountry: string | null };
  const attempt = async (address: string, regionBias: string | null): Promise<GeoAttempt | null> => {
    let url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    if (regionBias) url += `&region=${regionBias.toLowerCase()}`;   // SOFT tiebreak, NOT a hard components=country filter
    console.log(`[DIAG-GEOCODE] Request URL: ${url.replace(apiKey, '[REDACTED]')} (address="${address}", region=${regionBias ?? 'none'})`);

    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new GeocodeServiceError(`fetch failed: ${(e as Error).message}`);
    }
    debug.googleCallsMade.geocode++;

    const rawText = await res.text();
    console.log(`[DIAG-GEOCODE] Response HTTP: ${res.status}, body (first 500): ${rawText.substring(0, 500)}`);
    if (!res.ok) throw new GeocodeServiceError(`http ${res.status}`);

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new GeocodeServiceError('non-JSON response');
    }

    if (data.status === 'OK' && data.results?.[0]) {
      const r = data.results[0];
      return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, viewport: extractViewport(r.geometry), resultCountry: countryOfResult(r) };
    }
    // Expected "no such place".
    if (data.status === 'ZERO_RESULTS' || !data.results?.[0]) {
      console.warn(`[DIAG-GEOCODE] ZERO_RESULTS (address="${address}", region=${regionBias ?? 'none'})`);
      return null;
    }
    // Anything else (OVER_QUERY_LIMIT, REQUEST_DENIED, OVER_DAILY_LIMIT, …) is a
    // service condition, not "not found".
    console.error(`[DIAG-GEOCODE] Google status: ${data.status}, error_message: ${data.error_message || 'none'}`);
    throw new GeocodeServiceError(String(data.status));
  };

  // Primary attempt: the (country-appended) address + soft region bias. Retry ONCE,
  // plain (raw location, no bias, no append), when the primary MISSED (ZERO_RESULTS)
  // OR came back with the WRONG country (a same-named place the soft bias favoured) —
  // so a wrong-country hit can still fail over. Retry only fires on miss/mismatch; the
  // happy path is a single geocode call.
  let hit = await attempt(primaryAddress, bias);
  const wrongCountry = !!(hit && expected && hit.resultCountry && hit.resultCountry !== expected);
  if ((!hit || wrongCountry) && (bias || q.appendCountry)) {
    console.log(`[DIAG-GEOCODE] Primary ${hit ? `wrong country (${hit.resultCountry}≠${expected})` : 'empty'} — retrying plain "${location}"`);
    const plain = await attempt(location, null);
    if (plain) hit = plain;   // keep the biased hit only if the plain retry also fails
  }
  if (!hit) throw new LocationNotFoundError(location);

  console.log(`[DIAG-GEOCODE] SUCCESS — lat: ${hit.lat}, lng: ${hit.lng}, country: ${hit.resultCountry ?? '?'}, viewport: ${hit.viewport ? 'yes' : 'none'}`);

  // ─── GEOCODE CACHE STORE ─────────────────────
  if (serviceClient) {
    try {
      await serviceClient.from('geocode_cache').upsert(
        { location_key: locationKey, lat: hit.lat, lng: hit.lng, viewport: hit.viewport, raw_location: location, created_at: new Date().toISOString() },
        { onConflict: 'location_key' }
      );
    } catch (e) {
      console.error('[GEOCODE-CACHE] Store failed (non-blocking):', e);
    }
  }

  return hit;
}

interface SearchLead {
  id: string;
  name: string;
  googleMapsUrl: string;
  websiteUrl: string | null;
  websiteStatus: 'NO_WEBSITE' | 'HAS_OWN_WEBSITE';
  confidence: number;
  reason: string;
  isExpanded?: boolean;
  /* NEARBY, BUT OUTSIDE THE TOWN BOUNDARY. Set only by the townOnly nearby pass below. The town
     pool keeps its hard-rectangle identity; these are tagged so they can be SHOWN without ever
     being counted as businesses in the town. Proven necessary 2026-08-04: Battle Locksmiths is
     cited in 10 Hastings audit citations and sits at Battle TN33, ~10km north of the rectangle,
     so no phrasing of the query could ever return it inside the boundary. */
  outsideTown?: boolean;
}

function classifyWebsite(websiteUri: string | null | undefined): { status: SearchLead['websiteStatus']; confidence: number; reason: string } {
  if (!websiteUri) {
    // Unverified: the Maps listing has no website, but the business may still have
    // one that only shows in web search. Lower confidence nudges a "Check website".
    return { status: 'NO_WEBSITE', confidence: 0.6, reason: 'No website on Google listing (unverified — may have one)' };
  }
  if (isDirectoryUrl(websiteUri)) {
    return { status: 'NO_WEBSITE', confidence: 0.95, reason: `Directory listing only: ${extractDomain(websiteUri)}` };
  }
  return { status: 'HAS_OWN_WEBSITE', confidence: 0.9, reason: 'Has own website' };
}

// ═══════════════════════════════════════════════
// TEXT SEARCH (New API) — with diagnostic logging
// ═══════════════════════════════════════════════
interface SelectionDebug {
  pagesFetched: number;
  totalPoolCount: number;
  noWebsiteCount: number;
  returnedNoWebsite: number;
  returnedHasWebsite: number;
  expansionAttempts?: number;
  expanded?: boolean;
}

async function textSearchPlaces(
  keyword: string,
  lat: number,
  lng: number,
  radius: number,
  apiKey: string,
  debug: DebugMeta,
  broad = false,
  /** "This town only": the geocoded town's own bounds. When present the request sends a HARD
   *  locationRestriction rectangle instead of the soft locationBias circle, and `radius` is
   *  ignored. Null (the default, and every existing caller) leaves the bias path untouched. */
  townViewport: Viewport | null = null,
  /** Page ceiling for THIS call. The town-only nearby pass asks for 1: it wants the "who is just
   *  outside" signal, not a second pool, and one page keeps it to a single Places call. */
  maxPages = 3,
): Promise<{ leads: SearchLead[]; selectionDebug: SelectionDebug }> {
  const pool: SearchLead[] = [];
  const seenIds = new Set<string>();
  let pageToken: string | undefined;
  const MAX_PAGES = Math.max(1, maxPages);
  const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
  const FIELD_MASK = 'places.id,places.displayName,places.googleMapsUri,places.websiteUri,nextPageToken';
  // Google Places API (New) max radius is 50,000m
  const clampedRadius = Math.min(radius, 50000);

  let noWebsiteCount = 0;
  let pagesFetched = 0;

  console.log(`[DIAG-SEARCH] Endpoint: ${ENDPOINT}`);
  console.log(`[DIAG-SEARCH] Field mask: ${FIELD_MASK}`);
  console.log(`[DIAG-SEARCH] API key present: ${!!apiKey}`);
  console.log(`[DIAG-SEARCH] Radius requested: ${radius}, clamped: ${clampedRadius}`);
  if (townViewport) {
    console.log(`[DIAG-SEARCH] TOWN-ONLY: hard locationRestriction rectangle `
      + `[${townViewport.latMin},${townViewport.lngMin}]..[${townViewport.latMax},${townViewport.lngMax}] — radius IGNORED`);
  }

  for (let page = 0; page < MAX_PAGES; page++) {
    // Hard cap on total text search calls across initial + expansion
    if (debug.googleCallsMade.textSearchPages >= MAX_TEXT_SEARCH_CALLS) {
      console.log(`[DIAG-SEARCH] Hard cap reached: ${debug.googleCallsMade.textSearchPages} text search calls`);
      break;
    }
    // Early stop: already have 50+ NO_WEBSITE leads
    if (noWebsiteCount >= MAX_RESULTS) {
      console.log(`[DIAG-SEARCH] Early stop: ${noWebsiteCount} NO_WEBSITE leads already collected`);
      break;
    }

    /* ONE BRANCH. locationRestriction is a HARD boundary Google enforces; locationBias is a hint
       it may ignore. Text Search takes a restriction as a RECTANGLE only (no circle form), which
       is exactly the shape extractViewport already produces and geocode_cache already stores —
       low = southwest, high = northeast. The radius is not sent in this mode: the town's own
       bounds ARE the extent, and passing both would be two answers to one question. */
    const requestBody: Record<string, unknown> = {
      textQuery: keyword,
      ...(townViewport
        ? {
          locationRestriction: {
            rectangle: {
              low: { latitude: townViewport.latMin, longitude: townViewport.lngMin },
              high: { latitude: townViewport.latMax, longitude: townViewport.lngMax },
            },
          },
        }
        : {
          locationBias: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: clampedRadius,
            },
          },
        }),
      pageSize: 20,
    };
    if (pageToken) requestBody.pageToken = pageToken;

    console.log(`[DIAG-SEARCH] Page ${page} request body: ${JSON.stringify(requestBody)}`);

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (e) {
      // Network failure — degrade to whatever we already collected, don't crash.
      console.error(`[DIAG-SEARCH] Page ${page} fetch failed (using results so far): ${(e as Error).message}`);
      break;
    }

    debug.googleCallsMade.textSearchPages++;
    pagesFetched++;

    const rawText = await res.text();
    console.log(`[DIAG-SEARCH] Page ${page} response status: ${res.status}`);
    console.log(`[DIAG-SEARCH] Page ${page} response body (first 2000 chars): ${rawText.substring(0, 2000)}`);

    if (!res.ok) {
      console.error(`[DIAG-SEARCH] Text Search page ${page} FAILED: ${res.status}`, rawText.substring(0, 2000));
      break;
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      // Non-JSON 200 (e.g. an HTML error page) — degrade to results so far.
      console.error(`[DIAG-SEARCH] Page ${page} non-JSON body (using results so far)`);
      break;
    }
    const placesOnPage = data.places || [];
    console.log(`[DIAG-SEARCH] Page ${page} places returned by Google: ${placesOnPage.length}`);

    for (const place of placesOnPage) {
      const placeId = (place.id || '').replace(/^places\//, '');
      if (!placeId || seenIds.has(placeId)) continue;
      seenIds.add(placeId);

      const { status, confidence, reason } = classifyWebsite(place.websiteUri);

      pool.push({
        id: placeId,
        name: place.displayName?.text || 'Unknown',
        googleMapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        websiteUrl: place.websiteUri || null,
        websiteStatus: status,
        confidence,
        reason,
      });

      if (status === 'NO_WEBSITE') {
        noWebsiteCount++;
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) {
      console.log(`[DIAG-SEARCH] No nextPageToken after page ${page}, stopping pagination`);
      break;
    }

    console.log(`[DIAG-SEARCH] After page ${page}: pool=${pool.length}, noWebsite=${noWebsiteCount}`);
  }

  // ── Selection ──
  const noWebsiteLeads = pool.filter(l => l.websiteStatus === 'NO_WEBSITE');
  const hasWebsiteLeads = pool.filter(l => l.websiteStatus === 'HAS_OWN_WEBSITE');

  const finalLeads: SearchLead[] = [];
  if (broad) {
    // List-builder: the FULL discovered pool (both types), discovered order, no
    // no-website-first culling — "cast wide".
    finalLeads.push(...pool.slice(0, BROAD_MAX));
  } else {
    // Curated: NO_WEBSITE first, fill remainder with HAS_OWN_WEBSITE (up to MAX_RESULTS).
    for (const lead of noWebsiteLeads) {
      if (finalLeads.length >= MAX_RESULTS) break;
      finalLeads.push(lead);
    }
    for (const lead of hasWebsiteLeads) {
      if (finalLeads.length >= MAX_RESULTS) break;
      finalLeads.push(lead);
    }
  }

  const selectionDebug: SelectionDebug = {
    pagesFetched,
    totalPoolCount: pool.length,
    noWebsiteCount,
    returnedNoWebsite: finalLeads.filter(l => l.websiteStatus !== 'HAS_OWN_WEBSITE').length,
    returnedHasWebsite: finalLeads.filter(l => l.websiteStatus === 'HAS_OWN_WEBSITE').length,
  };

  console.log(`[DIAG-SEARCH] Selection: pool=${pool.length}, noWebsite=${noWebsiteCount}, returned=${finalLeads.length} (${selectionDebug.returnedNoWebsite} noWeb + ${selectionDebug.returnedHasWebsite} hasWeb)`);

  return { leads: finalLeads, selectionDebug };
}

// ═══════════════════════════════════════════════
// NEARBY AREA EXPANSION
// ═══════════════════════════════════════════════
function generateExpansionCentres(lat: number, lng: number): { lat: number; lng: number }[] {
  const centres: { lat: number; lng: number }[] = [];
  // 8 compass directions
  const directions = [
    { dLat: 1, dLng: 0 },   // N
    { dLat: 1, dLng: 1 },   // NE
    { dLat: 0, dLng: 1 },   // E
    { dLat: -1, dLng: 1 },  // SE
    { dLat: -1, dLng: 0 },  // S
    { dLat: -1, dLng: -1 }, // SW
    { dLat: 0, dLng: -1 },  // W
    { dLat: 1, dLng: -1 },  // NW
  ];
  // 3 distance rings: ~10km, ~20km, ~30km (in degrees, ~0.09° ≈ 10km lat)
  const rings = [0.09, 0.18, 0.27];

  for (const ring of rings) {
    for (const dir of directions) {
      centres.push({
        lat: lat + dir.dLat * ring,
        lng: lng + dir.dLng * ring,
      });
    }
  }
  return centres;
}

async function expandSearch(
  keyword: string,
  originalLat: number,
  originalLng: number,
  radius: number,
  apiKey: string,
  existingLeads: SearchLead[],
  debug: DebugMeta
): Promise<{ expandedLeads: SearchLead[]; attempts: number }> {
  const seenIds = new Set(existingLeads.map(l => l.id));
  const expandedLeads: SearchLead[] = [];
  const centres = generateExpansionCentres(originalLat, originalLng);
  let attempts = 0;
  
  const currentNoWebsite = existingLeads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;
  let totalNoWebsite = currentNoWebsite;

  console.log(`[EXPAND] Starting expansion: need ${MIN_NO_WEBSITE_TARGET - currentNoWebsite} more NO_WEBSITE leads`);

  for (const centre of centres) {
    if (totalNoWebsite >= MIN_NO_WEBSITE_TARGET || attempts >= MAX_EXPANSION_ATTEMPTS) break;
    // Hard cap on total text search calls across initial + expansion
    if (debug.googleCallsMade.textSearchPages >= MAX_TEXT_SEARCH_CALLS) {
      console.log(`[EXPAND] Hard cap reached: ${debug.googleCallsMade.textSearchPages} text search calls, stopping expansion`);
      break;
    }

    attempts++;
    console.log(`[EXPAND] Attempt ${attempts}: searching at (${centre.lat.toFixed(4)}, ${centre.lng.toFixed(4)})`);

    try {
      const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
      const FIELD_MASK = 'places.id,places.displayName,places.googleMapsUri,places.websiteUri,nextPageToken';
      const clampedRadius = Math.min(radius, 50000);

      // Fetch 1 page per expansion centre to limit API spend
      let expansionPageToken: string | undefined;
      for (let ePage = 0; ePage < 1; ePage++) {
        if (totalNoWebsite >= MIN_NO_WEBSITE_TARGET) break;

        const body: Record<string, unknown> = {
          textQuery: keyword,
          locationBias: {
            circle: {
              center: { latitude: centre.lat, longitude: centre.lng },
              radius: clampedRadius,
            },
          },
          pageSize: 20,
        };
        if (expansionPageToken) body.pageToken = expansionPageToken;

        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
          },
          body: JSON.stringify(body),
        });

        debug.googleCallsMade.textSearchPages++;

        if (!res.ok) {
          console.warn(`[EXPAND] Search failed at centre ${attempts} page ${ePage}: ${res.status}`);
          break;
        }

        const data = await res.json();
        const places = data.places || [];

        for (const place of places) {
          const placeId = (place.id || '').replace(/^places\//, '');
          if (!placeId || seenIds.has(placeId)) continue;
          seenIds.add(placeId);

          const { status, confidence, reason } = classifyWebsite(place.websiteUri);
          if (status !== 'NO_WEBSITE') continue;

          expandedLeads.push({
            id: placeId,
            name: place.displayName?.text || 'Unknown',
            googleMapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
            websiteUrl: place.websiteUri || null,
            websiteStatus: status,
            confidence,
            reason,
            isExpanded: true,
          });
          totalNoWebsite++;

          if (totalNoWebsite >= MIN_NO_WEBSITE_TARGET) break;
        }

        expansionPageToken = data.nextPageToken;
        if (!expansionPageToken) break; // no more pages
      }
    } catch (err) {
      console.warn(`[EXPAND] Error at centre ${attempts}:`, err);
    }
  }

  console.log(`[EXPAND] Completed: ${attempts} attempts, found ${expandedLeads.length} additional NO_WEBSITE leads`);
  return { expandedLeads, attempts };
}

// ═══════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════
function sanitizeError(error: unknown): { message: string; status: number } {
  if (error instanceof z.ZodError) {
    return { message: 'Invalid input: ' + error.errors.map(e => e.message).join(', '), status: 400 };
  }
  if (error instanceof Error) {
    console.error('Detailed error:', error);
    if (error.message === 'Location not found') {
      return { message: 'Location not found. Please check the address and try again.', status: 400 };
    }
  }
  return { message: 'An unexpected error occurred. Please try again.', status: 500 };
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ═══════════════════════════════════════════════
// PERFORM SEARCH WITH OPTIONAL EXPANSION
// ═══════════════════════════════════════════════
async function performSearchGoogle(
  keyword: string,
  location: string,
  radius: number,
  apiKey: string,
  debug: DebugMeta,
  serviceClient?: ReturnType<typeof createClient>,
  broad = false,
  country?: string,
  townOnly = false,
): Promise<{ leads: SearchLead[]; selectionDebug: SelectionDebug; expanded: boolean; townFilter?: TownFilterResult }> {
  /* needViewport = townOnly. Same flag, same extraction, same geocode_cache.viewport column that
     region mode already uses — no second geocode path. */
  const geo = await geocodeLocation(location, apiKey, debug, serviceClient, townOnly, country);
  const { lat, lng } = geo;

  /* THE FALLBACK IS REPORTED, NEVER SILENT. Some locations geocode to a point with no bounds and
     no viewport (extractViewport returns null). We could refuse, but an empty result for a real
     town is worse than a wider one — so we run today's bias search and SAY the filter did not
     apply. A filter that quietly did nothing is worse than no filter at all. */
  const townViewport = townOnly ? geo.viewport : null;
  const townFilter: TownFilterResult | undefined = townOnly
    ? (townViewport
      ? { requested: true, applied: true }
      : { requested: true, applied: false, reason: `Google returned no boundary for "${location}", so this search used the ${Math.round(radius / 1000)}km radius instead.` })
    : undefined;
  if (townOnly && !townViewport) {
    console.warn(`[TOWN-ONLY] no viewport/bounds for "${location}" — FALLING BACK to locationBias radius ${radius}m`);
  }

  const { leads, selectionDebug } = await textSearchPlaces(keyword, lat, lng, radius, apiKey, debug, broad, townViewport);

  /* Town-only never EXPANDS (expandSearch chases no-website leads across a ring of centres and
     would undo the restriction). But it does now take ONE nearby pass, because the rectangle
     alone was quietly deciding who exists:

       MEASURED 2026-08-04, Hastings locksmiths. The rectangle is 6.0km x 11.1km. "locksmiths"
       inside it returns 13 places. Battle Locksmiths — 10 citations across 6 Hastings audits —
       is at Battle TN33, north of latMax, and a radius-biased call finds it immediately. So do
       six more genuine locksmiths in Bexhill, Rye, Eastbourne and Heathfield.

     ONE page, not three: this is a "who else is just outside" signal, not a second pool, and it
     costs one Places call on top of the town search. Everything it finds that the rectangle did
     NOT is tagged outsideTown and stays tagged all the way to the screen. The town pool itself is
     unchanged — same rectangle, same identity, same count. */
  if (townViewport) {
    const inside = new Set(leads.map((l) => l.id));
    let nearby: SearchLead[] = [];
    try {
      const { leads: wide } = await textSearchPlaces(
        keyword, lat, lng, radius, apiKey, debug, broad, null, 1 /* ONE page only */,
      );
      nearby = wide.filter((l) => !inside.has(l.id)).map((l) => ({ ...l, outsideTown: true }));
      console.log(`[TOWN-ONLY] nearby pass: ${wide.length} radius results, ${nearby.length} outside the boundary`);
    } catch (e) {
      // Never fatal: the town pool is the product here, the nearby list is a bonus signal.
      console.warn('[TOWN-ONLY] nearby pass failed (town pool unaffected):', e instanceof Error ? e.message : e);
    }
    return { leads: [...leads, ...nearby], selectionDebug, expanded: false, townFilter };
  }

  // List-builder mode casts wide — never expand (expansion chases no-website leads).
  if (broad) {
    return { leads, selectionDebug, expanded: false, townFilter };
  }

  const noWebCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;

  if (noWebCount >= MIN_NO_WEBSITE_TARGET) {
    return { leads, selectionDebug, expanded: false, townFilter };
  }

  // Expansion needed
  console.log(`[EXPAND] Only ${noWebCount} NO_WEBSITE leads, expanding search...`);
  const { expandedLeads, attempts } = await expandSearch(keyword, lat, lng, radius, apiKey, leads, debug);

  if (expandedLeads.length > 0) {
    // Insert expanded NO_WEBSITE leads at the front (after existing NO_WEBSITE)
    const existingNoWeb = leads.filter(l => l.websiteStatus === 'NO_WEBSITE');
    const existingHasWeb = leads.filter(l => l.websiteStatus === 'HAS_OWN_WEBSITE');
    const merged = [...existingNoWeb, ...expandedLeads, ...existingHasWeb].slice(0, MAX_RESULTS);

    const updatedDebug: SelectionDebug = {
      ...selectionDebug,
      noWebsiteCount: existingNoWeb.length + expandedLeads.length,
      returnedNoWebsite: merged.filter(l => l.websiteStatus === 'NO_WEBSITE').length,
      returnedHasWebsite: merged.filter(l => l.websiteStatus === 'HAS_OWN_WEBSITE').length,
      totalPoolCount: selectionDebug.totalPoolCount + expandedLeads.length,
      expansionAttempts: attempts,
      expanded: true,
    };

    return { leads: merged, selectionDebug: updatedDebug, expanded: true, townFilter };
  }

  selectionDebug.expansionAttempts = attempts;
  selectionDebug.expanded = true;
  return { leads, selectionDebug, expanded: true, townFilter };
}

// ═══════════════════════════════════════════════
// APIFY DISCOVERY (compass google-maps) — source #1
// ═══════════════════════════════════════════════
// Cap batch size to bound run time/cost. Env-tunable (APIFY_MAX_PLACES secret) so
// we can trade latency vs coverage without a redeploy. Default 25.
const APIFY_MAX_PLACES = Number(Deno.env.get('APIFY_MAX_PLACES')) || 25;

async function performSearchApify(
  keyword: string,
  location: string,
  token: string,
  broad = false,
): Promise<{ leads: SearchLead[]; selectionDebug: SelectionDebug; expanded: boolean }> {
  const { places, ms } = await mapsDiscover({
    keyword,
    location,
    maxPlaces: broad ? Math.max(APIFY_MAX_PLACES, BROAD_MAX) : APIFY_MAX_PLACES,
    token,
    timeoutMs: 90_000,
  });

  const seenIds = new Set<string>();
  const pool: SearchLead[] = [];
  for (const p of places) {
    if (!p.placeId || seenIds.has(p.placeId)) continue;
    seenIds.add(p.placeId);
    // SAME classifier as the Google path — directory/IG/Booksy "websites" → NO_WEBSITE.
    const { status, confidence, reason } = classifyWebsite(p.website ?? null);
    pool.push({
      id: p.placeId,
      name: p.title || 'Unknown',
      googleMapsUrl: p.googleMapsUrl || `https://www.google.com/maps/place/?q=place_id:${p.placeId}`,
      websiteUrl: p.website ?? null,
      websiteStatus: status,
      confidence,
      reason,
    });
  }

  const noWeb = pool.filter((l) => l.websiteStatus === 'NO_WEBSITE');
  const hasWeb = pool.filter((l) => l.websiteStatus === 'HAS_OWN_WEBSITE');
  // Broad: full pool (discovered order); curated: no-website-first up to MAX_RESULTS.
  const finalLeads = broad ? pool.slice(0, BROAD_MAX) : [...noWeb, ...hasWeb].slice(0, MAX_RESULTS);

  const selectionDebug: SelectionDebug = {
    pagesFetched: 1,
    totalPoolCount: pool.length,
    noWebsiteCount: noWeb.length,
    returnedNoWebsite: finalLeads.filter((l) => l.websiteStatus !== 'HAS_OWN_WEBSITE').length,
    returnedHasWebsite: finalLeads.filter((l) => l.websiteStatus === 'HAS_OWN_WEBSITE').length,
    expanded: false,
  };

  console.log(`[APIFY-DISCOVER] "${keyword}" @ "${location}" → ${places.length} places in ${ms}ms (noWeb=${noWeb.length}, returned=${finalLeads.length})`);
  return { leads: finalLeads, selectionDebug, expanded: false };
}

// ═══════════════════════════════════════════════
// REGION TILING (Phase 1: fixed grid) — source: Google Text Search
// ═══════════════════════════════════════════════
interface RegionMeta {
  area: string;
  tilesTotal: number;
  tilesSucceeded: number;
  cols: number;
  rows: number;
  spacingKm: number;          // requested (from density)
  effectiveSpacingKm: number; // after auto-coarsen to fit MAX_TILES
  coarsened: boolean;
  totalResults: number;
  cappedAt: number | null;    // REGION_MAX when the pool was truncated, else null
}

/** Lay a grid of search centres across a bbox at ~spacingKm, auto-coarsening the
 *  spacing until the tile count fits MAX_TILES (cover the whole region, never
 *  truncate). Per-tile radius = spacing/√2 so each circle covers its square's
 *  corners (slight overlap, no gaps). Pure + deterministic. */
function buildTileGrid(vp: Viewport, spacingKm: number): {
  centres: { lat: number; lng: number }[];
  cols: number; rows: number; effectiveSpacingKm: number; coarsened: boolean; tileRadiusM: number;
} {
  const latMid = (vp.latMin + vp.latMax) / 2;
  const hKm = Math.max(0.001, (vp.latMax - vp.latMin) * KM_PER_DEG_LAT);
  const wKm = Math.max(0.001, (vp.lngMax - vp.lngMin) * KM_PER_DEG_LNG * Math.cos((latMid * Math.PI) / 180));

  let s = spacingKm;
  let cols = Math.max(1, Math.ceil(wKm / s));
  let rows = Math.max(1, Math.ceil(hKm / s));
  // Auto-coarsen: grow spacing 15% at a time until the grid fits the cap.
  while (cols * rows > MAX_TILES) {
    s *= 1.15;
    cols = Math.max(1, Math.ceil(wKm / s));
    rows = Math.max(1, Math.ceil(hKm / s));
  }

  const centres: { lat: number; lng: number }[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      centres.push({
        lat: vp.latMin + ((j + 0.5) * (vp.latMax - vp.latMin)) / rows,
        lng: vp.lngMin + ((i + 0.5) * (vp.lngMax - vp.lngMin)) / cols,
      });
    }
  }
  const tileRadiusM = Math.min(50000, Math.round((s / Math.SQRT2) * 1000));
  return { centres, cols, rows, effectiveSpacingKm: Math.round(s * 10) / 10, coarsened: s > spacingKm + 0.01, tileRadiusM };
}

/** Bounded-concurrency map — runs `fn` over items with at most `limit` in flight. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Fetch ONE tile (up to TILE_MAX_PAGES pages). Returns raw classified leads (all
 *  statuses); dedupe happens in the caller across all tiles. Throws on hard failure
 *  so the caller can count it as a failed tile without aborting the region. */
async function fetchTile(
  keyword: string, lat: number, lng: number, radiusM: number, apiKey: string, debug: DebugMeta,
): Promise<SearchLead[]> {
  const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
  const FIELD_MASK = 'places.id,places.displayName,places.googleMapsUri,places.websiteUri,nextPageToken';
  const out: SearchLead[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < TILE_MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      textQuery: keyword,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } },
      pageSize: 20,
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify(body),
    });
    debug.googleCallsMade.textSearchPages++;
    if (!res.ok) {
      if (page === 0) throw new Error(`tile search ${res.status}`); // fail the tile only if page 1 failed
      break;
    }
    const data = await res.json();
    for (const place of (data.places || [])) {
      const placeId = (place.id || '').replace(/^places\//, '');
      if (!placeId) continue;
      const { status, confidence, reason } = classifyWebsite(place.websiteUri);
      out.push({
        id: placeId,
        name: place.displayName?.text || 'Unknown',
        googleMapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        websiteUrl: place.websiteUri || null,
        websiteStatus: status,
        confidence,
        reason,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/** Region search: geocode the area → grid of tile centres → parallel tile fetches
 *  (per-tile failures tolerated) → merge + dedupe by placeId → no-website-first,
 *  capped at REGION_MAX. Auto-expansion is intentionally NOT run (tiling replaces
 *  it). Returns the leads + a RegionMeta describing the grid actually used.
 *
 *  Region EXTENT: when radiusKm is passed (the Find Leads slider past 50km), the
 *  bbox is centre ± radiusKm — the slider is the single control of how wide the
 *  region is. The geocoded viewport bbox is only a fallback when no radius came. */
async function tiledRegionSearch(
  keyword: string, location: string, densityKm: number, apiKey: string, debug: DebugMeta,
  // deno-lint-ignore no-explicit-any -- loose-typed to avoid supabase-js generic 'never' friction
  serviceClient?: any,
  radiusKm?: number,
  country?: string,
): Promise<{ leads: SearchLead[]; region: RegionMeta }> {
  const useRadiusBox = !!radiusKm && radiusKm > 0;
  const geo = await geocodeLocation(location, apiKey, debug, serviceClient, !useRadiusBox, country);
  let vp: Viewport;
  if (useRadiusBox) {
    // Slider-driven extent: a square box of centre ± radiusKm.
    const dLat = radiusKm! / KM_PER_DEG_LAT;
    const dLng = radiusKm! / (KM_PER_DEG_LNG * Math.cos((geo.lat * Math.PI) / 180));
    vp = { latMin: geo.lat - dLat, latMax: geo.lat + dLat, lngMin: geo.lng - dLng, lngMax: geo.lng + dLng };
  } else {
    // Fall back to the geocoded viewport, else a ~±16km box around the centre
    // (e.g. a pin-point place name) so region mode still tiles a sensible area.
    vp = geo.viewport ?? {
      latMin: geo.lat - 0.15, latMax: geo.lat + 0.15, lngMin: geo.lng - 0.15, lngMax: geo.lng + 0.15,
    };
  }

  const grid = buildTileGrid(vp, densityKm);
  console.log(`[REGION] "${location}" → ${grid.cols}x${grid.rows}=${grid.centres.length} tiles @ ${grid.effectiveSpacingKm}km (r=${grid.tileRadiusM}m), coarsened=${grid.coarsened}`);

  let tilesSucceeded = 0;
  const tileResults = await mapPool(grid.centres, TILE_CONCURRENCY, async (c) => {
    try {
      const leads = await fetchTile(keyword, c.lat, c.lng, grid.tileRadiusM, apiKey, debug);
      tilesSucceeded++;
      return leads;
    } catch (e) {
      console.warn(`[REGION] tile (${c.lat.toFixed(3)},${c.lng.toFixed(3)}) failed: ${(e as Error).message}`);
      return [] as SearchLead[];
    }
  });

  // Merge + dedupe by placeId (first-seen wins), then no-website-first order.
  const seen = new Set<string>();
  const pool: SearchLead[] = [];
  for (const tile of tileResults) {
    for (const lead of tile) {
      if (seen.has(lead.id)) continue;
      seen.add(lead.id);
      pool.push(lead);
    }
  }
  const noWeb = pool.filter((l) => l.websiteStatus === 'NO_WEBSITE');
  const hasWeb = pool.filter((l) => l.websiteStatus === 'HAS_OWN_WEBSITE');
  const ordered = [...noWeb, ...hasWeb];
  const capped = ordered.length > REGION_MAX;
  const leads = ordered.slice(0, REGION_MAX);

  const region: RegionMeta = {
    area: location,
    tilesTotal: grid.centres.length,
    tilesSucceeded,
    cols: grid.cols,
    rows: grid.rows,
    spacingKm: densityKm,
    effectiveSpacingKm: grid.effectiveSpacingKm,
    coarsened: grid.coarsened,
    totalResults: leads.length,
    cappedAt: capped ? REGION_MAX : null,
  };
  return { leads, region };
}

/** Sum today's (UTC) estimated Google spend from api_usage_log — the region-mode
 *  daily budget guard. Best-effort: on any error returns 0 (never blocks search). */
// deno-lint-ignore no-explicit-any -- loose-typed to avoid supabase-js generic 'never' friction
async function todaysSpendUsd(serviceClient?: any): Promise<number> {
  if (!serviceClient) return 0;
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { data } = await serviceClient
      .from('api_usage_log')
      .select('estimated_cost_usd')
      .gte('created_at', since.toISOString());
    return (data ?? []).reduce((sum: number, r: { estimated_cost_usd: number | null }) => sum + (Number(r.estimated_cost_usd) || 0), 0);
  } catch {
    return 0;
  }
}

// Dispatcher: use Apify when APIFY_TOKEN is set (unless DISCOVERY_SOURCE=google),
// else the Google path. Apify failures fall back to Google so a bad run / missing
// token never takes search down.
async function performSearchWithExpansion(
  keyword: string,
  location: string,
  radius: number,
  apiKey: string,
  debug: DebugMeta,
  serviceClient?: ReturnType<typeof createClient>,
  broad = false,
  country?: string,
  townOnly = false,
): Promise<{ leads: SearchLead[]; selectionDebug: SelectionDebug; expanded: boolean; townFilter?: TownFilterResult }> {
  const apifyToken = Deno.env.get('APIFY_TOKEN');
  // DISCOVERY default = Google (fast: ~3s cold, instant cached). Apify discovery
  // is OPT-IN only (DISCOVERY_SOURCE=apify) because the actor has a ~20s run floor
  // — too slow for interactive search. Apify's value is the deep-enrich
  // (reviews/images/contacts) in generate-barber-site, where latency is tolerable.
  const useApifyDiscovery = (Deno.env.get('DISCOVERY_SOURCE') ?? '').toLowerCase() === 'apify';
  /* !townOnly: the Apify discovery actor takes a free-text query, not a bounding box, so it
     CANNOT honour a hard boundary. If DISCOVERY_SOURCE=apify were ever switched on, routing a
     town-only search through it would return out-of-town results while the UI said the filter was
     on — silently. Town-only therefore always takes the Google path. Discovery defaults to Google
     anyway, so this changes nothing today; it stops the mode lying if that env is ever flipped. */
  if (apifyToken && useApifyDiscovery && !townOnly) {
    try {
      return await performSearchApify(keyword, location, apifyToken, broad);
    } catch (e) {
      console.error(`[APIFY-DISCOVER] failed, falling back to Google: ${(e as Error).message}`);
      // fall through to Google below
    }
  }
  return await performSearchGoogle(keyword, location, radius, apiKey, debug, serviceClient, broad, country, townOnly);
}

// ═══════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════
Deno.serve(async (req) => {
  console.log(`[DIAG-HANDLER] Request received: ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const debug = createDebugMeta();

  try {
    // Request size guard
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10000) {
      return jsonResponse({ error: 'Request too large' }, 413);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body.', _debug: debug }, 400);
    }

    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    debug.apiKeyPresent = !!GOOGLE_MAPS_API_KEY;
    console.log(`[DIAG-HANDLER] API key present: ${debug.apiKeyPresent}`);

    // ─── AUTHENTICATED MODE ──────────────────────
    // Internal-only tool: there is NO unauthenticated/guest/demo search path — all
    // lead search requires a signed-in admin (paid Google API). The old demo+guest
    // branches (anonymous, IP-capped free searches) were removed for LeadFinderOS.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[DIAG-AUTH] No Bearer token found');
      return jsonResponse({ error: 'Authentication required. Please sign in.', _debug: debug }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    let userId: string | null = null;

    // Try getClaims first, fallback to getUser
    try {
      console.log('[DIAG-AUTH] Attempting getClaims...');
      const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        console.warn('[DIAG-AUTH] getClaims failed:', claimsError?.message || 'no claims returned');
        throw new Error('getClaims failed');
      }
      userId = claimsData.claims.sub as string;
      debug.authMethod = 'getClaims';
      console.log(`[DIAG-AUTH] getClaims SUCCESS — userId: ${userId}`);
    } catch (claimsErr) {
      console.warn(`[DIAG-AUTH] getClaims threw error: ${claimsErr}`);
      console.log('[DIAG-AUTH] Falling back to getUser...');
      try {
        const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
        if (userError || !userData?.user) {
          console.error('[DIAG-AUTH] getUser also failed:', userError?.message || 'no user returned');
          return jsonResponse({ error: 'Authentication required. Please sign in.', _debug: debug }, 401);
        }
        userId = userData.user.id;
        debug.authMethod = 'getUser';
        console.log(`[DIAG-AUTH] getUser SUCCESS — userId: ${userId}`);
      } catch (userErr) {
        console.error(`[DIAG-AUTH] getUser threw error: ${userErr}`);
        return jsonResponse({ error: 'Authentication required. Please sign in.', _debug: debug }, 401);
      }
    }

    if (!userId) {
      console.error('[DIAG-AUTH] userId is null after auth attempts');
      return jsonResponse({ error: 'Authentication required. Please sign in.', _debug: debug }, 401);
    }

    console.log(`[DIAG-HANDLER] Authenticated user: ${userId}, authMethod: ${debug.authMethod}`);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Operator-only: lead search triggers PAID Google API calls, so it requires
    // an admin (a user_roles role='admin' row). A logged-in non-admin — e.g. a
    // barber/site-owner account — is rejected. Defence-in-depth behind the
    // frontend RequireAdmin gate.
    const { data: adminRole } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!adminRole) {
      console.warn(`[search-leads] non-admin user ${userId} blocked from search`);
      return jsonResponse({ error: 'Not authorised.', _debug: debug }, 403);
    }

    // Internal tool: every authenticated (admin) account has full, ungated access.
    const isGated = false;

    // ─── RATE LIMIT ──────────────────────────────
    if (!checkRateLimit(userId)) {
      return jsonResponse({ error: 'Too many requests. Please wait a moment.', _debug: debug }, 429);
    }

    // ─── VALIDATE INPUT ──────────────────────────
    const validationResult = SearchRequestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors);
      return jsonResponse({ error: 'Invalid search parameters. Please check your input.', _debug: debug }, 400);
    }

    const { keyword, location, radius, broad, region, density, country, townOnly } = validationResult.data;

    if (!GOOGLE_MAPS_API_KEY) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return jsonResponse({ error: 'Service temporarily unavailable.', _debug: debug }, 503);
    }

    // ─── CACHE CHECK ─────────────────────────────
    // Region searches cache under a distinct key (density-scoped, radius-agnostic)
    // so they never collide with normal/curated results for the same area.
    const cacheKey = region
      ? await generateCacheKey(keyword, `##region:${density}##${location}`, radius)
      : await generateCacheKey(keyword, location, radius, townOnly);
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

    const { data: cached } = await serviceClient
      .from('search_cache')
      .select('results, created_at')
      .eq('cache_key', cacheKey)
      .gte('created_at', cutoff)
      .maybeSingle();

    if (cached?.results) {
      debug.cached = true;
      // Region blobs are stored as { leads, region }; normal as a bare leads array.
      const raw = cached.results as unknown;
      const isRegionBlob = !!raw && !Array.isArray(raw) && Array.isArray((raw as { leads?: unknown }).leads);
      const cachedLeads = (isRegionBlob ? (raw as { leads: SearchLead[] }).leads : raw) as SearchLead[];
      const cachedRegion = isRegionBlob ? (raw as { region?: RegionMeta }).region : undefined;
      console.log(`Cache HIT for "${keyword}" in "${location}" (${cachedLeads.length} results, region=${!!cachedRegion})`);

      const hasExpanded = cachedLeads.some(l => l.isExpanded);

      // Log usage even for cached searches
      try {
        await supabaseClient.rpc('log_usage_event', {
          p_event_type: 'search',
          p_meta: { query: keyword, location, radius, results_count: cachedLeads.length, cached: true, source: 'google' },
        });
      } catch {}

      return jsonResponse({
        leads: isGated ? stripGatedFields(cachedLeads) : cachedLeads,
        totalFound: cachedLeads.length,
        searchId: crypto.randomUUID(),
        source: 'google',
        cached: true,
        expanded: hasExpanded,
        region: cachedRegion,
        /* Safe to assert applied:true here. Fallback runs are never cached (see CACHE STORE), and
           the '|townonly' key suffix means these results can only have come from a restricted
           run — so a hit on this key is by construction a filtered result. */
        townFilter: townOnly ? { requested: true, applied: true } as TownFilterResult : undefined,
        gated: isGated,
        _debug: debug,
      });
    }

    // ─── RUN SEARCH (region tiling OR normal, with expansion) ───
    let leads: SearchLead[];
    let selectionDebug: SelectionDebug;
    let expanded = false;
    let regionMeta: RegionMeta | undefined;
    let downgraded: { reason: string; spentUsd: number } | undefined;
    let townFilter: TownFilterResult | undefined;

    // Region daily budget guard: if today's Google spend is over the cap, downgrade
    // region → a normal single-centre search so a big region can't blow the budget.
    let runRegion = region;
    if (region) {
      const spent = await todaysSpendUsd(serviceClient);
      if (spent >= DAILY_BUDGET_USD) {
        runRegion = false;
        downgraded = { reason: 'daily_budget', spentUsd: Math.round(spent * 100) / 100 };
        console.warn(`[REGION] today's spend $${spent.toFixed(2)} >= $${DAILY_BUDGET_USD} — downgrading to single search`);
      }
    }

    if (runRegion) {
      console.log(`[DIAG-HANDLER] Region search for "${keyword}" in "${location}" (density=${density})`);
      // The slider (metres) defines the region extent: bbox = centre ± radius.
      const r = await tiledRegionSearch(keyword, location, DENSITY_KM[density], GOOGLE_MAPS_API_KEY, debug, serviceClient, radius / 1000, country);
      leads = r.leads;
      regionMeta = r.region;
      selectionDebug = {
        pagesFetched: debug.googleCallsMade.textSearchPages,
        totalPoolCount: r.leads.length,
        noWebsiteCount: r.leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length,
        returnedNoWebsite: r.leads.filter(l => l.websiteStatus !== 'HAS_OWN_WEBSITE').length,
        returnedHasWebsite: r.leads.filter(l => l.websiteStatus === 'HAS_OWN_WEBSITE').length,
        expanded: false,
      };
      console.log(`[DIAG-HANDLER] Region: ${leads.length} leads from ${regionMeta.tilesSucceeded}/${regionMeta.tilesTotal} tiles`);
    } else {
      console.log(`[DIAG-HANDLER] Starting search for "${keyword}" in "${location}" within ${radius}m`);
      const res = await performSearchWithExpansion(keyword, location, radius, GOOGLE_MAPS_API_KEY, debug, serviceClient, broad, country, townOnly);
      leads = res.leads; selectionDebug = res.selectionDebug; expanded = res.expanded; townFilter = res.townFilter;
      console.log(`[DIAG-HANDLER] Found ${leads.length} leads (${selectionDebug.returnedNoWebsite} noWeb, ${selectionDebug.returnedHasWebsite} hasWeb, expanded: ${expanded})`);
    }

    // ─── CACHE STORE ─────────────────────────────
    // Region: store { leads, region } so a cached re-run keeps the grid banner.
    /* A town-only run that FELL BACK to the radius is not cached. The cache blob carries no
       townFilter, so a later hit on the '|townonly' key would replay those wider results with no
       warning attached — the fallback would be announced once and then quietly forgotten. Cheaper
       to re-run the search than to serve an unlabelled one. */
    const skipCacheStore = townFilter?.applied === false;
    if (skipCacheStore) {
      console.warn('[TOWN-ONLY] fallback result NOT cached — a cached copy would lose the "filter did not apply" warning');
    }
    try {
      if (!skipCacheStore) {
        await serviceClient.from('search_cache').upsert(
          { cache_key: cacheKey, results: regionMeta ? { leads, region: regionMeta } : leads, created_at: new Date().toISOString() },
          { onConflict: 'cache_key' }
        );
      }
    } catch (cacheErr) {
      console.error('Cache store failed (non-blocking):', cacheErr);
    }

    // ─── LOG USAGE ───────────────────────────────
    try {
      await supabaseClient.rpc('log_usage_event', {
        p_event_type: 'search',
        p_meta: { query: keyword, location, radius, results_count: leads.length, cached: false, source: 'google', expanded },
      });
    } catch (trackingErr) {
      console.error('Usage tracking failed (non-blocking):', trackingErr);
    }

    // ─── LOG API USAGE TO api_usage_log (best-effort) ───
    const searchSessionId = crypto.randomUUID();
    const totalCostUsd = (debug.googleCallsMade.geocode * 0.005) + (debug.googleCallsMade.textSearchPages * 0.032);
    console.log(`[COST] userId=${userId} searchSession=${searchSessionId} geocode=${debug.googleCallsMade.geocode} textSearch=${debug.googleCallsMade.textSearchPages} totalCost=$${totalCostUsd.toFixed(3)} expanded=${expanded}`);

    try {
      const usageLogs = [];
      if (debug.googleCallsMade.geocode > 0) {
        usageLogs.push({
          user_id: userId,
          function_name: 'search-leads',
          api_type: 'geocode',
          calls_made: debug.googleCallsMade.geocode,
          cache_hit: false,
          estimated_cost_usd: debug.googleCallsMade.geocode * 0.005,
          search_session_id: searchSessionId,
        });
      }
      if (debug.googleCallsMade.textSearchPages > 0) {
        usageLogs.push({
          user_id: userId,
          function_name: 'search-leads',
          api_type: 'text_search',
          calls_made: debug.googleCallsMade.textSearchPages,
          cache_hit: false,
          estimated_cost_usd: debug.googleCallsMade.textSearchPages * 0.032,
          search_session_id: searchSessionId,
        });
      }
      if (usageLogs.length > 0) {
        await serviceClient.from('api_usage_log').insert(usageLogs);
      }
    } catch (e) {
      console.error('API usage logging failed (non-blocking):', e);
    }

    return jsonResponse({
      leads: isGated ? stripGatedFields(leads) : leads,
      totalFound: leads.length,
      searchId: crypto.randomUUID(),
      source: 'google',
      cached: false,
      expanded,
      region: regionMeta,
      downgraded,
      townFilter,
      gated: isGated,
      _debug: { ...debug, ...selectionDebug },
    });

  } catch (error) {
    // ─── HANDLED, NON-CRASH OUTCOMES → clean 2xx (never a broken "non-2xx") ───
    // The place doesn't resolve even un-biased: return an empty result + friendly
    // notice so the client shows a tidy empty state, not a failed search.
    if (error instanceof LocationNotFoundError) {
      console.warn(`[DIAG-HANDLER] Location not found: "${error.location}"`);
      return jsonResponse({
        leads: [],
        totalFound: 0,
        searchId: crypto.randomUUID(),
        source: 'google',
        cached: false,
        notFound: true,
        notice: `Couldn't find "${error.location}" — try adding a country or county, e.g. "Reading, UK".`,
        _debug: debug,
      });
    }
    // Google geocoding itself hiccuped (quota / denied / network / non-JSON): a
    // distinct "try again" notice, still a clean 2xx (no raw 5xx to the client).
    if (error instanceof GeocodeServiceError) {
      console.error(`[DIAG-HANDLER] Geocode service issue: ${error.message}`);
      return jsonResponse({
        leads: [],
        totalFound: 0,
        searchId: crypto.randomUUID(),
        source: 'google',
        cached: false,
        serviceIssue: true,
        notice: 'Map lookup is temporarily unavailable — please try again in a moment.',
        _debug: debug,
      });
    }
    console.error(`[DIAG-HANDLER] TOP-LEVEL CRASH:`, error);
    console.error(`[DIAG-HANDLER] Error type: ${typeof error}, constructor: ${error?.constructor?.name}`);
    console.error(`[DIAG-HANDLER] Error message: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`[DIAG-HANDLER] Stack: ${error instanceof Error ? error.stack : 'no stack'}`);
    const { message, status } = sanitizeError(error);
    return jsonResponse({ error: message, _debug: debug }, status);
  }
});
