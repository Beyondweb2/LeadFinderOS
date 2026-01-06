import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface SearchRequest {
  keyword: string;
  location: string;
  radius: number;
  minRating?: number;
  minReviews?: number;
}

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

async function classifyWithAI(
  businessName: string,
  websiteUrl: string,
  category?: string
): Promise<{ status: 'HAS_OWN_WEBSITE' | 'DIRECTORY_ONLY' | 'UNCERTAIN'; confidence: number; reason: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return {
      status: 'UNCERTAIN',
      confidence: 0.3,
      reason: 'AI verification unavailable - API key not configured',
    };
  }

  const domain = extractDomain(websiteUrl);
  
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
            content: `You are a website classifier. Your job is to determine if a URL represents a business's OWN website or just a directory/listing/profile page.

Rules:
- HAS_OWN_WEBSITE: The business has their own branded website with their services, location, and contact info
- DIRECTORY_ONLY: The URL is a listing/profile on a directory, marketplace, social media, or lead-generation platform
- UNCERTAIN: Cannot determine (parked domain, broken, unclear ownership)

Respond ONLY with valid JSON in this exact format:
{"status": "HAS_OWN_WEBSITE" | "DIRECTORY_ONLY" | "UNCERTAIN", "confidence": 0.0-1.0, "reason": "brief explanation"}`,
          },
          {
            role: 'user',
            content: `Classify this website:
Business Name: ${businessName}
Business Category: ${category || 'Unknown'}
Website URL: ${websiteUrl}
Domain: ${domain}

Is this the business's own website or a directory listing?`,
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
      reason: `AI verification error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

async function searchPlaces(
  keyword: string,
  location: string,
  radius: number,
  apiKey: string
): Promise<any[]> {
  // First, geocode the location
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
  const geocodeRes = await fetch(geocodeUrl);
  const geocodeData = await geocodeRes.json();
  
  if (geocodeData.status !== 'OK' || !geocodeData.results?.[0]) {
    console.error('Geocoding failed:', geocodeData.status);
    throw new Error(`Could not find location: ${location}`);
  }
  
  const { lat, lng } = geocodeData.results[0].geometry.location;
  
  // Search for places
  const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();
  
  if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
    console.error('Places search failed:', searchData.status, searchData.error_message);
    throw new Error(`Search failed: ${searchData.error_message || searchData.status}`);
  }
  
  return searchData.results || [];
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

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keyword, location, radius, minRating, minReviews }: SearchRequest = await req.json();
    
    if (!keyword || !location) {
      return new Response(
        JSON.stringify({ error: 'keyword and location are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!GOOGLE_MAPS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Google Maps API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching for "${keyword}" in "${location}" within ${radius}m`);

    // Search places
    const places = await searchPlaces(keyword, location, radius, GOOGLE_MAPS_API_KEY);
    console.log(`Found ${places.length} places`);

    // Get details for each place and classify
    const leads: Lead[] = [];
    
    for (const place of places) {
      try {
        const details = await getPlaceDetails(place.place_id, GOOGLE_MAPS_API_KEY);
        if (!details) continue;

        // Apply filters
        if (minRating && (!details.rating || details.rating < minRating)) continue;
        if (minReviews && (!details.user_ratings_total || details.user_ratings_total < minReviews)) continue;

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
    console.error('Search error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
