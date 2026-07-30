import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";
import {
  ENTERPRISE_FIELDS,
  ESSENTIALS_FIELDS,
  fetchPlaceDetails,
  type TownFetchNote,
  townFromComponents,
} from "../_shared/place-details.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NULL_PHONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (matches positive cache to stop expensive re-checks)

/* CACHE SHAPE VERSION. Bumped to 2 when address/addressComponents/rating/userRatingCount joined the
   field mask below. Rows written by the old code hold NO address, rating, review count or town, and
   an "address is null" test cannot tell those apart from a place Google has no address for — so the
   version is explicit rather than inferred. A v1 row is treated as a MISS and re-fetched once.
   Without this, every lead already in phone_cache (most of them) would stay unenriched for 30 days
   and the fix would look broken on exactly the leads that exposed the bug. */
const CACHE_VERSION = 2;

// In-memory single-flight: collapse concurrent requests for the same place_id
// within the same edge isolate down to one upstream Google call.
const inFlight = new Map<string, Promise<Response>>();

// Best-effort usage logging — never blocks the main response
async function logUsage(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  cacheHit: boolean,
  costUsd: number,
  triggerSource?: string
) {
  try {
    await supabase.from('api_usage_log').insert({
      user_id: userId,
      function_name: 'google-place-details',
      api_type: 'place_details',
      calls_made: 1,
      cache_hit: cacheHit,
      estimated_cost_usd: costUsd,
      trigger_source: triggerSource || 'unknown',
    });
  } catch (e) {
    console.error('Usage logging failed (non-blocking):', e);
  }
}

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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error('JWT validation error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = claimsData.claims.sub;

    // ─── RATE LIMIT ──────────────────────────
    const rl = checkRateLimit(`details:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please slow down.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...rateLimitHeaders(rl, RATE_LIMIT) } }
      );
    }

    // ─── INPUT ───────────────────────────────
    const { placeId, forceRefresh, triggerSource } = await req.json();
    if (!placeId || typeof placeId !== 'string' || placeId.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Valid placeId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── CACHE CHECK ─────────────────────────
    if (!forceRefresh) {
      const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const { data: cached } = await supabase
        .from('phone_cache')
        .select('*')
        .eq('place_id', placeId)
        .gte('created_at', cutoff)
        .maybeSingle();

      if (cached) {
        const cacheAge = Date.now() - new Date(cached.created_at).getTime();
        const isNullPhone = !cached.phone;
        // A pre-v2 row predates address/rating/reviews/town being fetched at all. Serving it would
        // hand the caller nulls that look like "Google has no address" — re-fetch once instead.
        const isStaleShape = Number(cached.details_version ?? 1) < CACHE_VERSION;

        if (isStaleShape) {
          console.log(`Cache shape v${cached.details_version ?? 1} < v${CACHE_VERSION} for ${placeId}, re-fetching for address/rating/reviews/town`);
        } else if (!isNullPhone || cacheAge < NULL_PHONE_TTL_MS) {
          console.log(`Cache hit for place ${placeId} (phone=${cached.phone ? 'found' : 'none'}, age=${Math.round(cacheAge / 60000)}min)`);
          logUsage(supabase, userId, true, 0, triggerSource);
          return new Response(
            JSON.stringify({
              placeId,
              phone: cached.phone,
              website: cached.website,
              address: cached.address,
              category: cached.category,
              googleMapsUri: cached.google_maps_uri,
              rating: cached.rating,
              reviewCount: cached.review_count,
              derivedTown: cached.derived_town,
              // A cached row was a completed Google answer, so a null town is settled, not untried.
              townNote: (cached.derived_town ? null : 'no_town_in_address') as TownFetchNote,
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

    // ─── SINGLE-FLIGHT: collapse concurrent misses for the same place_id ─
    const flightKey = `${placeId}`;
    const existing = inFlight.get(flightKey);
    if (existing && !forceRefresh) {
      console.log(`Single-flight: awaiting in-progress lookup for ${placeId}`);
      const cloned = (await existing).clone();
      logUsage(supabase, userId, true, 0, triggerSource);
      return cloned;
    }

    const flight = (async (): Promise<Response> => {
      // ─── GOOGLE PLACE DETAILS (New API) ──────
      const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'Service not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      /* ── THE FIELD MASK, and the comment that used to be here ──────────────────────────────────
         It said: "Slim mask: phone + website only. Address/category/maps URI are already returned by
         Text Search at lead-creation time." That was true once and then quietly stopped being true —
         search-leads' mask is `places.id,places.displayName,places.googleMapsUri,places.websiteUri`
         (see search-leads:408) and has no address in it. Nobody re-checked the other layer, so
         `address` was null on EVERY lead that ever came from a search, and with no address there were
         no addressComponents, so no derived_town either. That stale comment was the whole bug.

         Both tiers are requested together, and that is FREE, not a splurge: phone is an Enterprise
         field, so this request is billed at Enterprise whatever else rides along. rating and
         userRatingCount are Enterprise too — same tier, no change. formattedAddress and
         addressComponents are Essentials, i.e. cheaper than what we were already buying. One request,
         billed once, at the highest tier it touches. See place-details.ts for the quoted rule. */
      const details = await fetchPlaceDetails(placeId, apiKey, [...ESSENTIALS_FIELDS, ...ENTERPRISE_FIELDS]);

      if (!details) {
        return new Response(
          JSON.stringify({ placeId, phone: null, townNote: 'place_details_unavailable' as TownFetchNote, error: 'Lookup failed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { phone, website, rating, reviewCount, formattedAddress: address } = details;
      // Same extraction the audit path uses, from the same module — UK postal_town > locality >
      // administrative_area_level_2. The town the business IS in, not the town that was searched.
      const derivedTown = townFromComponents(details.addressComponents);
      const townNote: TownFetchNote = derivedTown ? null : 'no_town_in_address';

      console.log(
        `Place ${placeId}: phone=${phone ? 'found' : 'none'}, website=${website ? 'found' : 'none'}`
        + `, address=${address ? 'found' : 'none'}, town=${derivedTown ?? 'none'}`
        + `, rating=${rating ?? 'none'}, reviews=${reviewCount ?? 'none'}`
      );

      // Log API miss (best-effort). NOTE: 0.017 is an inherited constant, NOT a measured or verified
      // price, and this change does not alter it — the call was already Enterprise-tier before the
      // extra fields were added, so whatever it truly costs, it costs the same as it did.
      logUsage(supabase, userId, false, 0.017, triggerSource);

      // ─── CACHE STORE ─────────────────────────
      // Write what we fetched; preserve category/google_maps_uri, which come from Text Search and are
      // NOT in this mask, so blanking them would lose data. address IS ours now, but fall back to any
      // existing value rather than overwriting a good address with a null.
      try {
        const { data: existingRow } = await supabase
          .from('phone_cache')
          .select('address, category, google_maps_uri')
          .eq('place_id', placeId)
          .maybeSingle();

        const row: Record<string, unknown> = {
          place_id: placeId,
          phone,
          address: address ?? existingRow?.address ?? null,
          category: existingRow?.category ?? null,
          google_maps_uri: existingRow?.google_maps_uri ?? null,
          created_at: new Date().toISOString(),
        };
        // MIGRATION-TOLERANT: these columns are added by SQL Paul applies BY HAND, and PostgREST
        // rejects the whole upsert for one unknown column. Losing the cache write would mean paying
        // Google again on the next add, so retry with the columns that have always existed.
        const { error: cacheErr } = await supabase.from('phone_cache').upsert(
          { ...row, website, rating, review_count: reviewCount, derived_town: derivedTown, details_version: CACHE_VERSION },
          { onConflict: 'place_id' }
        );
        if (cacheErr) {
          console.warn('Cache store: new columns absent, storing legacy shape only:', cacheErr.message);
          await supabase.from('phone_cache').upsert(row, { onConflict: 'place_id' });
        }
      } catch (e) {
        console.error('Cache store failed:', e);
      }

      return new Response(
        JSON.stringify({ placeId, phone, website, address, rating, reviewCount, derivedTown, townNote, cached: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    })();

    inFlight.set(flightKey, flight);
    try {
      const response = await flight;
      return response.clone();
    } finally {
      inFlight.delete(flightKey);
    }

  } catch (error) {
    console.error('Place details error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to lookup details' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
