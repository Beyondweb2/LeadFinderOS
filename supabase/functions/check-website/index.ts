// check-website
//
// On-demand "does this business have a real own website?" check for SEARCH RESULTS
// (which aren't saved leads yet). Cheap + focused: ONE Apify compass call per place
// (web-results), then the SHARED layered classifier — no FB/IG scrape, no images,
// no line-type. Reuses the same cap + cache as enrich-business via runEnrichSource.
//
// Returns a verdict the frontend applies via the existing website_status_overrides
// (so it persists + stays manually overridable):
//   HAS_OWN_WEBSITE  — name-match or location-match confirmed it
//   UNCERTAIN        — a real-looking candidate found, but unconfirmed (verify)
//   NO_WEBSITE       — no non-excluded candidate
//
// HONESTY: socials / aggregators / directories / gov / booking are never returned
// as a website (aggregators.ts); name-match is a booster, not a requirement.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapsEnrich } from "../_shared/enrichment/sources.ts";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { classifyOwnWebsite, type WebsiteVerdict } from "../_shared/enrichment/websiteClassify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Auth required" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    try {
      const { data } = await userClient.auth.getClaims(token);
      userId = (data?.claims?.sub as string) ?? null;
    } catch { /* fall through */ }
    if (!userId) {
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data?.user) return json({ error: "Auth required" }, 401);
      userId = data.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const placeId: string = body.place_id ?? "";
    const googleMapsUrl: string = body.google_maps_url ?? "";
    const businessName: string = body.business_name ?? "";
    const existingWebsite: string = body.website ?? "";
    if (!placeId && !googleMapsUrl) return json({ error: "place_id or google_maps_url required" }, 400);

    const apifyToken = Deno.env.get("APIFY_TOKEN");
    if (!apifyToken) return json({ success: false, error: "Enrichment not configured." }, 500);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const cacheKey = `${placeId || googleMapsUrl}:website_check`;

    const outcome = await runEnrichSource<WebsiteVerdict>({
      service,
      userId,
      type: "website_check",
      cacheKey,
      estCostUsd: 0.02, // single compass call (web-results); no social/photo scrapers
      run: async () => {
        // Web-results only: skip reviews + images to keep it cheap/fast.
        const { place } = await mapsEnrich({
          googleMapsUrl: googleMapsUrl || undefined,
          placeId: placeId || undefined,
          token: apifyToken,
          maxReviews: 0,
          maxImages: 0,
          timeoutMs: 60_000,
        });
        const verdict = classifyOwnWebsite({
          existingWebsite: existingWebsite || null,
          mapsWebsite: place?.website || null,
          webResults: place?.webResults ?? [],
          place,
          businessName,
        });
        return { result: verdict, costUsd: 0.02 };
      },
    });

    if (outcome.capReached) {
      return json({ success: false, limit_reached: true, error: "Daily enrichment limit reached.", spent_usd: outcome.spentUsd });
    }
    const v = outcome.result;
    if (!v) return json({ success: false, error: "Check returned nothing." });

    console.log(JSON.stringify({ fn: "check-website", status: v.status, signal: v.signal, cached: outcome.cached }));
    return json({
      success: true,
      cached: outcome.cached,
      websiteStatus: v.status,
      website: v.website,
      candidate: v.candidate,
      signal: v.signal,
      reason: v.reason,
    });
  } catch (e) {
    console.error("[check-website] error:", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});
