// enrich-business — per-lead combined enrichment (sub-phase 2A).
//
// One operator-triggered "Enrich" gathers, for a single lead:
//   • contacts: email / Facebook / Instagram (from one mapsEnrich — already real)
//   • WhatsApp-capability signal: line_type defaulted to 'mobile' (Twilio HLR lookup
//     removed — it added latency and could hang a synchronous generate)
//   • image pool: Maps photos (+ FB/IG photos, graceful) → candidates for the picker
//   • a low-confidence flag when the business can't be verified (no place ref or
//     the matched name differs) — so we never silently attach wrong-company data.
//
// Goes through the shared runner (enrichment_cache + $2/day cap + api_usage_log).
// Auth mirrors enrich-lead. Honesty: missing = nothing; contacts auto-applied to
// the lead ONLY when the match is high-confidence; line_type (about the lead's own
// phone) is always safe to store. The image pool is returned + cached, not forced
// onto the lead. Re-hosting of CHOSEN images happens later (2B/2C).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { NormalizedPlace } from "../_shared/enrichment/apify.ts";
import { mapsEnrich } from "../_shared/enrichment/sources.ts";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { fetchFacebookContacts, fetchFacebookPhotos, fetchInstagramPhotos } from "../_shared/enrichment/socialImages.ts";
import { isAggregatorUrl, isPlatformSocialUrl, isSiteBuilderSocialUrl, socialHandle, canonicalSocialUrl, isUsableMapsListingSocial } from "../_shared/aggregators.ts";

/** Last-resort social discovery: crawl the business website for FB + IG links via
 *  the extract-facebook function (one fetch returns both). Graceful — empty on
 *  any failure. */
async function discoverSocialsFromWebsite(
  website: string,
  authHeader: string,
): Promise<{ facebook: string; instagram: string }> {
  const empty = { facebook: "", instagram: "" };
  if (!website) return empty;
  // ~10s bound: this site crawl must never hang a synchronous generate. On abort the
  // catch returns empty (non-fatal skip), so enrichment proceeds without it.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-facebook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify({ websiteUrl: website }),
      signal: controller.signal,
    });
    if (!res.ok) return empty;
    const d = await res.json();
    return {
      facebook: typeof d?.facebookUrl === "string" ? d.facebookUrl : "",
      instagram: typeof d?.instagramUrl === "string" ? d.instagramUrl : "",
    };
  } catch {
    return empty;
  } finally {
    clearTimeout(timeout);
  }
}

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

// Generic/industry words that carry no identifying signal — dropped before the
// handle name-match so a handle like "thebarbershop" can't match just on "barber".
const SOCIAL_NAME_STOP = new Set<string>([
  "the", "and", "co", "ltd", "limited", "uk", "official", "page", "salon", "salons",
  "barber", "barbers", "barbershop", "barbershops", "hair", "hairdresser", "hairdressers",
  "hairdressing", "beauty", "studio", "spa", "nails", "grooming", "cuts", "gents", "mens", "men",
]);

/**
 * Name-gate for socials found by CRAWLING the business's own website. Accept only
 * if the handle shares a meaningful (non-generic) name token with the business —
 * substring either way, so both "gfm_london" and run-together "gfmbarbers" match
 * "GFM Barbers", while "wix" does not. No distinctive tokens → unconfirmed (false).
 */
function socialHandleMatchesName(handle: string, businessName: string): boolean {
  const h = (handle || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!h) return false;
  const tokens = (businessName || "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !SOCIAL_NAME_STOP.has(t));
  if (tokens.length === 0) return false;
  return tokens.some((t) => h.includes(t) || t.includes(h));
}

/** A website-crawled social is the business's own only if it's not a site-builder's
 *  account (facebook.com/wix) AND its handle matches the business name. */
function acceptWebsiteSocial(url: string, businessName: string): boolean {
  if (isSiteBuilderSocialUrl(url)) return false;
  return socialHandleMatchesName(socialHandle(url), businessName);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Auth required" }, 401);
    const token = authHeader.replace("Bearer ", "");

    // Internal-call branch (bulk-jobs runner): a matching CRON_SECRET header (robust —
    // decoupled from the service-key comparison, which drifts here) OR the legacy
    // service-key + x-internal-job match. Purely additive — external/single-item
    // callers can never hold either, so the normal user path below is unchanged. The
    // acting user (for usage attribution) comes from the body.
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const isInternal =
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret && !!req.headers.get("x-internal-job")) ||
      (!!serviceRoleKey && token === serviceRoleKey && !!req.headers.get("x-internal-job"));

    const body = await req.json().catch(() => ({}));

    let userId: string | null = null;
    if (isInternal) {
      userId = (body.acting_user_id as string) ?? null;
    } else {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      try {
        const { data } = await userClient.auth.getClaims(token);
        userId = (data?.claims?.sub as string) ?? null;
      } catch { /* fall through */ }
      if (!userId) {
        const { data, error } = await userClient.auth.getUser(token);
        if (error || !data?.user) return json({ error: "Auth required" }, 401);
        userId = data.user.id;
      }
    }
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
    const hasPlaceRef = !!(placeId || googleMapsUrl);

    const cacheKey = `${placeId || googleMapsUrl || `lead:${leadId}`}:business_enrich`;

    const outcome = await runEnrichSource<EnrichResult>({
      service,
      userId,
      type: "business_enrich",
      cacheKey,
      estCostUsd: 0.035, // maps enrich (or :maps_enrich cache reuse) + social photos
      run: async () => {
        // 1) Maps enrich (contacts + Maps photos + the matched business identity).
        // DEDUP: when generate step 9a already ran the Maps actor THIS generate, it
        // cached the NormalizedPlace under `${placeId||mapsUrl}:maps_enrich`. Reuse
        // that fresh cache instead of launching a SECOND compass run. Standalone
        // callers (Enrich button / bulk enrich) have no such cache → fetch Maps below.
        let place: NormalizedPlace | null = null;
        if (apifyToken && hasPlaceRef) {
          const mapsCacheKey = `${placeId || googleMapsUrl}:maps_enrich`;
          try {
            const { data: cachedMaps } = await service
              .from("enrichment_cache")
              .select("result, expires_at")
              .eq("cache_key", mapsCacheKey)
              .maybeSingle();
            if (cachedMaps?.result && (!cachedMaps.expires_at || new Date(cachedMaps.expires_at as string) > new Date())) {
              place = cachedMaps.result as NormalizedPlace;
              console.log(`[enrich-business] Maps: reused :maps_enrich cache (no 2nd compass run) place=${place?.title ?? "∅"}`);
            }
          } catch (e) {
            console.error("[enrich-business] maps cache read failed (non-blocking):", (e as Error).message);
          }
          if (!place) {
            try {
              const r = await mapsEnrich({
                googleMapsUrl: googleMapsUrl || undefined,
                placeId: placeId || undefined,
                token: apifyToken,
                maxReviews: 0, // contacts/images only here; reviews handled at generate
                maxImages: 12,
                timeoutMs: 25_000,
              });
              place = r.place;
              // ── TEMP DIAGNOSTIC (remove after) — raw vs normalized web-results to tell
              //    bad source data from bad URL parsing (breadcrumb/ellipsis "..." class). ──
              try {
                const raw = (r.raw ?? {}) as Record<string, unknown>;
                console.log(`[enrich-DIAG] lead=${leadId} norm.facebook=${place?.facebook ?? "∅"} norm.instagram=${place?.instagram ?? "∅"}`);
                console.log(`[enrich-DIAG] RAW webResults=${JSON.stringify(raw.webResults)}`);
                console.log(`[enrich-DIAG] NORMALIZED webResults=${JSON.stringify(place?.webResults ?? [])}`);
              } catch (de) { console.log(`[enrich-DIAG] log err: ${(de as Error).message}`); }
            } catch (e) {
              console.error("[enrich-business] mapsEnrich error:", (e as Error).message);
            }
          }
        }

        // 2) Discover FB / IG / website via a SYMMETRIC CASCADE, most-reliable first:
        //    existing(manual) → Maps listing → OWN-SITE CRAWL (trusted) → web-results
        //    (location-guarded, last resort). The own-site crawl is preferred over
        //    web-results because web results for a generic search mix DIFFERENT
        //    companies; a link on the business's own site is definitively theirs.
        //    A web-results URL is trusted only when its text matches the lead's Maps
        //    location (Birmingham-vs-Swindon); else it's a suggestion to verify,
        //    never auto-attached. Manual paste stays the override.
        // Maps-listing socials, minus any that are a platform's OWN account
        // (e.g. facebook.com/fresha). NEW: also name-gate + builder-denylist them
        // (same as website-crawl) — a Maps listing can carry a builder/wrong FB
        // (e.g. facebook.com/wix). Fail → not attached, surfaced as a suggestion.
        // Maps-listing socials are TRUSTED without a name-match — Google already tied
        // them to THIS business pin, so opaque handles (facebook.com/MrMGCB for "Magic
        // Hands Barber") are accepted. We still drop a platform's own account
        // (facebook.com/fresha) and a builder's account (facebook.com/wix) via
        // isUsableMapsListingSocial. The strict name-gate stays on website-crawl +
        // web-results below (those mix companies). Deep links are reduced to the page
        // root in a single pass after the cascade so /reels/ etc. don't break scrapers.
        const mapsFb = place?.facebook && isUsableMapsListingSocial(place.facebook) ? place.facebook : "";
        const mapsIg = place?.instagram && isUsableMapsListingSocial(place.instagram) ? place.instagram : "";
        let fbUrl = existingFacebook || mapsFb;
        let fbMethod: string | null = existingFacebook ? "manual" : mapsFb ? "apify" : null;
        let fbSource = existingFacebook ? "manual" : mapsFb ? "maps-listing" : "none";
        let fbLoc = "n/a";
        let fbSuggestion: { url: string; reason: string } | null = null;

        let igUrl = existingInstagram || mapsIg;
        let igMethod: string | null = existingInstagram ? "manual" : mapsIg ? "apify" : null;
        let igSource = existingInstagram ? "manual" : mapsIg ? "maps-listing" : "none";
        let igLoc = "n/a";
        let igSuggestion: { url: string; reason: string } | null = null;

        // 2b) Resolve the business's OWN website. Web-results mix companies (same
        //     search term), so a web-results "website" is only trusted when its text
        //     matches the lead's location — AND we reduce it to its ROOT DOMAIN.
        //     Google returns websites as breadcrumbs ("abbeyplumbers.co.uk › Plumbing")
        //     where the segments are SUB-PAGES, not a real path — so strip to origin
        //     (homepage) where the footer/contact socials actually live. (Social
        //     breadcrumbs are different — there the segment IS the handle — so this
        //     root-strip is applied to WEBSITES only, not to social URLs.)
        const rootDomain = (u: string): string => {
          try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).origin; } catch { return ""; }
        };
        const webResults = place?.webResults ?? [];
        let webSite = "";
        if (webResults.length) {
          // First web result that's a real own-site: not a social/directory AND not
          // a booking platform (Fresha/Booksy/… are never the business's website).
          const siteEntry = webResults.find((w) => !isAggregatorUrl(w.url));
          if (siteEntry && locationMatch(siteEntry.text, place)) webSite = rootDomain(siteEntry.url);
        }

        // 2c) OWN-SITE CRAWL (TRUSTED, runs first). A FB/IG link on the business's
        //     own website definitely belongs to them — far more reliable than
        //     web-results (which mix companies). Crawl the best own-site we have:
        //     lead's stored → Maps-listing own pin → location-matched web-results
        //     root. No per-link location guard needed — it's their own site.
        // Crawl the best OWN site — never a booking platform / directory / social
        // (crawling those pulls the PLATFORM's socials + images, not the business's).
        const ownSite = [website, place?.website, webSite].find((u) => u && !isAggregatorUrl(u)) || "";
        if (ownSite && (!fbUrl || !igUrl)) {
          const socials = await discoverSocialsFromWebsite(ownSite, authHeader);
          // Name-gate (NEW): a site's template can link a BUILDER's social (Wix-built
          // site → facebook.com/wix). Accept only when the handle matches the business
          // name + isn't a builder account; otherwise downgrade to an unconfirmed
          // suggestion so it's never saved as their social or used for image scraping.
          if (!fbUrl && socials.facebook && !isPlatformSocialUrl(socials.facebook)) {
            if (acceptWebsiteSocial(socials.facebook, businessName)) { fbUrl = socials.facebook; fbMethod = "apify"; fbSource = "website-crawl"; fbLoc = "name-match"; }
            else { fbSuggestion = { url: socials.facebook, reason: "name_mismatch" }; fbSource = "website-crawl"; fbLoc = "unconfirmed"; }
          }
          if (!igUrl && socials.instagram && !isPlatformSocialUrl(socials.instagram)) {
            if (acceptWebsiteSocial(socials.instagram, businessName)) { igUrl = socials.instagram; igMethod = "apify"; igSource = "website-crawl"; igLoc = "name-match"; }
            else { igSuggestion = { url: socials.instagram, reason: "name_mismatch" }; igSource = "website-crawl"; igLoc = "unconfirmed"; }
          }
        }

        // 2d) WEB-RESULTS socials — LAST RESORT, location-guarded (results mix
        //     companies). Match → attach ('websearch'); mismatch/unconfirmed →
        //     surfaced as a suggestion to verify, never auto-attached.
        if (webResults.length && (!fbUrl || !igUrl)) {
          const fromWeb = (domainRe: RegExp): { url: string; matched: boolean } | null => {
            // Skip a platform's own social account (facebook.com/fresha etc.).
            const entry = webResults.find((w) => domainRe.test(w.url) && !isPlatformSocialUrl(w.url));
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
        }

        // 2e) Website to store on the lead — first REAL own-site (never a booking
        //     platform / directory): existing → Maps listing → web-results root.
        const websiteCandidates: [string, string][] = [
          [website, "existing"],
          [place?.website ?? "", "maps-listing"],
          [webSite, "web-results"],
        ];
        const wsHit = websiteCandidates.find(([u]) => u && !isAggregatorUrl(u));
        const discoveredWebsite = wsHit?.[0] ?? "";
        const webSource = wsHit?.[1] ?? "none";

        // Reduce every resolved/suggested FB/IG URL to its page root (idempotent),
        // covering all sources (manual, Maps, website-crawl, web-results) so /reels/,
        // /posts/, /about deep links don't break the FB/IG scrapers or get stored raw.
        if (fbUrl) fbUrl = canonicalSocialUrl(fbUrl);
        if (igUrl) igUrl = canonicalSocialUrl(igUrl);
        if (fbSuggestion) fbSuggestion = { ...fbSuggestion, url: canonicalSocialUrl(fbSuggestion.url) };
        if (igSuggestion) igSuggestion = { ...igSuggestion, url: canonicalSocialUrl(igSuggestion.url) };

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
            fbUrl ? fetchFacebookContacts(fbUrl, { token: apifyToken, timeoutMs: 25_000 }) : Promise.resolve({ email: null, website: null }),
            fbUrl ? fetchFacebookPhotos(fbUrl, { token: apifyToken, max: 20, timeoutMs: 25_000 }) : Promise.resolve([]),
            igUrl ? fetchInstagramPhotos(igUrl, { token: apifyToken, max: 20, timeoutMs: 25_000 }) : Promise.resolve([]),
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

        // 4) Line-type: the Twilio HLR lookup was removed (extra latency + could hang
        //    a synchronous generate). Default to 'mobile' so downstream WhatsApp-
        //    eligibility checks still see a valid mobile value; persisted with
        //    line_type_checked_at below (the existing update writes both when truthy).
        const lineType = "mobile";

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
