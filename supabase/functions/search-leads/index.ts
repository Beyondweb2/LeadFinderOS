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

// ═══════════════════════════════════════════════
// INPUT VALIDATION
// ═══════════════════════════════════════════════
const SearchRequestSchema = z.object({
  keyword: z.string().min(1, 'Keyword is required').max(100).transform(s => s.trim()),
  location: z.string().min(1, 'Location is required').max(200).transform(s => s.trim()),
  radius: z.number().int().min(100).max(100000).default(5000),
  skipTrialCount: z.boolean().default(false),
  demo: z.boolean().default(false),
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

async function generateCacheKey(keyword: string, location: string, radius: number): Promise<string> {
  const input = `v2|${keyword.toLowerCase()}|${location.toLowerCase()}|${radius}`;
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function geocodeLocation(location: string, apiKey: string): Promise<{ lat: number; lng: number }> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.[0]) {
    throw new Error('Location not found');
  }
  return data.results[0].geometry.location;
}

interface SearchLead {
  id: string;
  name: string;
  googleMapsUrl: string;
  websiteUrl: string | null;
  websiteStatus: 'NO_WEBSITE' | 'DIRECTORY_ONLY' | 'HAS_OWN_WEBSITE';
  confidence: number;
  reason: string;
}

function classifyWebsite(websiteUri: string | null | undefined): { status: SearchLead['websiteStatus']; confidence: number; reason: string } {
  if (!websiteUri) {
    return { status: 'NO_WEBSITE', confidence: 1.0, reason: 'No website listed on Google' };
  }
  if (isDirectoryUrl(websiteUri)) {
    return { status: 'DIRECTORY_ONLY', confidence: 0.95, reason: `Directory listing: ${extractDomain(websiteUri)}` };
  }
  return { status: 'HAS_OWN_WEBSITE', confidence: 0.9, reason: 'Has own website' };
}

// ═══════════════════════════════════════════════
// TEXT SEARCH (New API) — minimal fields, paginated
// ═══════════════════════════════════════════════
async function textSearchPlaces(
  keyword: string,
  lat: number,
  lng: number,
  radius: number,
  apiKey: string
): Promise<SearchLead[]> {
  const leads: SearchLead[] = [];
  const seenIds = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < 3 && leads.length < MAX_RESULTS; page++) {
    const requestBody: Record<string, unknown> = {
      textQuery: keyword,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: Math.min(radius, 100000),
        },
      },
      pageSize: 20,
    };
    if (pageToken) requestBody.pageToken = pageToken;

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.googleMapsUri,places.websiteUri,nextPageToken',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Text Search page ${page} failed: ${res.status}`, errText);
      break;
    }

    const data = await res.json();

    for (const place of (data.places || [])) {
      if (leads.length >= MAX_RESULTS) break;

      const placeId = (place.id || '').replace(/^places\//, '');
      if (!placeId || seenIds.has(placeId)) continue;
      seenIds.add(placeId);

      const { status, confidence, reason } = classifyWebsite(place.websiteUri);

      leads.push({
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

    console.log(`Page ${page + 1}: ${leads.length} leads collected`);
  }

  // Sort: NO_WEBSITE first, then DIRECTORY_ONLY, then HAS_OWN_WEBSITE
  const order: Record<string, number> = { NO_WEBSITE: 0, DIRECTORY_ONLY: 1, HAS_OWN_WEBSITE: 2 };
  leads.sort((a, b) => (order[a.websiteStatus] ?? 9) - (order[b.websiteStatus] ?? 9));

  return leads;
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
// MAIN HANDLER
// ═══════════════════════════════════════════════
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Request size guard
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10000) {
      return jsonResponse({ error: 'Request too large' }, 413);
    }

    const body = await req.json();
    const isDemo = body?.demo === true;

    // ─── DEMO MODE ───────────────────────────────
    if (isDemo) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('cf-connecting-ip')
        || 'unknown';
      const demoKey = `demo:${clientIp}`;

      if (!globalThis.__demoSearches) globalThis.__demoSearches = new Set();
      if (globalThis.__demoSearches.has(demoKey)) {
        return jsonResponse({ error: 'Demo search limit reached. Sign up for unlimited access.', code: 'DEMO_LIMIT' }, 402);
      }
      globalThis.__demoSearches.add(demoKey);

      const validationResult = SearchRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return jsonResponse({ error: 'Invalid search parameters.' }, 400);
      }

      const { keyword, location, radius } = validationResult.data;
      const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
      if (!GOOGLE_MAPS_API_KEY) {
        return jsonResponse({ error: 'Service temporarily unavailable.' }, 503);
      }

      console.log(`[DEMO] Searching for "${keyword}" in "${location}" within ${radius}m`);
      const { lat, lng } = await geocodeLocation(location, GOOGLE_MAPS_API_KEY);
      const leads = await textSearchPlaces(keyword, lat, lng, radius, GOOGLE_MAPS_API_KEY);
      console.log(`[DEMO] Found ${leads.length} leads`);

      return jsonResponse({
        leads,
        totalFound: leads.length,
        searchId: crypto.randomUUID(),
        source: 'google',
        cached: false,
      });
    }

    // ─── AUTHENTICATED MODE ──────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Authentication required. Please sign in.' }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return jsonResponse({ error: 'Authentication required. Please sign in.' }, 401);
    }

    const userId = claimsData.claims.sub as string;
    console.log(`Authenticated request from user: ${userId}`);

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
    let isOnAppTrial = false;

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
        // Free search limit check
        const { data: trial } = await serviceClient
          .from('user_trials')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (trial) {
          const currentFreeCount = trial.free_search_count || 0;

          if (currentFreeCount < FREE_SEARCH_LIMIT) {
            console.log(`User ${userId} free search (${currentFreeCount + 1} of ${FREE_SEARCH_LIMIT})`);
            await serviceClient
              .from('user_trials')
              .update({
                free_search_count: currentFreeCount + 1,
                searches_used: trial.searches_used + 1,
                demo_search_used: true,
              })
              .eq('user_id', userId);
            isOnAppTrial = true;
          } else {
            console.log(`User ${userId} exhausted ${FREE_SEARCH_LIMIT} free searches`);
          }
        }

        if (!isOnAppTrial) {
          // Post-abandon single search
          const { data: abandonTrial } = await serviceClient
            .from('user_trials')
            .select('checkout_abandoned, post_abandon_search_used')
            .eq('user_id', userId)
            .maybeSingle();

          if (abandonTrial?.checkout_abandoned && !abandonTrial?.post_abandon_search_used) {
            console.log(`User ${userId} using post-abandon search`);
            await serviceClient
              .from('user_trials')
              .update({ post_abandon_search_used: true })
              .eq('user_id', userId);
            isOnAppTrial = true;
          } else {
            return jsonResponse({
              error: "You've used your free searches. Upgrade to continue.",
              code: 'FREE_SEARCH_EXHAUSTED',
            }, 402);
          }
        }
      }
    } else {
      console.log(`User ${userId} is admin — bypassing limits`);
    }

    // ─── RATE LIMIT ──────────────────────────────
    if (!checkRateLimit(userId)) {
      return jsonResponse({ error: 'Too many requests. Please wait a moment.' }, 429);
    }

    // ─── VALIDATE INPUT ──────────────────────────
    const validationResult = SearchRequestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors);
      return jsonResponse({ error: 'Invalid search parameters. Please check your input.' }, 400);
    }

    const { keyword, location, radius } = validationResult.data;

    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!GOOGLE_MAPS_API_KEY) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return jsonResponse({ error: 'Service temporarily unavailable.' }, 503);
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
      console.log(`Cache HIT for "${keyword}" in "${location}" (${(cached.results as SearchLead[]).length} results)`);

      // Log usage even for cached searches
      try {
        await supabaseClient.rpc('log_usage_event', {
          p_event_type: 'search',
          p_meta: { query: keyword, location, radius, results_count: (cached.results as SearchLead[]).length, cached: true, source: 'google' },
        });
      } catch {}

      return jsonResponse({
        leads: cached.results,
        totalFound: (cached.results as SearchLead[]).length,
        searchId: crypto.randomUUID(),
        source: 'google',
        cached: true,
      });
    }

    // ─── SEARCH ──────────────────────────────────
    console.log(`Searching for "${keyword}" in "${location}" within ${radius}m`);
    const { lat, lng } = await geocodeLocation(location, GOOGLE_MAPS_API_KEY);
    const leads = await textSearchPlaces(keyword, lat, lng, radius, GOOGLE_MAPS_API_KEY);
    console.log(`Found ${leads.length} leads (${leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length} without websites)`);

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
        p_meta: { query: keyword, location, radius, results_count: leads.length, cached: false, source: 'google' },
      });
    } catch (trackingErr) {
      console.error('Usage tracking failed (non-blocking):', trackingErr);
    }

    return jsonResponse({
      leads,
      totalFound: leads.length,
      searchId: crypto.randomUUID(),
      source: 'google',
      cached: false,
    });

  } catch (error) {
    const { message, status } = sanitizeError(error);
    return jsonResponse({ error: message }, status);
  }
});
