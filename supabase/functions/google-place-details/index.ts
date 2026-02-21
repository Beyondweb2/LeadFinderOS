import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ─── AUTH ─────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── RATE LIMIT ──────────────────────────
    const rl = checkRateLimit(`details:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please slow down.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...rateLimitHeaders(rl, RATE_LIMIT) } }
      );
    }

    // ─── INPUT ───────────────────────────────
    const { placeId, forceRefresh } = await req.json();
    if (!placeId || typeof placeId !== 'string' || placeId.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Valid placeId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── CACHE CHECK (30 days for phone, 1 hour for null-phone) ───
    if (!forceRefresh) {
      const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const { data: cached } = await supabase
        .from('phone_cache')
        .select('*')
        .eq('place_id', placeId)
        .gte('created_at', cutoff)
        .maybeSingle();

      // Only serve from cache if phone was found; null-phone entries expire after 1 hour
      if (cached) {
        const NULL_PHONE_TTL_MS = 60 * 60 * 1000; // 1 hour
        const cacheAge = Date.now() - new Date(cached.created_at).getTime();
        const isNullPhone = !cached.phone;

        if (!isNullPhone || cacheAge < NULL_PHONE_TTL_MS) {
          console.log(`Cache hit for place ${placeId} (phone=${cached.phone ? 'found' : 'none'}, age=${Math.round(cacheAge / 60000)}min)`);
          return new Response(
            JSON.stringify({
              placeId,
              phone: cached.phone,
              address: cached.address,
              category: cached.category,
              googleMapsUri: cached.google_maps_uri,
              cached: true,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.log(`Null-phone cache expired for ${placeId}, re-fetching`);
        }
      }
    } else {
      console.log(`Force refresh requested for ${placeId}, skipping cache`);
    }

    // ─── GOOGLE PLACE DETAILS (New API) ──────
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fieldMask = 'internationalPhoneNumber,nationalPhoneNumber,formattedAddress,primaryTypeDisplayName,googleMapsUri';
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Place Details failed for ${placeId}: ${res.status}`, errText);
      return new Response(
        JSON.stringify({ placeId, phone: null, error: 'Lookup failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json();
    const phone = data.internationalPhoneNumber || data.nationalPhoneNumber || null;
    const address = data.formattedAddress || null;
    const category = data.primaryTypeDisplayName?.text || null;
    const googleMapsUri = data.googleMapsUri || null;

    console.log(`Place ${placeId}: phone=${phone ? 'found' : 'none'}, address=${address ? 'found' : 'none'}`);

    // ─── CACHE STORE ─────────────────────────
    try {
      await supabase.from('phone_cache').upsert(
        {
          place_id: placeId,
          phone,
          address,
          category,
          google_maps_uri: googleMapsUri,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'place_id' }
      );
    } catch (e) {
      console.error('Cache store failed:', e);
    }

    return new Response(
      JSON.stringify({ placeId, phone, address, category, googleMapsUri, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Place details error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to lookup details' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
