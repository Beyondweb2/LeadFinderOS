// clear-enrichment-cache — operator-triggered cache invalidation for a set of
// businesses. enrichment_cache is RLS service-role-only (no authenticated policy),
// so deletion MUST be server-side. Deletes ONLY enrichment_cache rows whose
// cache_key starts with a business identifier prefix (placeId / googleMapsUrl /
// lead:leadId) — covering :business_enrich, :maps_enrich, :services, :website_check —
// so the next Enrich or site regeneration re-fetches fresh. No other table touched.
//
// Auth mirrors enrich-business: a Bearer token identifying an authenticated user is
// required; the deletes then run under a service-role client (the only role granted
// on enrichment_cache).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-job, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface BusinessRef {
  placeId?: string | null;
  googleMapsUrl?: string | null;
  leadId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Auth required" }, 401);
    const token = authHeader.replace("Bearer ", "");

    // Authenticated-user check — mirrors enrich-business's non-internal path.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
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
    const businesses: BusinessRef[] = Array.isArray(body?.businesses) ? body.businesses : [];
    if (!businesses.length) return json({ error: "businesses required" }, 400);

    // Service-role client — the only role granted on enrichment_cache (RLS: no
    // authenticated policy). Same construction as enrich-business.
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    let cleared = 0;
    for (const b of businesses) {
      if (!b || typeof b.leadId !== "string" || !b.leadId) continue;
      // Every prefix this business's cache_key could carry. The codebase builds keys as
      // `${placeId || googleMapsUrl || `lead:${leadId}`}:<type>`, so rows may exist under
      // any of these across enrich runs — delete them all (best-effort, batch never aborts).
      const prefixes: string[] = [];
      if (b.placeId) prefixes.push(`${b.placeId}:%`);
      if (b.googleMapsUrl) prefixes.push(`${b.googleMapsUrl}:%`);
      prefixes.push(`lead:${b.leadId}:%`);
      for (const prefix of prefixes) {
        try {
          await service.from("enrichment_cache").delete().like("cache_key", prefix);
        } catch (e) {
          console.error(`[clear-enrichment-cache] delete failed for prefix ${prefix}:`, (e as Error).message);
        }
      }
      cleared++;
    }

    return json({ ok: true, cleared });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
