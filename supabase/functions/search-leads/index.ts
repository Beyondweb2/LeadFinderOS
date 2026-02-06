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

// Generate grid points for deep search
function generateGridPoints(centerLat: number, centerLng: number, radiusMeters: number): Array<{lat: number, lng: number, radius: number}> {
  // Calculate grid size based on radius
  // For larger areas, use more grid points with overlap
  const points: Array<{lat: number, lng: number, radius: number}> = [];
  
  // Determine grid dimensions based on search radius
  let gridSize: number;
  let cellRadius: number;
  
  if (radiusMeters >= 80000) {
    gridSize = 6; // 6x6 = 36 points for 80km+
    cellRadius = radiusMeters / 4; // More overlap for larger areas
  } else if (radiusMeters >= 40000) {
    gridSize = 5; // 5x5 = 25 points for 40-80km
    cellRadius = radiusMeters / 3; // Overlap cells
  } else if (radiusMeters >= 20000) {
    gridSize = 4; // 4x4 = 16 points for 20-40km
    cellRadius = radiusMeters / 2.5;
  } else if (radiusMeters >= 10000) {
    gridSize = 3; // 3x3 = 9 points for 10-20km
    cellRadius = radiusMeters / 2;
  } else {
    gridSize = 2; // 2x2 = 4 points for smaller areas
    cellRadius = radiusMeters / 1.5;
  }
  
  // Calculate step size in degrees (approximate)
  // 1 degree latitude ≈ 111km, longitude varies by latitude
  const latStep = (radiusMeters * 2 / (gridSize - 1)) / 111000;
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

// Search places at a specific coordinate
async function searchPlacesAtPoint(
  keyword: string,
  lat: number,
  lng: number,
  radius: number,
  apiKey: string
): Promise<any[]> {
  const allResults: any[] = [];
  let nextPageToken: string | undefined;
  
  do {
    const searchUrl = nextPageToken
      ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${nextPageToken}&key=${apiKey}`
      : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    
    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      console.error('Places search failed:', searchData.status, searchData.error_message);
      break; // Don't throw, just stop this point's search
    }
    
    allResults.push(...(searchData.results || []));
    nextPageToken = searchData.next_page_token;
    
    // Google requires a short delay before using the next_page_token
    if (nextPageToken) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } while (nextPageToken && allResults.length < 60);
  
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
  
  if (!deepSearch) {
    // Standard single-point search
    return searchPlacesAtPoint(keyword, lat, lng, radius, apiKey);
  }
  
  // Deep search: grid-based multi-point search
  console.log(`Deep search enabled: generating grid for ${radius}m radius`);
  const gridPoints = generateGridPoints(lat, lng, radius);
  console.log(`Generated ${gridPoints.length} grid points`);
  
  // Search all grid points in parallel (with concurrency limit)
  const allResults: any[] = [];
  const seenPlaceIds = new Set<string>();
  
  // Process in batches of 5 to avoid overwhelming the API
  const batchSize = 5;
  for (let i = 0; i < gridPoints.length; i += batchSize) {
    const batch = gridPoints.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(point => 
        searchPlacesAtPoint(keyword, point.lat, point.lng, point.radius, apiKey)
          .catch(err => {
            console.error(`Error searching at point (${point.lat}, ${point.lng}):`, err);
            return [];
          })
      )
    );
    
    // Deduplicate by place_id
    for (const results of batchResults) {
      for (const place of results) {
        if (!seenPlaceIds.has(place.place_id)) {
          seenPlaceIds.add(place.place_id);
          allResults.push(place);
        }
      }
    }
    
    console.log(`Batch ${Math.floor(i / batchSize) + 1}: Found ${allResults.length} unique places so far`);
  }
  
  return allResults;
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<any> {
  const fields = [
    'name',
    'formatted_address',
    'geometry',
    'formatted_phone_number',
    'international_phone_number',
    'rating',
    'user_ratings_total',
    'website',
    'url',
    'business_status',
    'types',
  ].join(',');
  
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.status !== 'OK') {
    console.warn('Place details failed for', placeId, ':', data.status);
    return null;
  }
  
  return data.result;
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
    let isOnTrial = false;
    
    if (!isAdmin) {
      // First check for active subscription
      const { data: subscription } = await serviceClient
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      const validStatuses = ['active', 'trialing', 'past_due'];
      hasActiveSubscription = subscription && validStatuses.includes(subscription.status);
      
      if (!hasActiveSubscription) {
        // Check if user is on trial
        const { data: trial } = await serviceClient
          .from('user_trials')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (trial) {
          const trialStart = new Date(trial.trial_started_at);
          const trialEnd = new Date(trialStart);
          trialEnd.setDate(trialEnd.getDate() + trial.trial_days);
          const now = new Date();
          
          if (now <= trialEnd) {
            isOnTrial = true;
            console.log(`User ${userId} is on trial (${trial.trial_days - Math.ceil((now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24))} days remaining)`);
            
            // Increment search count for trial users
            await serviceClient
              .from('user_trials')
              .update({ searches_used: trial.searches_used + 1 })
              .eq('user_id', userId);
          } else {
            console.log(`User ${userId} trial has expired`);
          }
        }
      }
      
      if (!hasActiveSubscription && !isOnTrial) {
        console.log(`User ${userId} has no active subscription or valid trial`);
        return new Response(
          JSON.stringify({ error: 'Your trial has expired. Please subscribe to continue using LeadFinder.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (hasActiveSubscription) {
        console.log(`User ${userId} has valid subscription`);
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
        const category = details.types?.[0]?.replace(/_/g, ' ') || undefined;
        
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
