// enrich-business — per-lead combined enrichment (sub-phase 2A).
//
// One operator-triggered "Enrich" gathers, for a single lead:
//   • contacts: email / Facebook / Instagram (from one mapsEnrich — already real)
//   • WhatsApp-capability signal: HLR line-type via Twilio Lookup (mobile/landline)
//   • image pool: Maps photos (+ FB/IG photos, graceful) → candidates for the picker
//   • a low-confidence flag when the business can't be verified (no place ref or
//     the matched name differs) — so we never silently attach wrong-company data.
//
// Goes through the shared runner (enrichment_cache + $2/day cap + api_usage_log).
// Auth mirrors enrich-lead. Honesty: missing = nothing; contacts auto-applied to
// the lead ONLY when the match is high-confidence; line_type (about the lead's own
// phone) is always safe to store. The image pool is returned + cached, not forced
// onto the lead. Re-hosting of CHOSEN images happens later (2B/2C).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapsEnrich } from "../_shared/enrichment/sources.ts";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { lookupLineType } from "../_shared/enrichment/whatsapp.ts";
import { fetchFacebookContacts, fetchFacebookPhotos, fetchInstagramPhotos } from "../_shared/enrichment/socialImages.ts";

/** Last-resort Facebook URL discovery: crawl the business website for a FB link
 *  via the existing extract-facebook function. Graceful — "" on any failure. */
async function discoverFacebookFromWebsite(website: string, authHeader: string): Promise<string> {
  if (!website) return "";
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-facebook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify({ websiteUrl: website }),
    });
    if (!res.ok) return "";
    const d = await res.json();
    return typeof d?.facebookUrl === "string" ? d.facebookUrl : "";
  } catch {
    return "";
  }
}

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

/** Token-overlap name similarity (0–1) to sanity-check the matched business. */
function nameSimilarity(a: string, b: string): number {
  const toks = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1));
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

interface EnrichResult {
  email: string | null;
  facebook: string | null;
  instagram: string | null;
  lineType: string;
  imagePool: string[];
  poolBreakdown: { maps: number; facebook: number; instagram: number };
  match: { title: string | null; address: string | null; similarity: number; lowConfidence: boolean };
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
    const leadId: string = body.lead_id ?? "";
    const placeId: string = body.place_id ?? "";
    const googleMapsUrl: string = body.google_maps_url ?? "";
    const phone: string = body.phone ?? "";
    const country: string | null = body.country ?? null;
    const businessName: string = body.business_name ?? "";
    const existingFacebook: string = body.facebook_url ?? "";
    const existingInstagram: string = body.instagram_url ?? "";
    const website: string = body.website ?? "";
    if (!leadId) return json({ error: "lead_id required" }, 400);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const apifyToken = Deno.env.get("APIFY_TOKEN");
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const hasPlaceRef = !!(placeId || googleMapsUrl);

    const cacheKey = `${placeId || googleMapsUrl || `lead:${leadId}`}:business_enrich`;

    const outcome = await runEnrichSource<EnrichResult>({
      service,
      userId,
      type: "business_enrich",
      cacheKey,
      estCostUsd: 0.035, // maps enrich + twilio + social photos
      run: async () => {
        // 1) Maps enrich (contacts + Maps photos + the matched business identity).
        let place = null;
        if (apifyToken && hasPlaceRef) {
          try {
            const r = await mapsEnrich({
              googleMapsUrl: googleMapsUrl || undefined,
              placeId: placeId || undefined,
              token: apifyToken,
              maxReviews: 0, // contacts/images only here; reviews handled at generate
              maxImages: 12,
              timeoutMs: 90_000,
            });
            place = r.place;
          } catch (e) {
            console.error("[enrich-business] mapsEnrich error:", (e as Error).message);
          }
        }

        // 2) Discover the FB/IG profile URLs via a CASCADE — only scrape socials
        //    when a URL actually exists (don't pay for a profile that isn't there).
        //    FB: existing → Maps → website crawl. IG: existing → Maps.
        let fbUrl = existingFacebook || place?.facebook || "";
        if (!fbUrl) fbUrl = await discoverFacebookFromWebsite(website, authHeader);
        const igUrl = existingInstagram || place?.instagram || "";

        // 3) Conditional FB/IG scrape: FB → email (pages-scraper) + photos
        //    (photos-scraper); IG → photos. Skipped entirely when no URL.
        let fbEmail: string | null = null;
        let fbPhotos: string[] = [];
        let igPhotos: string[] = [];
        if (apifyToken) {
          const [fbContacts, fbP, igP] = await Promise.all([
            fbUrl ? fetchFacebookContacts(fbUrl, { token: apifyToken }) : Promise.resolve({ email: null, website: null }),
            fbUrl ? fetchFacebookPhotos(fbUrl, { token: apifyToken, max: 20 }) : Promise.resolve([]),
            igUrl ? fetchInstagramPhotos(igUrl, { token: apifyToken, max: 20 }) : Promise.resolve([]),
          ]);
          fbEmail = fbContacts.email;
          fbPhotos = fbP;
          igPhotos = igP;
        }

        const mapsPhotos = place?.imageUrls ?? [];
        const imagePool = Array.from(
          new Set([...mapsPhotos, ...fbPhotos, ...igPhotos]),
        ).slice(0, 40);
        const poolBreakdown = { maps: mapsPhotos.length, facebook: fbPhotos.length, instagram: igPhotos.length };

        // 4) HLR line-type (Twilio) — about the lead's OWN phone, always safe.
        let lineType = "unknown";
        if (twilioSid && twilioToken && phone) {
          lineType = await lookupLineType(phone, { sid: twilioSid, token: twilioToken, country });
        }

        // 5) Match confidence — high when we enriched a real place whose name
        //    matches; low when there's no place ref or the name differs.
        const sim = place?.title && businessName ? nameSimilarity(place.title, businessName) : 0;
        const lowConfidence = !hasPlaceRef || (!!place?.title && sim < 0.34);

        // Email: Maps first, then the Facebook page (where trades often list it).
        const email = place?.emails?.[0] ?? fbEmail ?? null;

        const result: EnrichResult = {
          email,
          facebook: fbUrl || null,
          instagram: igUrl || null,
          lineType,
          imagePool,
          poolBreakdown,
          match: {
            title: place?.title ?? null,
            address: place?.address ?? null,
            similarity: Number(sim.toFixed(2)),
            lowConfidence,
          },
        };
        return { result, costUsd: 0.035 };
      },
    });

    if (outcome.capReached) {
      return json({ success: false, limit_reached: true, error: "Daily enrichment limit reached.", spent_usd: outcome.spentUsd });
    }
    const r = outcome.result;
    if (!r) return json({ success: false, error: "Enrichment returned nothing." });

    // Persist: line_type always; contacts only when high-confidence (no silent
    // wrong-company attach). The image pool is returned for the picker, not forced.
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      ...(r.lineType ? { line_type: r.lineType, line_type_checked_at: now } : {}),
    };
    if (!r.match.lowConfidence) {
      if (r.email) Object.assign(update, { email: r.email, email_status: "found", email_method: "apify", email_last_checked_at: now, enrichment_source: "apify" });
      if (r.facebook) Object.assign(update, { facebook_url: r.facebook, facebook_status: "found", facebook_method: "apify", facebook_last_checked_at: now });
      if (r.instagram) Object.assign(update, { instagram_url: r.instagram, instagram_status: "found", instagram_method: "apify", instagram_last_checked_at: now });
    }
    if (Object.keys(update).length) {
      try { await service.from("outreach_leads").update(update).eq("id", leadId); } catch { /* non-blocking */ }
    }

    return json({
      success: true,
      cached: outcome.cached,
      applied: !r.match.lowConfidence,
      ...r,
    });
  } catch (e) {
    console.error("[enrich-business] error:", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});
