import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { apifyEnrich, type EnrichmentType } from "../_shared/apify-stub.ts";

// enrich-lead — Phase 2 enrichment backbone (Apify STUBBED in this build).
//
// ONE function for all three enrichment types (email | facebook | instagram).
// Scaffolding mirrors extract-facebook/extract-email: in-handler Bearer auth
// (verify_jwt=false in config.toml) + a service-role client for privileged
// writes. Apify is reached ONLY through ../_shared/apify-stub.ts.
//
// Flow:
//   1. cache check  (enrichment_cache)            → hit returns cached, no cost
//   2. email-with-website: free extract-email path BEFORE any Apify call
//   3. daily cost cap (enrichment_usage, 24h sum) → over cap refuses, no call
//   4. under cap: call the Apify STUB
//   5. persist: enrichment_cache + enrichment_usage + api_usage_log + the lead

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Hard, durable per-user daily spend cap (USD). The in-memory rate limiter isn't
// enough for real money — this is enforced against enrichment_usage.
const DAILY_CAP_USD = 2.0;
const CACHE_TTL_DAYS = 30;
const VALID_TYPES: EnrichmentType[] = ["email", "facebook", "instagram"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Map an enrichment result onto the lead's type-specific columns. */
function leadUpdateFor(
  type: EnrichmentType,
  found: boolean,
  value: string | null,
  method: string,
  source: string,
  nowIso: string,
): Record<string, unknown> {
  if (type === "email") {
    return {
      ...(found && value ? { email: value } : {}),
      email_status: found ? "found" : "none",
      email_method: method,
      email_last_checked_at: nowIso,
      enrichment_source: source,
    };
  }
  if (type === "facebook") {
    return {
      ...(found && value ? { facebook_url: value } : {}),
      facebook_status: found ? "found" : "none",
      facebook_method: method,
      facebook_last_checked_at: nowIso,
      enrichment_source: source,
    };
  }
  // instagram
  return {
    ...(found && value ? { instagram_url: value } : {}),
    instagram_status: found ? "found" : "none",
    instagram_method: method,
    instagram_last_checked_at: nowIso,
    enrichment_source: source,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth (same pattern as extract-email) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    // --- Parse + validate ---
    const body = await req.json().catch(() => ({}));
    const leadId: string = typeof body.lead_id === "string" ? body.lead_id : "";
    const enrichmentType = body.enrichment_type as EnrichmentType;
    const placeId: string = typeof body.place_id === "string" ? body.place_id : "";
    const businessName: string = typeof body.business_name === "string" ? body.business_name : "";
    const website: string | null = typeof body.website === "string" && body.website.trim() ? body.website.trim() : null;

    if (!leadId) return json({ success: false, error: "lead_id required" }, 400);
    if (!VALID_TYPES.includes(enrichmentType)) {
      return json({ success: false, error: "enrichment_type must be email | facebook | instagram" }, 400);
    }

    // Service-role client for all privileged reads/writes (cache, usage, lead).
    const service = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const nowIso = new Date().toISOString();
    const cacheKey = `${placeId || `lead:${leadId}`}:${enrichmentType}`;

    const applyToLead = async (
      found: boolean,
      value: string | null,
      method: string,
      source: string,
    ) => {
      const updates = leadUpdateFor(enrichmentType, found, value, method, source, nowIso);
      await service.from("outreach_leads").update(updates).eq("id", leadId);
    };

    // ── 1) CACHE CHECK (hit = no cost, no cap) ──────────────────────────────
    const { data: cached } = await service
      .from("enrichment_cache")
      .select("result, expires_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    const cacheFresh = cached && (!cached.expires_at || new Date(cached.expires_at) > new Date());
    if (cacheFresh) {
      const r = (cached!.result ?? {}) as { found?: boolean; value?: string | null; method?: string; source?: string };
      const found = !!r.found;
      const value = r.value ?? null;
      const method = r.method ?? "apify";
      const source = r.source ?? "apify";
      await applyToLead(found, value, method, source);
      return json({ success: true, cached: true, found, value, cost_usd: 0, method, source });
    }

    // ── 2) EMAIL + WEBSITE: free, accurate website path BEFORE any Apify ─────
    if (enrichmentType === "email" && website) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/extract-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            apikey: anonKey,
          },
          body: JSON.stringify({ websiteUrl: website }),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.success && data?.email) {
          const method = "website_scrape";
          const source = "website_scrape";
          // Cache the free result so we don't even re-scrape next time.
          await service.from("enrichment_cache").upsert(
            {
              cache_key: cacheKey,
              enrichment_type: enrichmentType,
              result: { found: true, value: data.email, method, source },
              created_at: nowIso,
              expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 86400000).toISOString(),
            },
            { onConflict: "cache_key" },
          );
          // $0 usage row keeps per-type provenance complete for the intelligence layer.
          await service.from("enrichment_usage").insert({
            user_id: userId,
            enrichment_type: enrichmentType,
            cost_usd: 0,
          });
          await applyToLead(true, data.email, method, source);
          return json({ success: true, cached: false, found: true, value: data.email, cost_usd: 0, method, source });
        }
        // else: no email on the site → fall through to the Apify path.
      } catch (e) {
        console.error("enrich-lead: website email path failed (falling through to Apify):", e);
      }
    }

    // ── 3) DAILY COST CAP (durable, last 24h) ───────────────────────────────
    const since = new Date(Date.now() - 86400000).toISOString();
    const { data: usageRows } = await service
      .from("enrichment_usage")
      .select("cost_usd")
      .eq("user_id", userId)
      .gte("created_at", since);
    const spent = (usageRows ?? []).reduce((s: number, r: { cost_usd: number | null }) => s + Number(r.cost_usd ?? 0), 0);

    if (spent >= DAILY_CAP_USD) {
      // Refuse WITHOUT calling the stub — no cost incurred.
      return json({
        success: false,
        limit_reached: true,
        error: "Daily enrichment limit reached. Try again tomorrow.",
        spent_usd: Number(spent.toFixed(2)),
        cap_usd: DAILY_CAP_USD,
      });
    }

    // ── 4) UNDER CAP: call the Apify STUB ───────────────────────────────────
    const result = await apifyEnrich({ enrichmentType, placeId, businessName, website });
    const method = result.found ? "apify" : "apify";
    const source = "apify";

    // ── 5) PERSIST: cache + usage + api_usage_log + the lead ────────────────
    await service.from("enrichment_cache").upsert(
      {
        cache_key: cacheKey,
        enrichment_type: enrichmentType,
        result: { found: result.found, value: result.value, method, source },
        created_at: nowIso,
        expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 86400000).toISOString(),
      },
      { onConflict: "cache_key" },
    );
    await service.from("enrichment_usage").insert({
      user_id: userId,
      enrichment_type: enrichmentType,
      cost_usd: result.costUsd,
    });
    await service.from("api_usage_log").insert({
      user_id: userId,
      function_name: "enrich-lead",
      api_type: `apify_${enrichmentType}`,
      calls_made: 1,
      cache_hit: false,
      estimated_cost_usd: result.costUsd,
      trigger_source: "enrichment",
    });
    await applyToLead(result.found, result.value, method, source);

    return json({
      success: true,
      cached: false,
      found: result.found,
      value: result.value,
      cost_usd: result.costUsd,
      method,
      source,
      mode: result.mode,
    });
  } catch (error) {
    console.error("enrich-lead error:", error);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
