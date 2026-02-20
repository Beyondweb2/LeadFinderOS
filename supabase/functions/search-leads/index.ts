import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SearchRequestSchema = z.object({
  keyword: z.string().min(1).max(100).transform(s => s.trim()),
  location: z.string().min(1).max(200).transform(s => s.trim()),
  radius: z.number().int().min(100).max(25000).default(5000),
  minRating: z.number().min(0).max(5).optional(),
  minReviews: z.number().int().min(0).max(10000).default(2),
  skipTrialCount: z.boolean().default(false),
  requirePhone: z.boolean().default(true),
  deepSearch: z.boolean().default(false),
  demo: z.boolean().default(false),
  country: z.enum(['UK', 'USA']).optional().default('UK'),
});

// ── Country code mapping ──
const COUNTRY_CODES: Record<string, string> = {
  'UK': 'gb',
  'USA': 'us',
};

// ── Directory / platform blacklist ──
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
  /\.myshopify\.com$/i,
  /\.wixsite\.com$/i,
  /\.webflow\.io$/i,
  /\.squarespace\.com$/i,
  /\.wordpress\.com$/i,
  /\.blogspot\.com$/i,
  /\.godaddysites\.com$/i,
  /\.weebly\.com$/i,
  /\.carrd\.co$/i,
  /\.notion\.site$/i,
];

interface Lead {
  id: string;
  name: string;
  category?: string;
  address: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUrl: string;
  websiteUrl?: string;
  websiteStatus: 'NO_WEBSITE' | 'DIRECTORY_ONLY' | 'HAS_OWN_WEBSITE' | 'UNCERTAIN';
  confidence: number;
  reason: string;
  businessStatus?: string;
}

// ── Rate limiter ──
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

// ── URL helpers ──
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
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

function normalizeForComparison(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/limited|ltd|llc|inc|corp|co|plc|services|service/g, '');
}

function domainMatchesBusiness(domain: string, businessName: string): { matches: boolean; confidence: number; reason: string } {
  const normalizedDomain = normalizeForComparison(domain.replace(/\.(com|co\.uk|org|net|uk|io|biz)$/i, ''));
  const normalizedName = normalizeForComparison(businessName);
  if (normalizedDomain.length >= 4 && normalizedName.includes(normalizedDomain)) {
    return { matches: true, confidence: 0.9, reason: `Domain "${domain}" contains business name pattern` };
  }
  if (normalizedName.length >= 4 && normalizedDomain.includes(normalizedName)) {
    return { matches: true, confidence: 0.85, reason: `Business name matches domain "${domain}"` };
  }
  const domainWords = normalizedDomain.match(/.{3,}/g) || [];
  for (const dWord of domainWords) {
    if (dWord.length >= 4 && normalizedName.includes(dWord)) {
      return { matches: true, confidence: 0.75, reason: `Domain contains keyword "${dWord}" from business name` };
    }
  }
  return { matches: false, confidence: 0, reason: '' };
}

// ── AI classification ──
async function classifyWithAI(
  businessName: string,
  websiteUrl: string,
  category?: string
): Promise<{ status: 'HAS_OWN_WEBSITE' | 'DIRECTORY_ONLY' | 'UNCERTAIN'; confidence: number; reason: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const domain = extractDomain(websiteUrl);

  if (domain) {
    const heuristicResult = domainMatchesBusiness(domain, businessName);
    if (heuristicResult.matches && heuristicResult.confidence >= 0.85) {
      return { status: 'HAS_OWN_WEBSITE', confidence: heuristicResult.confidence, reason: heuristicResult.reason };
    }
  }

  if (!LOVABLE_API_KEY) {
    return { status: 'UNCERTAIN', confidence: 0.3, reason: 'AI verification unavailable' };
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert website classifier for a lead generation tool. Determine if a URL represents a business's OWN website or a directory/listing page.

CLASSIFICATION RULES:
- HAS_OWN_WEBSITE: Domain appears owned by the business
- DIRECTORY_ONLY: URL is a listing on a third-party site
- UNCERTAIN: Cannot determine

Respond ONLY with valid JSON: {"status": "HAS_OWN_WEBSITE" | "DIRECTORY_ONLY" | "UNCERTAIN", "confidence": 0.0-1.0, "reason": "brief explanation"}`,
          },
          {
            role: 'user',
            content: `Business Name: ${businessName}\nCategory: ${category || 'Unknown'}\nWebsite URL: ${websiteUrl}\nDomain: ${domain}`,
          },
        ],
      }),
    });

    if (response.status === 429) return { status: 'UNCERTAIN', confidence: 0.4, reason: 'Rate limited' };
    if (!response.ok) return { status: 'UNCERTAIN', confidence: 0.3, reason: 'AI verification failed' };

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { status: 'UNCERTAIN', confidence: 0.3, reason: 'AI returned empty response' };

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        status: parsed.status || 'UNCERTAIN',
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reason: parsed.reason || 'AI classification',
      };
    }
    return { status: 'UNCERTAIN', confidence: 0.3, reason: 'Could not parse AI response' };
  } catch (error) {
    console.error('AI classification error:', error);
    return { status: 'UNCERTAIN', confidence: 0.3, reason: 'AI verification error' };
  }
}

// ══════════════════════════════════════════════════════════
// ── Geoapify Geocoding ──
// ══════════════════════════════════════════════════════════
async function geocodeLocation(
  location: string,
  country: string,
  apiKey: string
): Promise<{ lat: number; lng: number }> {
  const countryCode = COUNTRY_CODES[country] || 'gb';
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(location)}&filter=countrycode:${countryCode}&limit=1&apiKey=${apiKey}`;

  const res = await fetch(url);
  if (res.status === 401) {
    console.error('Geoapify geocoding 401: Invalid API key');
    throw new Error('Search service authentication error. Please contact support.');
  }
  if (res.status === 400) {
    const errBody = await res.text();
    console.error('Geoapify geocoding 400:', errBody);
    throw new Error('Invalid location. Please check and try again.');
  }
  if (!res.ok) {
    console.error('Geoapify geocoding HTTP error:', res.status);
    throw new Error('Location not found');
  }

  const data = await res.json();
  const feature = data?.features?.[0];
  if (!feature) {
    console.error('Geoapify geocoding: no results for', location);
    throw new Error('Location not found');
  }

  const { lat, lon } = feature.properties;
  console.log(`Geocoded "${location}" (${countryCode}) → ${lat}, ${lon}`);
  return { lat, lng: lon };
}

// ══════════════════════════════════════════════════════════
// ── Geoapify Places search with circle filter ──
// ══════════════════════════════════════════════════════════
interface GeoapifyFeature {
  properties: {
    name?: string;
    categories?: string[];
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    country_code?: string;
    lat: number;
    lon: number;
    place_id?: string;
    contact?: { phone?: string; email?: string };
    website?: string;
    datasource?: any;
  };
}

// ── Keyword variant generator ──
function generateKeywordVariants(keyword: string): string[] {
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed) return [];
  const variants: string[] = [trimmed];

  // Singular form
  if (trimmed.endsWith('s') && trimmed.length > 3) {
    const singular = trimmed.slice(0, -1);
    if (!variants.includes(singular)) variants.push(singular);
  }

  // Electrician-specific expansions
  const electricianTerms = ['electrician', 'electricians'];
  if (electricianTerms.includes(trimmed) || trimmed === 'electrical' || trimmed === 'electric') {
    for (const extra of ['electrical', 'electric']) {
      if (!variants.includes(extra)) variants.push(extra);
    }
  }

  return variants;
}

const BASE_CATEGORIES = 'service';
const BROAD_CATEGORIES = 'service,office.company,office.association,office.consulting,office.financial,office.advertising_agency';

// ── Single Geoapify Places API call (low-level) ──
async function fetchGeoapifyPlaces(
  categories: string,
  lat: number,
  lng: number,
  radius: number,
  apiKey: string,
  nameFilter?: string
): Promise<GeoapifyFeature[]> {
  let url = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${lng},${lat},${radius}&conditions=named&limit=50&apiKey=${apiKey}`;
  if (nameFilter) {
    url += `&name=${encodeURIComponent(nameFilter)}`;
  }

  const res = await fetch(url);
  if (res.status === 401) {
    console.error('Geoapify 401: Invalid API key');
    throw new Error('Search service authentication error. Please contact support.');
  }
  if (res.status === 400) {
    const errBody = await res.text();
    console.error('Geoapify 400:', errBody);
    throw new Error('Invalid search parameters. Please adjust and try again.');
  }
  if (!res.ok) {
    console.error('Geoapify Places HTTP error:', res.status);
    throw new Error('Search service temporarily unavailable');
  }

  const data = await res.json();
  const features: GeoapifyFeature[] = data?.features || [];

  // Deduplicate by place_id
  const seen = new Set<string>();
  return features.filter(f => {
    const pid = f.properties.place_id;
    if (!pid || seen.has(pid)) return false;
    seen.add(pid);
    return !!f.properties.name;
  });
}

// ── Geoapify Places search with fallback strategy ──
async function searchPlacesGeoapify(
  keyword: string,
  lat: number,
  lng: number,
  radius: number,
  apiKey: string
): Promise<{ features: GeoapifyFeature[]; fallbackUsed: boolean }> {
  const variants = generateKeywordVariants(keyword);
  let apiCalls = 0;
  const MAX_CALLS = 3;

  console.log(`[SEARCH] Starting fallback search: keyword="${keyword}", variants=${JSON.stringify(variants)}`);

  // ── Attempt A: categories=service with name= variants ──
  for (const variant of variants) {
    if (apiCalls >= MAX_CALLS) break;
    apiCalls++;
    const results = await fetchGeoapifyPlaces(BASE_CATEGORIES, lat, lng, radius, apiKey, variant);
    console.log(`[SEARCH] Attempt A with variant "${variant}" -> ${results.length} results`);
    if (results.length > 0) {
      console.log(`[SEARCH] Success: Attempt A, variant "${variant}"`);
      return { features: results, fallbackUsed: false };
    }
  }

  // ── Attempt B: broad categories with name= variants ──
  for (const variant of variants) {
    if (apiCalls >= MAX_CALLS) break;
    apiCalls++;
    const results = await fetchGeoapifyPlaces(BROAD_CATEGORIES, lat, lng, radius, apiKey, variant);
    console.log(`[SEARCH] Attempt B with variant "${variant}" -> ${results.length} results`);
    if (results.length > 0) {
      console.log(`[SEARCH] Success: Attempt B, variant "${variant}"`);
      return { features: results, fallbackUsed: false };
    }
  }

  // ── Attempt C: broad categories, no name filter ──
  if (apiCalls < MAX_CALLS && variants.length > 0) {
    apiCalls++;
    const results = await fetchGeoapifyPlaces(BROAD_CATEGORIES, lat, lng, radius, apiKey);
    console.log(`[SEARCH] Attempt C (no name filter) -> ${results.length} results`);
    if (results.length > 0) {
      console.log(`[SEARCH] Success: Attempt C (fallback, no name filter)`);
      return { features: results, fallbackUsed: true };
    }
  }

  console.log(`[SEARCH] All attempts exhausted. ${apiCalls} API calls made, 0 results.`);
  return { features: [], fallbackUsed: false };
}

// ── Convert Geoapify feature to Lead ──
function geoapifyCategoryLabel(categories: string[]): string | undefined {
  if (!categories || categories.length === 0) return undefined;
  // Use the most specific category and humanize it
  const best = categories.reduce((a, b) => (b.split('.').length > a.split('.').length ? b : a), categories[0]);
  return best
    .split('.')
    .pop()
    ?.replace(/_/g, ' ')
    ?.replace(/\b\w/g, c => c.toUpperCase());
}

async function processGeoapifyFeature(
  feature: GeoapifyFeature,
  skipAI: boolean = false
): Promise<Lead | null> {
  const p = feature.properties;
  if (!p.name) return null;

  const phone = p.contact?.phone || p.datasource?.raw?.phone || null;
  const websiteUrl = p.website || p.datasource?.raw?.website || null;
  const address = p.formatted || [p.address_line1, p.address_line2].filter(Boolean).join(', ') || '';
  const category = geoapifyCategoryLabel(p.categories || []);

  // Build OSM link if osm_type and osm_id are available, otherwise fall back to Google Maps search
  let mapUrl: string;
  const osmType = p.datasource?.raw?.osm_type;
  const osmId = p.datasource?.raw?.osm_id;
  if (osmType && osmId) {
    const osmTypeMap: Record<string, string> = { N: 'node', n: 'node', W: 'way', w: 'way', R: 'relation', r: 'relation' };
    const mappedType = osmTypeMap[osmType] || osmType;
    mapUrl = `https://www.openstreetmap.org/${mappedType}/${osmId}`;
  } else {
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' ' + address)}`;
  }

  let websiteStatus: Lead['websiteStatus'];
  let confidence: number;
  let reason: string;

  if (!websiteUrl) {
    websiteStatus = 'NO_WEBSITE';
    confidence = 1.0;
    reason = 'No website found for this business';
  } else if (isDirectoryUrl(websiteUrl)) {
    websiteStatus = 'DIRECTORY_ONLY';
    confidence = 0.95;
    reason = `Website is a directory/platform: ${extractDomain(websiteUrl)}`;
  } else if (skipAI) {
    websiteStatus = 'HAS_OWN_WEBSITE';
    confidence = 0.7;
    reason = 'Has own website (demo - no AI verification)';
  } else {
    const aiResult = await classifyWithAI(p.name, websiteUrl, category);
    websiteStatus = aiResult.status;
    confidence = aiResult.confidence;
    reason = aiResult.reason;
  }

  return {
    id: p.place_id || crypto.randomUUID(),
    name: p.name,
    category,
    address,
    phone: phone || undefined,
    rating: undefined,
    reviewCount: undefined,
    googleMapsUrl: mapUrl,
    websiteUrl: websiteUrl || undefined,
    websiteStatus,
    confidence,
    reason,
    businessStatus: undefined,
  };
}

// ── Error sanitization ──
function sanitizeError(error: unknown): { message: string; status: number } {
  if (error instanceof z.ZodError) {
    return { message: 'Invalid input: ' + error.errors.map(e => e.message).join(', '), status: 400 };
  }
  if (error instanceof Error) {
    console.error('Detailed error:', error);
    if (error.message === 'Location not found') {
      return { message: 'Location not found. Please check the address and try again.', status: 400 };
    }
    if (error.message.includes('authentication error')) {
      return { message: 'Search service is temporarily unavailable. Please try again later.', status: 503 };
    }
    if (error.message.includes('Invalid location') || error.message.includes('Invalid search parameters')) {
      return { message: error.message, status: 400 };
    }
    if (error.message.includes('Search service')) {
      return { message: 'Search service temporarily unavailable. Please try again later.', status: 503 };
    }
  }
  return { message: 'An unexpected error occurred. Please try again.', status: 500 };
}

// ══════════════════════════════════════════════════════════
// ── Main handler ──
// ══════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10000) {
      return new Response(JSON.stringify({ error: 'Request too large' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const isDemo = body?.demo === true;

    // ─── DEMO MODE ───
    if (isDemo) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('cf-connecting-ip')
        || 'unknown';
      const demoKey = `demo:${clientIp}`;

      if (!globalThis.__demoSearches) globalThis.__demoSearches = new Set();
      if (globalThis.__demoSearches.has(demoKey)) {
        return new Response(
          JSON.stringify({ error: 'Demo search limit reached. Sign up for unlimited access.', code: 'DEMO_LIMIT' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      globalThis.__demoSearches.add(demoKey);

      const validationResult = SearchRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return new Response(JSON.stringify({ error: 'Invalid search parameters.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { keyword, location, radius, requirePhone, country } = validationResult.data;

      const GEOAPIFY_API_KEY = Deno.env.get('GEOAPIFY_API_KEY');
      if (!GEOAPIFY_API_KEY) {
        return new Response(JSON.stringify({ error: 'Service temporarily unavailable.' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[DEMO] Searching "${keyword}" in "${location}" (${country}) radius=${radius}m`);
      const { lat, lng } = await geocodeLocation(location, country, GEOAPIFY_API_KEY);
      const { features, fallbackUsed } = await searchPlacesGeoapify(keyword, lat, lng, radius, GEOAPIFY_API_KEY);

      const leads: Lead[] = [];
      for (const feature of features) {
        if (leads.length >= 50) break;
        try {
          if (requirePhone && !feature.properties.contact?.phone) continue;
          const lead = await processGeoapifyFeature(feature, true);
          if (lead) leads.push(lead);
        } catch (e) {
          console.error('[DEMO] Error processing feature:', e);
        }
      }

      leads.sort((a, b) => {
        const order = { NO_WEBSITE: 0, DIRECTORY_ONLY: 1, UNCERTAIN: 2, HAS_OWN_WEBSITE: 3 };
        return order[a.websiteStatus] - order[b.websiteStatus];
      });

      return new Response(JSON.stringify({ leads, fallbackUsed }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── AUTHENTICATED MODE ───
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required. Please sign in.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Authentication required. Please sign in.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub as string;
    console.log(`Authenticated request from user: ${userId}`);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // ── Admin check ──
    const { data: roleData } = await serviceClient
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    const isAdmin = !!roleData;

    // ── Subscription / trial gating ──
    let hasActiveSubscription = false;
    let isOnAppTrial = false;

    if (!isAdmin) {
      const { data: subscription } = await serviceClient
        .from('subscriptions').select('status').eq('user_id', userId).maybeSingle();

      const fullAccessStatuses = ['active', 'past_due', 'trialing'];
      hasActiveSubscription = subscription && fullAccessStatuses.includes(subscription.status);

      console.log(`[SEARCH-LEADS] userId=${userId} subStatus=${subscription?.status ?? 'none'} hasProAccess=${hasActiveSubscription}`);

      if (hasActiveSubscription) {
        // unlimited
      } else {
        const { data: trial } = await serviceClient
          .from('user_trials').select('*').eq('user_id', userId).maybeSingle();

        if (trial) {
          const currentFreeCount = trial.free_search_count || 0;
          const FREE_SEARCH_LIMIT = 3;

          if (currentFreeCount < FREE_SEARCH_LIMIT) {
            console.log(`User ${userId} free search ${currentFreeCount + 1}/${FREE_SEARCH_LIMIT}`);
            await serviceClient.from('user_trials').update({
              free_search_count: currentFreeCount + 1,
              searches_used: trial.searches_used + 1,
              demo_search_used: true,
            }).eq('user_id', userId);
            isOnAppTrial = true;
          }
        }

        if (!isOnAppTrial) {
          const { data: abandonTrial } = await serviceClient
            .from('user_trials')
            .select('checkout_abandoned, post_abandon_search_used')
            .eq('user_id', userId).maybeSingle();

          if (abandonTrial?.checkout_abandoned && !abandonTrial?.post_abandon_search_used) {
            await serviceClient.from('user_trials')
              .update({ post_abandon_search_used: true }).eq('user_id', userId);
            isOnAppTrial = true;
          } else {
            return new Response(
              JSON.stringify({ error: "You've used your free searches. Upgrade to continue.", code: 'FREE_SEARCH_EXHAUSTED' }),
              { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    }

    // Rate limit
    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate
    const validationResult = SearchRequestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors);
      return new Response(JSON.stringify({ error: 'Invalid search parameters.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { keyword, location, radius, requirePhone, country } = validationResult.data;

    const GEOAPIFY_API_KEY = Deno.env.get('GEOAPIFY_API_KEY');
    if (!GEOAPIFY_API_KEY) {
      console.error('GEOAPIFY_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Service temporarily unavailable.' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Searching "${keyword}" in "${location}" (${country}) radius=${radius}m`);

    // ── Geocode + Search ──
    const { lat, lng } = await geocodeLocation(location, country, GEOAPIFY_API_KEY);
    const { features, fallbackUsed } = await searchPlacesGeoapify(keyword, lat, lng, radius, GEOAPIFY_API_KEY);

    // ── Process results ──
    const leads: Lead[] = [];
    for (const feature of features) {
      if (leads.length >= 50) break;
      try {
        if (requirePhone && !feature.properties.contact?.phone) continue;
        const lead = await processGeoapifyFeature(feature, false);
        if (lead) leads.push(lead);
      } catch (err) {
        console.error('Error processing feature:', err);
      }
    }

    // Sort: NO_WEBSITE first
    leads.sort((a, b) => {
      const order = { NO_WEBSITE: 0, DIRECTORY_ONLY: 1, UNCERTAIN: 2, HAS_OWN_WEBSITE: 3 };
      return order[a.websiteStatus] - order[b.websiteStatus];
    });

    console.log(`Returning ${leads.length} leads`);

    // Track usage (non-blocking)
    try {
      await supabaseClient.rpc('log_usage_event', {
        p_event_type: 'search',
        p_meta: { query: keyword, location, radius, results_count: leads.length, source: 'search-leads' },
      });
    } catch (trackingErr) {
      console.error('Usage tracking failed (non-blocking):', trackingErr);
    }

    return new Response(
      JSON.stringify({ leads, totalFound: leads.length, searchId: crypto.randomUUID(), fallbackUsed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const { message, status } = sanitizeError(error);
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
