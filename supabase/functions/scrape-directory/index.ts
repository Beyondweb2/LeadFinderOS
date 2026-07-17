import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapsDiscover } from "../_shared/enrichment/sources.ts";

// scrape-directory — admin-triggered scrape of ONE niche+area into directory_businesses, the
// fact-dense raw pool used to build "best [niche] in [area]" directory pages. Reuses the
// existing Apify maps discover (mapsDiscover, detail:true) — rating + review count + address +
// category captured per place. Upserts on (niche, area, place_id) so re-scraping updates rather
// than duplicates. is_client / lead_id are left untouched here — the client-matching pass (Piece 3)
// fills them in. Auth mirrors process-ai-audit-queue's admin gate; writes use the service role.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MAX_PLACES = 25;
const ACTOR_TIMEOUT_MS = 120_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: require an authenticated ADMIN user (mirrors process-ai-audit-queue). ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: roleRow } = await service
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, error: "forbidden" }, 403);

    // --- Body ---
    const body = await req.json().catch(() => ({}));
    const niche: string = typeof body.niche === "string" ? body.niche.trim() : "";
    const area: string = typeof body.area === "string" ? body.area.trim() : "";
    if (!niche) return json({ ok: false, error: "niche required" }, 400);
    if (!area) return json({ ok: false, error: "area required" }, 400);
    const maxPlaces = typeof body.maxPlaces === "number" && Number.isFinite(body.maxPlaces) && body.maxPlaces > 0
      ? Math.min(Math.floor(body.maxPlaces), 200)
      : DEFAULT_MAX_PLACES;
    // Store niche/area normalised (lowercased/trimmed) so the unique index + page lookups are stable.
    const nicheKey = niche.toLowerCase();
    const areaKey = area.toLowerCase();

    const apifyToken = Deno.env.get("APIFY_TOKEN") ?? "";
    if (!apifyToken) return json({ ok: false, error: "apify_not_configured" }, 500);

    // --- Scrape (fact-dense: detail:true → rating + review count) ---
    let places;
    try {
      const out = await mapsDiscover({
        keyword: `${niche} in ${area}`,
        location: area,
        maxPlaces,
        token: apifyToken,
        timeoutMs: ACTOR_TIMEOUT_MS,
        detail: true,
      });
      places = out.places;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const aborted = (e as Error)?.name === "AbortError";
      return json({ ok: false, error: aborted ? "actor_timeout" : "actor_failed", detail: msg.slice(0, 300) }, 502);
    }

    const scraped = Array.isArray(places) ? places.length : 0;

    // --- Map to directory_businesses rows; skip places with no placeId or no title. ---
    const nowIso = new Date().toISOString();
    const rows = (places ?? [])
      .filter((p) => p.placeId && p.title)
      .map((p) => ({
        niche: nicheKey,
        area: areaKey,
        place_id: p.placeId,
        name: p.title,
        website: p.website ?? null,
        phone: p.phone ?? null,
        address: p.address ?? null,
        city: p.city ?? null,
        postal_code: p.postalCode ?? null,
        category: p.category ?? null,
        rating: p.rating ?? null,
        review_count: p.reviewCount ?? null,
        source: "apify",
        scraped_at: nowIso,
      }));

    if (rows.length === 0) return json({ ok: true, niche: nicheKey, area: areaKey, scraped, written: 0 });

    // Upsert on the partial unique index (niche, area, place_id) — re-scraping updates in place.
    const { error: upErr } = await service
      .from("directory_businesses")
      .upsert(rows, { onConflict: "niche,area,place_id" });
    if (upErr) return json({ ok: false, error: "store_failed", detail: upErr.message }, 500);

    return json({ ok: true, niche: nicheKey, area: areaKey, scraped, written: rows.length });
  } catch (e) {
    console.error("scrape-directory error:", e);
    return json({ ok: false, error: "internal_error", detail: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
