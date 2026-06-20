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
import type { NormalizedPlace } from "../_shared/enrichment/apify.ts";
import { mapsEnrich } from "../_shared/enrichment/sources.ts";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { lookupLineType } from "../_shared/enrichment/whatsapp.ts";
import { fetchFacebookContacts, fetchFacebookPhotos, fetchInstagramPhotos } from "../_shared/enrichment/socialImages.ts";

/** Last-resort social discovery: crawl the business website for FB + IG links via
 *  the extract-facebook function (one fetch returns both). Graceful — empty on
 *  any failure. */
async function discoverSocialsFromWebsite(
  website: string,
  authHeader: string,
): Promise<{ facebook: string; instagram: string }> {
  const empty = { facebook: "", instagram: "" };
  if (!website) return empty;
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
    if (!res.ok) return empty;
    const d = await res.json();
    return {
      facebook: typeof d?.facebookUrl === "string" ? d.facebookUrl : "",
      instagram: typeof d?.instagramUrl === "string" ? d.instagramUrl : "",
    };
  } catch {
    return empty;
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

/** Postcode "outward" code, e.g. "B1 2AB" → "b1" (the area+district part). */
function postcodeOutward(pc: string): string {
  return (pc || "").toUpperCase().replace(/\s+/g, " ").trim().split(" ")[0].toLowerCase();
}

/**
 * LOCATION-MATCH GUARD (Birmingham-vs-Swindon). A web-results FB/website can be a
 * same-name business in another city. Only trust it if the result's own text
 * (title/snippet/url) contains the lead's Maps city OR postcode-outward. Anything
 * else — different city, or no location signal at all — is UNCONFIRMED → not
 * auto-attached. Returns the matched needle for logging, or null.
 */
function locationMatch(candidateText: string, place: NormalizedPlace | null): string | null {
  const t = (candidateText || "").toLowerCase();
  if (!t || !place) return null;
  const needles: string[] = [];
  if (place.city) needles.push(place.city.toLowerCase().trim());
  const pcOut = postcodeOutward(place.postalCode ?? "");
  if (pcOut) needles.push(pcOut);
  // Town from the address tail (compass often omits `city` but keeps it in address).
  if (place.address) {
    for (const part of place.address.split(",").map((s) => s.trim().toLowerCase())) {
      if (part.length > 2 && !/^\d/.test(part)) needles.push(part);
    }
  }
  for (const n of needles) {
    if (n.length > 2 && t.includes(n)) return n;
  }
  return null;
}

interface EnrichResult {
  email: string | null;
  facebook: string | null;
  /** How `facebook` was found: 'manual' | 'apify' (maps/website-crawl) | 'websearch'. */
  facebookMethod: string | null;
  /** A web-results FB whose location did NOT match — surfaced for the operator to
   *  verify + paste manually, never auto-attached. */
  facebookSuggestion: { url: string; reason: string } | null;
  instagram: string | null;
  /** How `instagram` was found: 'manual' | 'apify' (maps/website-crawl) | 'websearch'. */
  instagramMethod: string | null;
  /** A web-results IG whose location did NOT match — verify + paste, not attached. */
  instagramSuggestion: { url: string; reason: string } | null;
  /** Discovered business website (own listing or location-matched web result). */
  website: string | null;
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

        // 2) Discover FB / IG / website via a SYMMETRIC CASCADE. For each social:
        //    existing → Maps listing → web-results (location-guarded) → website
        //    crawl. A web-found URL is trusted only when the result's text matches
        //    the lead's Maps location (Birmingham-vs-Swindon); otherwise it's a
        //    suggestion to verify, never auto-attached. Manual paste stays override.
        let fbUrl = existingFacebook || place?.facebook || "";
        let fbMethod: string | null = existingFacebook ? "manual" : place?.facebook ? "apify" : null;
        let fbSource = existingFacebook ? "manual" : place?.facebook ? "maps-listing" : "none";
        let fbLoc = "n/a";
        let fbSuggestion: { url: string; reason: string } | null = null;

        let igUrl = existingInstagram || place?.instagram || "";
        let igMethod: string | null = existingInstagram ? "manual" : place?.instagram ? "apify" : null;
        let igSource = existingInstagram ? "manual" : place?.instagram ? "maps-listing" : "none";
        let igLoc = "n/a";
        let igSuggestion: { url: string; reason: string } | null = null;

        // 2b) Web-results discovery (includeWebResults): FB, IG, and the website.
        const webResults = place?.webResults ?? [];
        let webSite = "";

        // [enrich-diag] TEMP: what did the raw sources actually contain? Strip after.
        console.log(`[enrich-diag] context: hasApifyToken=${!!apifyToken} hasPlaceRef=${hasPlaceRef} placeId=${placeId || "-"} mapsUrl=${googleMapsUrl ? "y" : "n"}`);
        console.log(`[enrich-diag] maps: present=${!!place} website=${place?.website ?? "null"} instagram=${place?.instagram ?? "null"} facebook=${place?.facebook ?? "null"} emails=${place?.emails?.length ?? 0} images=${place?.imageUrls?.length ?? 0}`);
        console.log(`[enrich-diag] webResults: count=${webResults.length}, first3=${JSON.stringify(webResults.slice(0, 3).map((w) => w.url))}`);
        if (webResults.length) {
          // First web-result on `domainRe`, with the SAME location guard for both.
          const fromWeb = (domainRe: RegExp): { url: string; matched: boolean } | null => {
            const entry = webResults.find((w) => domainRe.test(w.url));
            return entry ? { url: entry.url, matched: !!locationMatch(entry.text, place) } : null;
          };
          if (!fbUrl) {
            const r = fromWeb(/(?:^|\.)facebook\.com\//i);
            if (r?.matched) { fbUrl = r.url; fbMethod = "websearch"; fbSource = "web-results"; fbLoc = "matched"; }
            else if (r) { fbSuggestion = { url: r.url, reason: "location_mismatch" }; fbSource = "web-results"; fbLoc = "unconfirmed"; }
          }
          if (!igUrl) {
            const r = fromWeb(/(?:^|\.)instagram\.com\//i);
            if (r?.matched) { igUrl = r.url; igMethod = "websearch"; igSource = "web-results"; igLoc = "matched"; }
            else if (r) { igSuggestion = { url: r.url, reason: "location_mismatch" }; igSource = "web-results"; igLoc = "unconfirmed"; }
          }
          // A location-matched non-social website feeds the crawl + website store.
          const siteEntry = webResults.find(
            (w) => !/(?:facebook|instagram|twitter|x|youtube|tiktok|linkedin)\.com\//i.test(w.url),
          );
          if (siteEntry && locationMatch(siteEntry.text, place)) webSite = siteEntry.url;
        }

        // 2c) Last resort: crawl a website (lead's own, else a location-matched
        //     web-results site) for FB + IG links (one fetch returns both).
        if (!fbUrl || !igUrl) {
          const crawlSite = website || webSite;
          if (crawlSite) {
            const socials = await discoverSocialsFromWebsite(crawlSite, authHeader);
            console.log(`[enrich-diag] website-crawl: ran=y site=${crawlSite} foundFb=${socials.facebook || "none"} foundIg=${socials.instagram || "none"}`);
            const fromWebSite = crawlSite === webSite; // web-site was already location-checked
            if (!fbUrl && socials.facebook) {
              fbUrl = socials.facebook; fbMethod = fromWebSite ? "websearch" : "apify";
              fbSource = "website-crawl"; fbLoc = fromWebSite ? "matched" : "n/a";
            }
            if (!igUrl && socials.instagram) {
              igUrl = socials.instagram; igMethod = fromWebSite ? "websearch" : "apify";
              igSource = "website-crawl"; igLoc = fromWebSite ? "matched" : "n/a";
            }
          }
        }

        // 2d) Website to store on the lead: existing value wins (never overwrite),
        //     else the Maps listing's own website (own pin → trusted), else a
        //     location-matched web-results site.
        const discoveredWebsite = website || place?.website || webSite || "";
        const webSource = website ? "existing" : place?.website ? "maps-listing" : webSite ? "web-results" : "none";

        // Permanent provenance one-liners (one line per channel; not per-image).
        console.log(`[enrich] FB  via ${fbSource} (${fbLoc}): ${fbUrl || (fbSuggestion ? `${fbSuggestion.url} [suggestion]` : "none")}`);
        console.log(`[enrich] IG  via ${igSource} (${igLoc}): ${igUrl || (igSuggestion ? `${igSuggestion.url} [suggestion]` : "none")}`);
        console.log(`[enrich] WEB via ${webSource} (n/a): ${discoveredWebsite || "none"}`);

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
          facebookMethod: fbUrl ? fbMethod : null,
          facebookSuggestion: fbSuggestion,
          instagram: igUrl || null,
          instagramMethod: igUrl ? igMethod : null,
          instagramSuggestion: igSuggestion,
          website: discoveredWebsite || null,
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
      // Website: store when the lead has none (own-pin or location-matched → safe;
      // never overwrite an existing/manual value). Store-only, no reclassification.
      ...(!website && r.website ? { website: r.website } : {}),
    };
    if (!r.match.lowConfidence) {
      if (r.email) Object.assign(update, { email: r.email, email_status: "found", email_method: "apify", email_last_checked_at: now, enrichment_source: "apify" });
      if (r.facebook) Object.assign(update, { facebook_url: r.facebook, facebook_status: "found", facebook_method: r.facebookMethod ?? "apify", facebook_last_checked_at: now });
      if (r.instagram) Object.assign(update, { instagram_url: r.instagram, instagram_status: "found", instagram_method: r.instagramMethod ?? "apify", instagram_last_checked_at: now });
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
