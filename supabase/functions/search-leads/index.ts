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
    .default(2),
  skipTrialCount: z.boolean()
    .default(false),
  requirePhone: z.boolean()
    .default(true),
  deepSearch: z.boolean()
    .default(false),
  demo: z.boolean()
    .default(false),
  country: z.string()
    .max(10)
    .optional(),
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
    rateLimiter.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (limit.count >= 10) {
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
      console.log(`Heuristic match for ${businessName}: ${heuristicResult.reason}`);
      return { status: 'HAS_OWN_WEBSITE', confidence: heuristicResult.confidence, reason: heuristicResult.reason };
    }
  }
  
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return { status: 'UNCERTAIN', confidence: 0.3, reason: 'AI verification unavailable' };
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
1. Does the domain contain the business name or key words from it?
2. Is this a known directory, marketplace, review site, or social media platform?
3. Does the URL structure suggest a profile page?

CLASSIFICATION RULES:
- HAS_OWN_WEBSITE: The domain appears to be owned by the business
- DIRECTORY_ONLY: The URL is clearly a listing on a third-party site
- UNCERTAIN: Cannot determine

Respond ONLY with valid JSON in this exact format:
{"status": "HAS_OWN_WEBSITE" | "DIRECTORY_ONLY" | "UNCERTAIN", "confidence": 0.0-1.0, "reason": "brief explanation"}`,
          },
          {
            role: 'user',
            content: `Classify this website for lead generation purposes:

Business Name: ${businessName}
Business Category: ${category || 'Unknown'}
Website URL: ${websiteUrl}
Domain: ${domain}`,
          },
        ],
      }),
    });

    if (response.status === 429) {
      return { status: 'UNCERTAIN', confidence: 0.4, reason: 'Rate limited - classification pending' };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI classification error:', response.status, errorText);
      return { status: 'UNCERTAIN', confidence: 0.3, reason: 'AI verification failed' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      return { status: 'UNCERTAIN', confidence: 0.3, reason: 'AI returned empty response' };
    }

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

function generateGridPoints(centerLat: number, centerLng: number, radiusMeters: number): Array<{lat: number, lng: number, radius: number}> {
  const points: Array<{lat: number, lng: number, radius: number}> = [];
  
  let gridSize: number;
  let cellRadius: number;
  let overlapFactor: number;
  
  if (radiusMeters >= 80000) {
    gridSize = 7; cellRadius = radiusMeters / 5; overlapFactor = 0.6;
  } else if (radiusMeters >= 40000) {
    gridSize = 6; cellRadius = radiusMeters / 4; overlapFactor = 0.5;
  } else if (radiusMeters >= 20000) {
    gridSize = 5; cellRadius = radiusMeters / 3; overlapFactor = 0.5;
  } else if (radiusMeters >= 10000) {
    gridSize = 4; cellRadius = radiusMeters / 2; overlapFactor = 0.4;
  } else if (radiusMeters >= 5000) {
    gridSize = 3; cellRadius = radiusMeters / 1.5; overlapFactor = 0.4;
  } else {
    gridSize = 2; cellRadius = radiusMeters; overlapFactor = 0.3;
  }
  
  cellRadius = Math.max(cellRadius, 1000);
  
  const effectiveStep = (radiusMeters * 2 * (1 - overlapFactor)) / (gridSize - 1);
  const latStep = effectiveStep / 111000;
  const lngStep = latStep / Math.cos(centerLat * Math.PI / 180);
  
  const halfGrid = (gridSize - 1) / 2;
  
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const lat = centerLat + (i - halfGrid) * latStep;
      const lng = centerLng + (j - halfGrid) * lngStep;
      points.push({ lat, lng, radius: cellRadius });
    }
  }
  
  if (!points.some(p => p.lat === centerLat && p.lng === centerLng)) {
    points.unshift({ lat: centerLat, lng: centerLng, radius: cellRadius });
  }
  
  return points;
}

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

async function searchPlacesAtPoint(keyword: string, lat: number, lng: number, radius: number, apiKey: string): Promise<any[]> {
  const allResults: any[] = [];
  let nextPageToken: string | undefined;
  let pageCount = 0;
  const maxPages = 3;
  
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
    
    if (nextPageToken && pageCount < maxPages) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } while (nextPageToken && pageCount < maxPages);
  
  return allResults;
}

async function textSearchAtPoint(keyword: string, lat: number, lng: number, radius: number, apiKey: string): Promise<any[]> {
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

async function searchPlaces(keyword: string, location: string, radius: number, apiKey: string, deepSearch: boolean = false): Promise<any[]> {
  const { lat, lng } = await geocodeLocation(location, apiKey);
  
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
    const [nearbyResults, textResults] = await Promise.all([
      searchPlacesAtPoint(keyword, lat, lng, radius, apiKey),
      textSearchAtPoint(keyword, lat, lng, radius, apiKey)
    ]);
    
    addResults(nearbyResults);
    addResults(textResults);
    
    console.log(`Standard search: ${nearbyResults.length} nearby + ${textResults.length} text = ${allResults.length} unique`);
    return allResults;
  }
  
  console.log(`Deep search enabled: generating grid for ${radius}m radius`);
  const gridPoints = generateGridPoints(lat, lng, radius);
  console.log(`Generated ${gridPoints.length} grid points`);
  
  const batchSize = 4;
  for (let i = 0; i < gridPoints.length; i += batchSize) {
    const batch = gridPoints.slice(i, i + batchSize);
    
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
    
    if (i + batchSize < gridPoints.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return allResults;
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<any> {
  const fieldMask = [
    'displayName', 'formattedAddress', 'location', 'nationalPhoneNumber',
    'internationalPhoneNumber', 'rating', 'userRatingCount', 'websiteUri',
    'googleMapsUri', 'businessStatus', 'types', 'primaryType', 'primaryTypeDisplayName',
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

function sanitizeError(error: unknown): { message: string; status: number } {
  if (error instanceof z.ZodError) {
    return { message: 'Invalid input: ' + error.errors.map(e => e.message).join(', '), status: 400 };
  }
  
  if (error instanceof Error) {
    console.error('Detailed error:', error);
    if (error.message === 'Location not found') {
      return { message: 'Location not found. Please check the address and try again.', status: 400 };
    }
    if (error.message.includes('Search service')) {
      return { message: 'Search service temporarily unavailable. Please try again later.', status: 503 };
    }
  }
  
  return { message: 'An unexpected error occurred. Please try again.', status: 500 };
}

const FREE_SEARCH_LIMIT = 5;

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

    // Parse body
    const body = await req.json();

    // ─── AUTHENTICATED MODE ONLY (demo mode removed) ───
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

    // Check if user has admin role (bypass all limits)
    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = !!roleData;

    let canSearch = false;

    if (isAdmin) {
      console.log(`User ${userId} is admin - bypassing all limits`);
      canSearch = true;
    } else {
      // Check for active Stripe subscription (active, trialing, or past_due = unlimited)
      const { data: subscription } = await serviceClient
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      const fullAccessStatuses = ['active', 'past_due', 'trialing'];
      const hasActiveSubscription = subscription && fullAccessStatuses.includes(subscription.status);
      
      console.log(`[SEARCH-LEADS] access check - userId: ${userId}, subStatus: ${subscription?.status ?? 'none'}, hasProAccess: ${hasActiveSubscription}`);
      
      if (hasActiveSubscription) {
        console.log(`User ${userId} has Stripe subscription (${subscription.status}) - unlimited searches`);
        canSearch = true;
      } else {
        // ─── FREE ACCESS MODEL: 5 searches total, no warnings ───
        const { data: trial } = await serviceClient
          .from('user_trials')
          .select('free_search_count')
          .eq('user_id', userId)
          .maybeSingle();
        
        const currentCount = trial?.free_search_count ?? 0;
        
        if (currentCount >= FREE_SEARCH_LIMIT) {
          console.log(`User ${userId} has used all ${FREE_SEARCH_LIMIT} free searches`);
          return new Response(
            JSON.stringify({ 
              error: 'Free access complete. Upgrade to unlock unlimited searches.',
              code: 'FREE_LIMIT_REACHED',
              free_search_count: currentCount,
              limit: FREE_SEARCH_LIMIT
            }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Increment free_search_count
        console.log(`User ${userId} free search ${currentCount + 1}/${FREE_SEARCH_LIMIT}`);
        await serviceClient
          .from('user_trials')
          .update({ 
            free_search_count: currentCount + 1,
            searches_used: (trial as any)?.searches_used ? (trial as any).searches_used + 1 : 1,
          })
          .eq('user_id', userId);
        
        canSearch = true;
      }
    }

    if (!canSearch) {
      return new Response(
        JSON.stringify({ error: 'Access denied.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit
    if (!checkRateLimit(userId)) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input
    const validationResult = SearchRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
       console.error('Validation failed:', validationResult.error.errors);
       
      return new Response(
         JSON.stringify({ error: 'Invalid search parameters. Please check your input and try again.' }),
         { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { keyword, location, radius, minRating, minReviews, requirePhone, deepSearch } = validationResult.data;

    // Get API key
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!GOOGLE_MAPS_API_KEY) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Search service temporarily unavailable.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching for "${keyword}" in "${location}" within ${radius}m (deep: ${deepSearch})`);

    // Search for places
    const places = await searchPlaces(keyword, location, radius, GOOGLE_MAPS_API_KEY, deepSearch);
    console.log(`Found ${places.length} places`);

    // Process each place
    const leads: Lead[] = [];
    const aiClassificationPromises: Promise<void>[] = [];
    
    for (const place of places) {
      try {
        const details = await getPlaceDetails(place.place_id, GOOGLE_MAPS_API_KEY);
        if (!details) continue;

        // Apply filters
        if (minRating && (!details.rating || details.rating < minRating)) continue;
        const effectiveMinReviews = Math.max(minReviews || 0, 2);
        if (!details.user_ratings_total || details.user_ratings_total < effectiveMinReviews) continue;
        if (requirePhone && !details.formatted_phone_number) continue;
        if (details.business_status === 'CLOSED_PERMANENTLY') continue;

        const websiteUrl = details.website;
        let websiteStatus: Lead['websiteStatus'];
        let confidence: number;
        let reason: string;

        if (!websiteUrl) {
          websiteStatus = 'NO_WEBSITE';
          confidence = 1.0;
          reason = 'No website listed on Google Maps profile';
        } else if (isDirectoryUrl(websiteUrl)) {
          websiteStatus = 'DIRECTORY_ONLY';
          confidence = 0.95;
          reason = `Website is a directory/platform: ${extractDomain(websiteUrl)}`;
        } else {
          // Use AI classification for ambiguous cases
          websiteStatus = 'UNCERTAIN';
          confidence = 0.5;
          reason = 'Pending AI classification';
          
          const lead: Lead = {
            id: place.place_id,
            name: details.name,
            category: null,
            address: details.formatted_address,
            phone: details.formatted_phone_number || details.international_phone_number || null,
            rating: details.rating || null,
            reviewCount: details.user_ratings_total || null,
            googleMapsUrl: details.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            websiteUrl: websiteUrl || null,
            websiteStatus,
            confidence,
            reason,
          };
          
          // Get category
          const genericTypes = new Set(['establishment', 'point_of_interest', 'store', 'food', 'locality', 'political', 'premise', 'subpremise']);
          lead.category = details.primaryTypeDisplayName
            || details.primaryType?.replace(/_/g, ' ')
            || details.types?.find((t: string) => !genericTypes.has(t))?.replace(/_/g, ' ')
            || null;
          
          leads.push(lead);
          
          // Queue AI classification
          aiClassificationPromises.push(
            classifyWithAI(details.name, websiteUrl, lead.category || undefined)
              .then(result => {
                lead.websiteStatus = result.status;
                lead.confidence = result.confidence;
                lead.reason = result.reason;
              })
              .catch(err => {
                console.error('AI classification failed for', details.name, err);
              })
          );
          
          continue;
        }

        // Get category for non-AI classified leads
        const genericTypes = new Set(['establishment', 'point_of_interest', 'store', 'food', 'locality', 'political', 'premise', 'subpremise']);
        const category = details.primaryTypeDisplayName
          || details.primaryType?.replace(/_/g, ' ')
          || details.types?.find((t: string) => !genericTypes.has(t))?.replace(/_/g, ' ');

        leads.push({
          id: place.place_id,
          name: details.name,
          category: category || null,
          address: details.formatted_address,
          phone: details.formatted_phone_number || details.international_phone_number || null,
          rating: details.rating || null,
          reviewCount: details.user_ratings_total || null,
          googleMapsUrl: details.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
          websiteUrl: websiteUrl || null,
          websiteStatus,
          confidence,
          reason,
        });
      } catch (e) {
        console.error(`Error processing place ${place.place_id}:`, e);
      }
    }

    // Wait for AI classifications
    if (aiClassificationPromises.length > 0) {
      console.log(`Waiting for ${aiClassificationPromises.length} AI classifications...`);
      await Promise.allSettled(aiClassificationPromises);
    }

    // Sort leads
    const statusPriority: Record<string, number> = {
      'NO_WEBSITE': 0,
      'DIRECTORY_ONLY': 1,
      'UNCERTAIN': 2,
      'HAS_OWN_WEBSITE': 3,
    };

    leads.sort((a, b) => {
      const statusDiff = (statusPriority[a.websiteStatus] ?? 2) - (statusPriority[b.websiteStatus] ?? 2);
      if (statusDiff !== 0) return statusDiff;
      return b.confidence - a.confidence;
    });

    console.log(`Returning ${leads.length} leads (${leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length} without websites)`);

    // Dispatch search event (fire-and-forget)
    serviceClient.rpc('log_usage_event', { 
      p_event_type: 'search',
      p_meta: { keyword, location, radius, results: leads.length, no_website: leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length }
    }).then(() => {}).catch(() => {});

    return new Response(
      JSON.stringify({ leads }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const sanitized = sanitizeError(error);
    return new Response(
      JSON.stringify({ error: sanitized.message }),
      { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
