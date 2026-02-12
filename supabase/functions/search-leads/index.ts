import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// CORS headers - allow all Lovable domains
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Input validation schema
const SearchRequestSchema = z.object({
  keyword: z.string()
    .min(1, 'Keyword is required')
    .max(100, 'Keyword must be less than 100 characters')
    .transform(s => s.trim()),
  location: z.string()
    .min(1, 'Location is required')
    .max(200, 'Location must be less than 200 characters')
    .transform(s => s.trim()),
  radius: z.number()
    .int('Radius must be an integer')
    .min(100, 'Minimum radius is 100 meters')
    .max(100000, 'Maximum radius is 100km')
    .default(5000),
  minRating: z.number()
    .min(0, 'Rating must be between 0 and 5')
    .max(5, 'Rating must be between 0 and 5')
    .optional(),
  minReviews: z.number()
    .int('Review count must be an integer')
    .min(0, 'Review count cannot be negative')
    .max(10000, 'Review count limit is 10000')
    .default(2), // Default to 2 minimum reviews to filter out inactive businesses
  skipTrialCount: z.boolean()
    .default(false), // Skip counting this search toward trial limit (for auto-demo searches)
  requirePhone: z.boolean()
    .default(true), // Default to requiring a phone number
  deepSearch: z.boolean()
    .default(false), // Enable grid-based multi-point search
});

// Directory / Platform Blacklist - URLs that don't count as having a website
const DIRECTORY_BLACKLIST = new Set([
  // Social
  'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 
  'linkedin.com', 'youtube.com', 'pinterest.com', 'snapchat.com',
  // UK Directories
  'yell.com', 'thomsonlocal.com', 'yelp.com', 'yelp.co.uk', 'checkatrade.com',
  'mybuilder.com', 'bark.com', 'trustatrader.com', 'ratedpeople.com', 
  'freeindex.co.uk', 'yell.co.uk', 'scoot.co.uk', 'hotfrog.co.uk',
  // Travel / Food aggregators
  'tripadvisor.com', 'tripadvisor.co.uk', 'booking.com', 'airbnb.com',
  'justeat.co.uk', 'justeat.com', 'deliveroo.com', 'deliveroo.co.uk', 
  'ubereats.com', 'opentable.com', 'opentable.co.uk',
  // Generic platforms
  'google.com', 'maps.google.com', 'business.google.com',
  'apple.com', 'bing.com',
]);

// Platform subdomains that don't count as having a website
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

// Rate limiter for per-user request throttling
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = rateLimiter.get(userId);
  
  if (!limit || now > limit.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + 60000 }); // 1 minute window
    return true;
  }
  
  if (limit.count >= 10) { // 10 requests per minute
    return false;
  }
  
  limit.count++;
  return true;
}

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
  
  // Check exact match in blacklist
  if (DIRECTORY_BLACKLIST.has(domain)) return true;
  
  // Check if it's a subdomain of a blacklisted domain
  for (const blocked of DIRECTORY_BLACKLIST) {
    if (domain.endsWith(`.${blocked}`)) return true;
  }
  
  // Check platform patterns
  for (const pattern of PLATFORM_PATTERNS) {
    if (pattern.test(domain)) return true;
  }
  
  return false;
}

// Normalize business name for comparison (lowercase, remove special chars)
function normalizeForComparison(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/limited|ltd|llc|inc|corp|co|plc|services|service/g, '');
}

// Check if domain likely belongs to the business (heuristic)
function domainMatchesBusiness(domain: string, businessName: string): { matches: boolean; confidence: number; reason: string } {
  const normalizedDomain = normalizeForComparison(domain.replace(/\.(com|co\.uk|org|net|uk|io|biz)$/i, ''));
  const normalizedName = normalizeForComparison(businessName);
  
  // Strong match: domain contains significant part of business name
  if (normalizedDomain.length >= 4 && normalizedName.includes(normalizedDomain)) {
    return { 
      matches: true, 
      confidence: 0.9, 
      reason: `Domain "${domain}" contains business name pattern` 
    };
  }
  
  // Strong match: business name contains domain
  if (normalizedName.length >= 4 && normalizedDomain.includes(normalizedName)) {
    return { 
      matches: true, 
      confidence: 0.85, 
      reason: `Business name matches domain "${domain}"` 
    };
  }
  
  // Partial match: check for word overlap
  const domainWords = normalizedDomain.match(/.{3,}/g) || [];
  const nameWords = normalizedName.match(/.{3,}/g) || [];
  
  for (const dWord of domainWords) {
    if (dWord.length >= 4 && normalizedName.includes(dWord)) {
      return { 
        matches: true, 
        confidence: 0.75, 
        reason: `Domain contains keyword "${dWord}" from business name` 
      };
    }
  }
  
  return { matches: false, confidence: 0, reason: '' };
}

async function classifyWithAI(
  businessName: string,
  websiteUrl: string,
  category?: string
): Promise<{ status: 'HAS_OWN_WEBSITE' | 'DIRECTORY_ONLY' | 'UNCERTAIN'; confidence: number; reason: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const domain = extractDomain(websiteUrl);
  
  // First, apply heuristic check - if domain clearly matches business name, it's likely their site
  if (domain) {
    const heuristicResult = domainMatchesBusiness(domain, businessName);
    if (heuristicResult.matches && heuristicResult.confidence >= 0.85) {
      console.log(`Heuristic match for ${businessName}: ${heuristicResult.reason}`);
      return {
        status: 'HAS_OWN_WEBSITE',
        confidence: heuristicResult.confidence,
        reason: heuristicResult.reason,
      };
    }
  }
  
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return {
      status: 'UNCERTAIN',
      confidence: 0.3,
      reason: 'AI verification unavailable',
    };
  }
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert website classifier for a lead generation tool. Your job is to determine if a URL represents a business's OWN website or just a directory/listing/profile page.

THINK STEP BY STEP:
1. Does the domain contain the business name or key words from it? (e.g., "liteupelectrical.com" for "Lite-Up Electrical Services" = likely their own site)
2. Is this a known directory, marketplace, review site, or social media platform?
3. Does the URL structure suggest a profile page? (e.g., /biz/, /profile/, /p/, /business/)

CLASSIFICATION RULES:
- HAS_OWN_WEBSITE: The domain appears to be owned by the business (contains their name/brand, .com/.co.uk with relevant keywords)
- DIRECTORY_ONLY: The URL is clearly a listing on a third-party site (directories like yell.com, yelp.com, checkatrade, social media, review aggregators, food delivery apps, etc.)
- UNCERTAIN: Cannot determine (generic domain, unclear ownership, parked/broken domain)

IMPORTANT HEURISTICS:
- If domain contains business name words → likely HAS_OWN_WEBSITE (e.g., "smithplumbing.co.uk" for "Smith Plumbing")
- If URL path contains /biz/, /business/, /profile/, /listing/ → likely DIRECTORY_ONLY
- Facebook, Instagram, Yelp, TripAdvisor, Google, etc. are ALWAYS directories
- Generic domain + business keywords in domain → likely HAS_OWN_WEBSITE

Respond ONLY with valid JSON in this exact format:
{"status": "HAS_OWN_WEBSITE" | "DIRECTORY_ONLY" | "UNCERTAIN", "confidence": 0.0-1.0, "reason": "brief explanation of your reasoning"}`,
          },
          {
            role: 'user',
            content: `Classify this website for lead generation purposes:

Business Name: ${businessName}
Business Category: ${category || 'Unknown'}
Website URL: ${websiteUrl}
Domain: ${domain}

Think about whether "${domain}" looks like it could be the business's own branded domain or a third-party directory page.`,
          },
        ],
      }),
    });

    if (response.status === 429) {
      console.warn('AI rate limited');
      return {
        status: 'UNCERTAIN',
        confidence: 0.4,
        reason: 'Rate limited - classification pending',
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI classification error:', response.status, errorText);
      return {
        status: 'UNCERTAIN',
        confidence: 0.3,
        reason: 'AI verification failed',
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      return {
        status: 'UNCERTAIN',
        confidence: 0.3,
        reason: 'AI returned empty response',
      };
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        status: parsed.status || 'UNCERTAIN',
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reason: parsed.reason || 'AI classification',
      };
    }

    return {
      status: 'UNCERTAIN',
      confidence: 0.3,
      reason: 'Could not parse AI response',
    };
  } catch (error) {
    console.error('AI classification error:', error);
    return {
      status: 'UNCERTAIN',
      confidence: 0.3,
      reason: 'AI verification error',
    };
  }
}

// Generate grid points for deep search with better coverage
function generateGridPoints(centerLat: number, centerLng: number, radiusMeters: number): Array<{lat: number, lng: number, radius: number}> {
  const points: Array<{lat: number, lng: number, radius: number}> = [];
  
  // Determine grid dimensions based on search radius - increased density for better coverage
  let gridSize: number;
  let cellRadius: number;
  let overlapFactor: number;
  
  if (radiusMeters >= 80000) {
    gridSize = 7; // 7x7 = 49 points for 80km+
    cellRadius = radiusMeters / 5;
    overlapFactor = 0.6; // 60% overlap for maximum coverage
  } else if (radiusMeters >= 40000) {
    gridSize = 6; // 6x6 = 36 points for 40-80km
    cellRadius = radiusMeters / 4;
    overlapFactor = 0.5;
  } else if (radiusMeters >= 20000) {
    gridSize = 5; // 5x5 = 25 points for 20-40km
    cellRadius = radiusMeters / 3;
    overlapFactor = 0.5;
  } else if (radiusMeters >= 10000) {
    gridSize = 4; // 4x4 = 16 points for 10-20km
    cellRadius = radiusMeters / 2;
    overlapFactor = 0.4;
  } else if (radiusMeters >= 5000) {
    gridSize = 3; // 3x3 = 9 points for 5-10km
    cellRadius = radiusMeters / 1.5;
    overlapFactor = 0.4;
  } else {
    gridSize = 2; // 2x2 = 4 points for smaller areas
    cellRadius = radiusMeters;
    overlapFactor = 0.3;
  }
  
  // Ensure minimum cell radius for API efficiency
  cellRadius = Math.max(cellRadius, 1000);
  
  // Calculate step size with overlap (in degrees)
  // 1 degree latitude ≈ 111km, longitude varies by latitude
  const effectiveStep = (radiusMeters * 2 * (1 - overlapFactor)) / (gridSize - 1);
  const latStep = effectiveStep / 111000;
  const lngStep = latStep / Math.cos(centerLat * Math.PI / 180);
  
  // Generate grid centered on the search location
  const halfGrid = (gridSize - 1) / 2;
  
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const lat = centerLat + (i - halfGrid) * latStep;
      const lng = centerLng + (j - halfGrid) * lngStep;
      points.push({ lat, lng, radius: cellRadius });
    }
  }
  
  // Always add center point to ensure we cover the exact search location
  if (!points.some(p => p.lat === centerLat && p.lng === centerLng)) {
    points.unshift({ lat: centerLat, lng: centerLng, radius: cellRadius });
  }
  
  return points;
}

// Geocode a location to get coordinates
async function geocodeLocation(location: string, apiKey: string): Promise<{lat: number, lng: number}> {
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
  const geocodeRes = await fetch(geocodeUrl);
  const geocodeData = await geocodeRes.json();
  
  if (geocodeData.status !== 'OK' || !geocodeData.results?.[0]) {
    console.error('Geocoding failed:', geocodeData.status);
    throw new Error('Location not found');
  }
  
  return geocodeData.results[0].geometry.location;
}

// Search places at a specific coordinate with pagination
async function searchPlacesAtPoint(
  keyword: string,
  lat: number,
  lng: number,
  radius: number,
  apiKey: string
): Promise<any[]> {
  const allResults: any[] = [];
  let nextPageToken: string | undefined;
  let pageCount = 0;
  const maxPages = 3; // Google allows up to 3 pages of results (60 total)
  
  do {
    const searchUrl = nextPageToken
      ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${nextPageToken}&key=${apiKey}`
      : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    
    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      console.error('Places search failed:', searchData.status, searchData.error_message);
      break;
    }
    
    allResults.push(...(searchData.results || []));
    nextPageToken = searchData.next_page_token;
    pageCount++;
    
    // Google requires a short delay before using the next_page_token
    if (nextPageToken && pageCount < maxPages) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } while (nextPageToken && pageCount < maxPages);
  
  return allResults;
}

// Text search for additional coverage (different ranking algorithm)
async function textSearchAtPoint(
  keyword: string,
  lat: number,
  lng: number,
  radius: number,
  apiKey: string
): Promise<any[]> {
  const allResults: any[] = [];
  let nextPageToken: string | undefined;
  let pageCount = 0;
  const maxPages = 2;
  
  do {
    const searchUrl = nextPageToken
      ? `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${nextPageToken}&key=${apiKey}`
      : `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(keyword)}&location=${lat},${lng}&radius=${radius}&key=${apiKey}`;
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    
    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      break;
    }
    
    allResults.push(...(searchData.results || []));
    nextPageToken = searchData.next_page_token;
    pageCount++;
    
    if (nextPageToken && pageCount < maxPages) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } while (nextPageToken && pageCount < maxPages);
  
  return allResults;
}

async function searchPlaces(
  keyword: string,
  location: string,
  radius: number,
  apiKey: string,
  deepSearch: boolean = false
): Promise<any[]> {
  // Geocode the location first
  const { lat, lng } = await geocodeLocation(location, apiKey);
  
  // Always use enhanced search for better coverage
  // Standard search combines nearby + text search at center
  const seenPlaceIds = new Set<string>();
  const allResults: any[] = [];
  
  const addResults = (results: any[]) => {
    for (const place of results) {
      if (!seenPlaceIds.has(place.place_id)) {
        seenPlaceIds.add(place.place_id);
        allResults.push(place);
      }
    }
  };
  
  if (!deepSearch) {
    // Standard search: nearby + text search at center for better coverage
    const [nearbyResults, textResults] = await Promise.all([
      searchPlacesAtPoint(keyword, lat, lng, radius, apiKey),
      textSearchAtPoint(keyword, lat, lng, radius, apiKey)
    ]);
    
    addResults(nearbyResults);
    addResults(textResults);
    
    console.log(`Standard search: ${nearbyResults.length} nearby + ${textResults.length} text = ${allResults.length} unique`);
    return allResults;
  }
  
  // Deep search: grid-based multi-point search with both nearby and text
  console.log(`Deep search enabled: generating grid for ${radius}m radius`);
  const gridPoints = generateGridPoints(lat, lng, radius);
  console.log(`Generated ${gridPoints.length} grid points`);
  
  // Process in batches to avoid overwhelming the API
  const batchSize = 4;
  for (let i = 0; i < gridPoints.length; i += batchSize) {
    const batch = gridPoints.slice(i, i + batchSize);
    
    // Run nearby search for each point in batch
    const nearbyBatch = await Promise.all(
      batch.map(point => 
        searchPlacesAtPoint(keyword, point.lat, point.lng, point.radius, apiKey)
          .catch(err => {
            console.error(`Nearby search error at (${point.lat}, ${point.lng}):`, err);
            return [];
          })
      )
    );
    
    for (const results of nearbyBatch) {
      addResults(results);
    }
    
    // For large searches, also run text search on some grid points
    if (radius >= 20000 && i % (batchSize * 2) === 0) {
      const textBatch = await Promise.all(
        batch.slice(0, 2).map(point => 
          textSearchAtPoint(keyword, point.lat, point.lng, point.radius, apiKey)
            .catch(() => [])
        )
      );
      
      for (const results of textBatch) {
        addResults(results);
      }
    }
    
    console.log(`Batch ${Math.floor(i / batchSize) + 1}: Found ${allResults.length} unique places so far`);
    
    // Small delay between batches
    if (i + batchSize < gridPoints.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return allResults;
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<any> {
  // Use the new Google Places API v1 for better data including primaryTypeDisplayName
  const fieldMask = [
    'displayName',
    'formattedAddress',
    'location',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'rating',
    'userRatingCount',
    'websiteUri',
    'googleMapsUri',
    'businessStatus',
    'types',
    'primaryType',
    'primaryTypeDisplayName',
  ].join(',');
  
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  });
  
  if (!res.ok) {
    console.warn('Place details failed for', placeId, ':', res.status);
    return null;
  }
  
  const data = await res.json();
  
  // Map new API response to legacy field names for compatibility
  return {
    name: data.displayName?.text,
    formatted_address: data.formattedAddress,
    formatted_phone_number: data.nationalPhoneNumber,
    international_phone_number: data.internationalPhoneNumber,
    rating: data.rating,
    user_ratings_total: data.userRatingCount,
    website: data.websiteUri,
    url: data.googleMapsUri,
    business_status: data.businessStatus,
    types: data.types,
    primaryType: data.primaryType,
    primaryTypeDisplayName: data.primaryTypeDisplayName?.text,
  };
}

// Error sanitization - return safe messages to clients
function sanitizeError(error: unknown): { message: string; status: number } {
  if (error instanceof z.ZodError) {
    return {
      message: 'Invalid input: ' + error.errors.map(e => e.message).join(', '),
      status: 400
    };
  }
  
  if (error instanceof Error) {
    console.error('Detailed error:', error);
    
    if (error.message === 'Location not found') {
      return {
        message: 'Location not found. Please check the address and try again.',
        status: 400
      };
    }
    
    if (error.message.includes('Search service')) {
      return {
        message: 'Search service temporarily unavailable. Please try again later.',
        status: 503
      };
    }
  }
  
  return {
    message: 'An unexpected error occurred. Please try again.',
    status: 500
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check request size limit (10KB max)
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10000) {
      return new Response(
        JSON.stringify({ error: 'Request too large' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required. Please sign in.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Authentication required. Please sign in.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;
    console.log(`Authenticated request from user: ${userId}`);

    // Create service role client for subscription/role checks
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Check if user has admin role (bypass subscription check)
    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = !!roleData;

    // Check subscription status (unless admin)
    let hasActiveSubscription = false;
    let isOnAppTrial = false;
    
    if (!isAdmin) {
      // First check for Stripe subscription (active, trialing, or past_due)
      const { data: subscription } = await serviceClient
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      // Grant unlimited searches to active, past_due, AND trialing users
      // Stripe trialing = card on file = full access during trial period
      const fullAccessStatuses = ['active', 'past_due', 'trialing'];
      hasActiveSubscription = subscription && fullAccessStatuses.includes(subscription.status);
      
      console.log(`[SEARCH-LEADS] access check - userId: ${userId}, subStatus: ${subscription?.status ?? 'none'}, hasProAccess: ${hasActiveSubscription}, branch: ${hasActiveSubscription ? 'pro' : 'free'}`);
      
      // If user has Stripe subscription (active, past_due, or trialing), allow unlimited searches
      if (hasActiveSubscription) {
        console.log(`User ${userId} has Stripe subscription (${subscription.status}) - unlimited searches`);
        // Continue to search - no limits for paid subscribers
      } else {
        // No Stripe subscription - check if user is on free app trial (1 search/day limit)
        const { data: trial } = await serviceClient
          .from('user_trials')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (trial) {
          const now = new Date();
          const trialEnd = new Date(trial.trial_end_date);
          
          if (now <= trialEnd && trial.plan_status === 'trial') {
            // Check if we need to reset daily search count
            const today = now.toISOString().split('T')[0];
            const lastSearchDate = trial.last_search_date;
            const shouldResetDaily = lastSearchDate !== today;
            const currentSearchesToday = shouldResetDaily ? 0 : trial.searches_today;
            
            // Parse body to check for skipTrialCount flag (for auto-demo searches)
            let skipTrialCount = false;
            try {
              const bodyClone = await req.clone().json();
              skipTrialCount = bodyClone.skipTrialCount === true;
            } catch {
              // Ignore parsing errors
            }
            
            // Check daily limit for FREE trial users (2 searches per day) - unless skipping for demo
            const DAILY_TRIAL_LIMIT = 2;
            if (!skipTrialCount && currentSearchesToday >= DAILY_TRIAL_LIMIT) {
              console.log(`Free trial user ${userId} has reached daily limit (${currentSearchesToday}/${DAILY_TRIAL_LIMIT})`);
              return new Response(
                JSON.stringify({ 
                  error: 'Daily trial limit reached (2 searches/day). Upgrade to continue.',
                  code: 'TRIAL_LIMIT_REACHED',
                  searches_today: currentSearchesToday,
                  limit: DAILY_TRIAL_LIMIT
                }),
                { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            
            isOnAppTrial = true;
            const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            // Only increment search counts if not skipping for demo
            if (!skipTrialCount) {
              console.log(`Free trial user ${userId} (${daysLeft} days remaining, ${currentSearchesToday + 1}/${DAILY_TRIAL_LIMIT} searches today)`);
              await serviceClient
                .from('user_trials')
                .update({ 
                  searches_used: trial.searches_used + 1,
                  searches_today: currentSearchesToday + 1,
                  last_search_date: today
                })
                .eq('user_id', userId);
            } else {
              console.log(`Free trial user ${userId} - demo search (not counted toward limit)`);
            }
          } else {
            console.log(`User ${userId} free trial has expired`);
            // Update plan_status to expired if needed
            if (trial.plan_status === 'trial') {
              await serviceClient
                .from('user_trials')
                .update({ plan_status: 'expired' })
                .eq('user_id', userId);
            }
          }
        }
        
        if (!isOnAppTrial) {
          // ─── POST-ABANDON SEARCH: allow 1 final search after checkout abandonment ───
          const { data: abandonTrial } = await serviceClient
            .from('user_trials')
            .select('checkout_abandoned, post_abandon_search_used')
            .eq('user_id', userId)
            .maybeSingle();

          if (abandonTrial?.checkout_abandoned && !abandonTrial?.post_abandon_search_used) {
            console.log(`User ${userId} using post-abandon search (1 of 1)`);
            // Mark it used BEFORE executing the search
            await serviceClient
              .from('user_trials')
              .update({ post_abandon_search_used: true })
              .eq('user_id', userId);
            isOnAppTrial = true; // Allow the search to proceed
          } else {
            console.log(`User ${userId} has no active subscription or valid trial`, {
              checkout_abandoned: abandonTrial?.checkout_abandoned,
              post_abandon_search_used: abandonTrial?.post_abandon_search_used,
            });
            
            const errorCode = abandonTrial?.checkout_abandoned && abandonTrial?.post_abandon_search_used
              ? 'POST_ABANDON_EXHAUSTED'
              : 'TRIAL_EXPIRED';
            
            return new Response(
              JSON.stringify({ 
                error: errorCode === 'POST_ABANDON_EXHAUSTED'
                  ? 'Complete checkout to unlock unlimited searches.'
                  : 'Your trial has expired. Please subscribe to continue using LeadFinder.',
                code: errorCode,
              }),
              { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    } else {
      console.log(`User ${userId} is admin - bypassing subscription check`);
    }

    // Check rate limit
    if (!checkRateLimit(userId)) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const validationResult = SearchRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
       // Log detailed errors server-side only for debugging
       console.error('Validation failed:', validationResult.error.errors);
       
      return new Response(
         JSON.stringify({ error: 'Invalid search parameters. Please check your input and try again.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { keyword, location, radius, minRating, minReviews, requirePhone, deepSearch } = validationResult.data;

    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!GOOGLE_MAPS_API_KEY) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable. Please try again later.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching for "${keyword}" in "${location}" within ${radius}m (deepSearch: ${deepSearch})`);

    // Search places
    const places = await searchPlaces(keyword, location, radius, GOOGLE_MAPS_API_KEY, deepSearch);
    console.log(`Found ${places.length} places`);

    // Get details for each place and classify
    const leads: Lead[] = [];
    
    for (const place of places) {
      try {
        const details = await getPlaceDetails(place.place_id, GOOGLE_MAPS_API_KEY);
        if (!details) continue;

        // Apply filters
        if (minRating && (!details.rating || details.rating < minRating)) continue;
        
        // Always require at least 2 reviews (hard floor to filter inactive businesses)
        const effectiveMinReviews = Math.max(minReviews || 0, 2);
        if (!details.user_ratings_total || details.user_ratings_total < effectiveMinReviews) continue;
        
        // Skip businesses without phone numbers (unlikely to be reachable)
        const phone = details.international_phone_number || details.formatted_phone_number;
        if (requirePhone && !phone) continue;
        
        // Skip permanently closed businesses
        if (details.business_status === 'CLOSED_PERMANENTLY') continue;

        const websiteUrl = details.website;
        // Get specific business category - prioritize primaryTypeDisplayName from new API
        const genericTypes = new Set(['establishment', 'point_of_interest', 'store', 'food', 'locality', 'political', 'premise', 'subpremise']);
        const category = details.primaryTypeDisplayName
          || details.primaryType?.replace(/_/g, ' ')
          || details.types?.find((t: string) => !genericTypes.has(t))?.replace(/_/g, ' ');
        
        let websiteStatus: Lead['websiteStatus'];
        let confidence: number;
        let reason: string;

        if (!websiteUrl) {
          // No website field - definite NO_WEBSITE
          websiteStatus = 'NO_WEBSITE';
          confidence = 1.0;
          reason = 'No website listed on Google Maps profile';
        } else if (isDirectoryUrl(websiteUrl)) {
          // Matches blacklist - definite DIRECTORY_ONLY
          websiteStatus = 'DIRECTORY_ONLY';
          confidence = 0.95;
          reason = `Website is a directory/platform: ${extractDomain(websiteUrl)}`;
        } else {
          // Needs AI verification
          const aiResult = await classifyWithAI(details.name, websiteUrl, category);
          websiteStatus = aiResult.status;
          confidence = aiResult.confidence;
          reason = aiResult.reason;
        }

        leads.push({
          id: place.place_id,
          name: details.name,
          category,
          address: details.formatted_address,
          phone: details.international_phone_number || details.formatted_phone_number,
          rating: details.rating,
          reviewCount: details.user_ratings_total,
          googleMapsUrl: details.url,
          websiteUrl,
          websiteStatus,
          confidence,
          reason,
          businessStatus: details.business_status,
        });
      } catch (err) {
        console.error('Error processing place:', place.place_id, err);
      }
    }

    // Sort by website status priority (NO_WEBSITE first)
    leads.sort((a, b) => {
      const order = { NO_WEBSITE: 0, DIRECTORY_ONLY: 1, UNCERTAIN: 2, HAS_OWN_WEBSITE: 3 };
      return order[a.websiteStatus] - order[b.websiteStatus];
    });

    console.log(`Returning ${leads.length} leads`);

    // Log usage event (additive tracking - never blocks search results)
    try {
      await supabaseClient.rpc('log_usage_event', {
        p_event_type: 'search',
        p_meta: {
          query: keyword,
          location,
          radius,
          results_count: leads.length,
          deep_search: deepSearch,
          source: 'search-leads',
        },
      });
    } catch (trackingErr) {
      console.error('Usage tracking failed (non-blocking):', trackingErr);
    }

    return new Response(
      JSON.stringify({
        leads,
        totalFound: leads.length,
        searchId: crypto.randomUUID(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const { message, status } = sanitizeError(error);
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
