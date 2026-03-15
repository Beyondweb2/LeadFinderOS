import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

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
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FREE_SEARCH_LIMIT = 3;
const MIN_NO_WEBSITE_TARGET = 3;
const MAX_EXPANSION_ATTEMPTS = 12;

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
  'linkedin.com', 'youtube.com', 'pinterest.com', 'snapchat.com',
  'yell.com', 'thomsonlocal.com', 'yelp.com', 'yelp.co.uk', 'checkatrade.com',
  'mybuilder.com', 'bark.com', 'trustatrader.com', 'ratedpeople.com',
  'freeindex.co.uk', 'yell.co.uk', 'scoot.co.uk', 'hotfrog.co.uk',
  'tripadvisor.com', 'tripadvisor.co.uk', 'booking.com', 'airbnb.com',
  'justeat.co.uk', 'justeat.com', 'deliveroo.com', 'deliveroo.co.uk',
  'ubereats.com', 'opentable.com', 'opentable.co.uk',
  'google.com', 'maps.google.com', 'business.google.com',
  'apple.com', 'bing.com',
]);

const PLATFORM_PATTERNS = [
  /\.myshopify\.com$/i, /\.wixsite\.com$/i, /\.webflow\.io$/i,
  /\.squarespace\.com$/i, /\.wordpress\.com$/i, /\.blogspot\.com$/i,
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

async function generateCacheKey(keyword: string, location: string, radius: number): Promise<string> {
  const input = `v3-expand|${keyword.toLowerCase()}|${location.toLowerCase()}|${radius}`;
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

async function geocodeLocation(location: string, apiKey: string, debug: DebugMeta): Promise<{ lat: number; lng: number }> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
  console.log(`[DIAG-GEOCODE] Request URL: ${url.replace(apiKey, '[REDACTED]')}`);
  
  const res = await fetch(url);
  debug.googleCallsMade.geocode++;
  
  const rawText = await res.text();
  console.log(`[DIAG-GEOCODE] Response status: ${res.status}`);
  console.log(`[DIAG-GEOCODE] Response body (first 1000 chars): ${rawText.substring(0, 1000)}`);
  
  const data = JSON.parse(rawText);
  
  if (data.status !== 'OK' || !data.results?.[0]) {
    console.error(`[DIAG-GEOCODE] FAILED — Google status: ${data.status}, error_message: ${data.error_message || 'none'}`);
    throw new Error('Location not found');
  }
  
  const coords = data.results[0].geometry.location;
  console.log(`[DIAG-GEOCODE] SUCCESS — lat: ${coords.lat}, lng: ${coords.lng}`);
  return coords;
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
}

function classifyWebsite(websiteUri: string | null | undefined): { status: SearchLead['websiteStatus']; confidence: number; reason: string } {
  if (!websiteUri) {
    return { status: 'NO_WEBSITE', confidence: 1.0, reason: 'No website listed on Google' };
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
  debug: DebugMeta
): Promise<{ leads: SearchLead[]; selectionDebug: SelectionDebug }> {
  const pool: SearchLead[] = [];
  const seenIds = new Set<string>();
  let pageToken: string | undefined;
  const MAX_PAGES = 3;
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

  for (let page = 0; page < MAX_PAGES; page++) {
    // Early stop: already have 50+ NO_WEBSITE leads
    if (noWebsiteCount >= MAX_RESULTS) {
      console.log(`[DIAG-SEARCH] Early stop: ${noWebsiteCount} NO_WEBSITE leads already collected`);
      break;
    }

    const requestBody: Record<string, unknown> = {
      textQuery: keyword,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: clampedRadius,
        },
      },
      pageSize: 20,
    };
    if (pageToken) requestBody.pageToken = pageToken;

    console.log(`[DIAG-SEARCH] Page ${page} request body: ${JSON.stringify(requestBody)}`);

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
    });

    debug.googleCallsMade.textSearchPages++;
    pagesFetched++;

    const rawText = await res.text();
    console.log(`[DIAG-SEARCH] Page ${page} response status: ${res.status}`);
    console.log(`[DIAG-SEARCH] Page ${page} response body (first 2000 chars): ${rawText.substring(0, 2000)}`);

    if (!res.ok) {
      console.error(`[DIAG-SEARCH] Text Search page ${page} FAILED: ${res.status}`, rawText.substring(0, 2000));
      break;
    }

    const data = JSON.parse(rawText);
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

  // ── Selection: NO_WEBSITE first, fill remainder with HAS_OWN_WEBSITE ──
  const noWebsiteLeads = pool.filter(l => l.websiteStatus === 'NO_WEBSITE');
  const hasWebsiteLeads = pool.filter(l => l.websiteStatus === 'HAS_OWN_WEBSITE');

  const finalLeads: SearchLead[] = [];
  // Take NO_WEBSITE first (up to MAX_RESULTS)
  for (const lead of noWebsiteLeads) {
    if (finalLeads.length >= MAX_RESULTS) break;
    finalLeads.push(lead);
  }
  // Fill remaining slots with HAS_WEBSITE
  for (const lead of hasWebsiteLeads) {
    if (finalLeads.length >= MAX_RESULTS) break;
    finalLeads.push(lead);
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

    attempts++;
    console.log(`[EXPAND] Attempt ${attempts}: searching at (${centre.lat.toFixed(4)}, ${centre.lng.toFixed(4)})`);

    try {
      // Single-page search at the expansion centre (keep it fast)
      const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
      const FIELD_MASK = 'places.id,places.displayName,places.googleMapsUri,places.websiteUri';
      const clampedRadius = Math.min(radius, 50000);

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: keyword,
          locationBias: {
            circle: {
              center: { latitude: centre.lat, longitude: centre.lng },
              radius: clampedRadius,
            },
          },
          pageSize: 20,
        }),
      });

      debug.googleCallsMade.textSearchPages++;

      if (!res.ok) {
        console.warn(`[EXPAND] Search failed at centre ${attempts}: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const places = data.places || [];

      for (const place of places) {
        const placeId = (place.id || '').replace(/^places\//, '');
        if (!placeId || seenIds.has(placeId)) continue;
        seenIds.add(placeId);

        const { status, confidence, reason } = classifyWebsite(place.websiteUri);
        if (status !== 'NO_WEBSITE') continue; // Only collect NO_WEBSITE from expansion

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
async function performSearchWithExpansion(
  keyword: string,
  location: string,
  radius: number,
  apiKey: string,
  debug: DebugMeta
): Promise<{ leads: SearchLead[]; selectionDebug: SelectionDebug; expanded: boolean }> {
  const { lat, lng } = await geocodeLocation(location, apiKey, debug);
  const { leads, selectionDebug } = await textSearchPlaces(keyword, lat, lng, radius, apiKey, debug);

  const noWebCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;

  if (noWebCount >= MIN_NO_WEBSITE_TARGET) {
    return { leads, selectionDebug, expanded: false };
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

    return { leads: merged, selectionDebug: updatedDebug, expanded: true };
  }

  selectionDebug.expansionAttempts = attempts;
  selectionDebug.expanded = true;
  return { leads, selectionDebug, expanded: true };
}

// ═══════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════
serve(async (req) => {
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

    const body = await req.json();
    const isDemo = body?.demo === true;

    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    debug.apiKeyPresent = !!GOOGLE_MAPS_API_KEY;
    console.log(`[DIAG-HANDLER] API key present: ${debug.apiKeyPresent}`);

    // ─── DEMO MODE ───────────────────────────────
    if (isDemo) {
      debug.authMethod = 'demo';
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('cf-connecting-ip')
        || 'unknown';
      const demoKey = `demo:${clientIp}`;

      if (!globalThis.__demoSearches) globalThis.__demoSearches = new Set();
      if (globalThis.__demoSearches.has(demoKey)) {
        return jsonResponse({ error: 'Demo search limit reached. Sign up for unlimited access.', code: 'DEMO_LIMIT', _debug: debug }, 402);
      }
      globalThis.__demoSearches.add(demoKey);

      const validationResult = SearchRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return jsonResponse({ error: 'Invalid search parameters.', _debug: debug }, 400);
      }

      const { keyword, location, radius } = validationResult.data;
      if (!GOOGLE_MAPS_API_KEY) {
        return jsonResponse({ error: 'Service temporarily unavailable.', _debug: debug }, 503);
      }

      console.log(`[DEMO] Searching for "${keyword}" in "${location}" within ${radius}m`);
      const { leads, selectionDebug, expanded } = await performSearchWithExpansion(keyword, location, radius, GOOGLE_MAPS_API_KEY, debug);
      console.log(`[DEMO] Found ${leads.length} leads (expanded: ${expanded})`);

      return jsonResponse({
        leads,
        totalFound: leads.length,
        searchId: crypto.randomUUID(),
        source: 'google',
        cached: false,
        expanded,
        _debug: { ...debug, ...selectionDebug },
      });
    }

    // ─── GUEST MODE (ad-entry unauthenticated users) ──
    const isGuest = body?.guest === true;
    if (isGuest) {
      debug.authMethod = 'demo';
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('cf-connecting-ip')
        || 'unknown';
      const guestKey = `guest:${clientIp}`;

      if (!globalThis.__guestSearches) globalThis.__guestSearches = new Map();
      const guestCount = globalThis.__guestSearches.get(guestKey) || 0;
      if (guestCount >= FREE_SEARCH_LIMIT) {
        return jsonResponse({ error: 'Free search limit reached.', code: 'GUEST_LIMIT_REACHED', searches_today: guestCount, limit: FREE_SEARCH_LIMIT, _debug: debug }, 402);
      }
      globalThis.__guestSearches.set(guestKey, guestCount + 1);

      const validationResult = SearchRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return jsonResponse({ error: 'Invalid search parameters.', _debug: debug }, 400);
      }

      const { keyword, location, radius } = validationResult.data;
      if (!GOOGLE_MAPS_API_KEY) {
        return jsonResponse({ error: 'Service temporarily unavailable.', _debug: debug }, 503);
      }

      console.log(`[GUEST] Searching for "${keyword}" in "${location}" within ${radius}m (search ${guestCount + 1}/${FREE_SEARCH_LIMIT})`);

      // Check cache first
      const cacheKey = await generateCacheKey(keyword, location, radius);
      const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      );

      const { data: cached } = await serviceClient
        .from('search_cache')
        .select('results, created_at')
        .eq('cache_key', cacheKey)
        .gte('created_at', cutoff)
        .maybeSingle();

      if (cached?.results) {
        debug.cached = true;
        const cachedLeads = cached.results as SearchLead[];
        const hasExpanded = cachedLeads.some(l => l.isExpanded);
        return jsonResponse({
          leads: cachedLeads,
          totalFound: cachedLeads.length,
          searchId: crypto.randomUUID(),
          source: 'google',
          cached: true,
          expanded: hasExpanded,
          gated: false,
          _debug: debug,
        });
      }

      const { leads, selectionDebug, expanded } = await performSearchWithExpansion(keyword, location, radius, GOOGLE_MAPS_API_KEY, debug);

      // Cache the results
      try {
        await serviceClient.from('search_cache').upsert(
          { cache_key: cacheKey, results: leads, created_at: new Date().toISOString() },
          { onConflict: 'cache_key' }
        );
      } catch {}

      return jsonResponse({
        leads: stripGatedFields(leads),
        totalFound: leads.length,
        searchId: crypto.randomUUID(),
        source: 'google',
        cached: false,
        expanded,
        gated: true,
        _debug: { ...debug, ...selectionDebug },
      });
    }

    // ─── AUTHENTICATED MODE ──────────────────────
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

    // ─── ADMIN CHECK ─────────────────────────────
    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = !!roleData;

    // ─── SUBSCRIPTION / TRIAL CHECK ──────────────
    let hasActiveSubscription = false;
    let isGated = false;

    if (!isAdmin) {
      const { data: subscription } = await serviceClient
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      const fullAccessStatuses = ['active', 'past_due', 'trialing'];
      hasActiveSubscription = subscription && fullAccessStatuses.includes(subscription.status);

      console.log(`[SEARCH] userId: ${userId}, subStatus: ${subscription?.status ?? 'none'}, proAccess: ${hasActiveSubscription}`);

      if (hasActiveSubscription) {
        console.log(`User ${userId} has Stripe subscription (${subscription.status}) — unlimited searches`);
      } else {
        // Free user — allow search but mark results as gated
        isGated = true;
        console.log(`User ${userId} is free user — search allowed, results gated`);

        // Track free search count for analytics
        const { data: trial } = await serviceClient
          .from('user_trials')
          .select('free_search_count, searches_used')
          .eq('user_id', userId)
          .maybeSingle();

        if (trial) {
          const currentFreeCount = trial.free_search_count || 0;
          await serviceClient
            .from('user_trials')
            .update({
              free_search_count: currentFreeCount + 1,
              searches_used: (trial.searches_used || 0) + 1,
              demo_search_used: true,
            })
            .eq('user_id', userId);
        }
      }
    } else {
      console.log(`User ${userId} is admin — bypassing limits`);
    }

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

    const { keyword, location, radius } = validationResult.data;

    if (!GOOGLE_MAPS_API_KEY) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return jsonResponse({ error: 'Service temporarily unavailable.', _debug: debug }, 503);
    }

    // ─── CACHE CHECK ─────────────────────────────
    const cacheKey = await generateCacheKey(keyword, location, radius);
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

    const { data: cached } = await serviceClient
      .from('search_cache')
      .select('results, created_at')
      .eq('cache_key', cacheKey)
      .gte('created_at', cutoff)
      .maybeSingle();

    if (cached?.results) {
      debug.cached = true;
      const cachedLeads = cached.results as SearchLead[];
      console.log(`Cache HIT for "${keyword}" in "${location}" (${cachedLeads.length} results)`);

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
        gated: isGated,
        _debug: debug,
      });
    }

    // ─── SEARCH WITH EXPANSION ───────────────────
    console.log(`[DIAG-HANDLER] Starting search for "${keyword}" in "${location}" within ${radius}m`);
    const { leads, selectionDebug, expanded } = await performSearchWithExpansion(keyword, location, radius, GOOGLE_MAPS_API_KEY, debug);
    console.log(`[DIAG-HANDLER] Found ${leads.length} leads (${selectionDebug.returnedNoWebsite} noWeb, ${selectionDebug.returnedHasWebsite} hasWeb, expanded: ${expanded})`);

    // ─── CACHE STORE ─────────────────────────────
    try {
      await serviceClient.from('search_cache').upsert(
        { cache_key: cacheKey, results: leads, created_at: new Date().toISOString() },
        { onConflict: 'cache_key' }
      );
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

    return jsonResponse({
      leads: isGated ? stripGatedFields(leads) : leads,
      totalFound: leads.length,
      searchId: crypto.randomUUID(),
      source: 'google',
      cached: false,
      expanded,
      gated: isGated,
      _debug: { ...debug, ...selectionDebug },
    });

  } catch (error) {
    console.error(`[DIAG-HANDLER] TOP-LEVEL CRASH:`, error);
    console.error(`[DIAG-HANDLER] Error type: ${typeof error}, constructor: ${error?.constructor?.name}`);
    console.error(`[DIAG-HANDLER] Error message: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`[DIAG-HANDLER] Stack: ${error instanceof Error ? error.stack : 'no stack'}`);
    const { message, status } = sanitizeError(error);
    return jsonResponse({ error: message, _debug: debug }, status);
  }
});
