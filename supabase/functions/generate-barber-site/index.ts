// generate-barber-site
//
// Admin-only edge function. Given a lead_id, it reads that lead's REAL data from
// outreach_leads, asks OpenAI to write barbershop site copy under strict honesty
// rules (never invent facts), and saves the result to generated_sites.content.
//
// Auth: mirrors the admin-users pattern exactly — verify JWT manually (getClaims
// with getUser fallback), then confirm the caller has the 'admin' role via the
// user_roles table using the service-role client. verify_jwt is false in
// config.toml because we verify inside the function.
//
// Honesty enforcement: the model is instructed to invent nothing, AND the server
// re-applies the verifiable facts after parsing (defense in depth). Anything we
// don't actually have in the lead is omitted, never fabricated.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";
import type { NormalizedPlace } from "../_shared/enrichment/apify.ts";
import { mapsEnrich } from "../_shared/enrichment/sources.ts";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-job, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string>,
  extra?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json", ...(extra || {}) },
  });
}

// ---- Cost/usage logging -----------------------------------------------------
// Mirrors google-place-details: best-effort insert into api_usage_log, never
// blocks the response. Same table + columns; api_type is parameterised so this
// one function can log both its Google Places call and its OpenAI call.
const GOOGLE_PLACE_DETAILS_COST_USD = 0.017; // matches google-place-details' per-miss estimate
// gpt-4o-mini list price (USD per 1M tokens). Used to estimate per-generation AI cost.
const OPENAI_INPUT_USD_PER_M = 0.15;
const OPENAI_OUTPUT_USD_PER_M = 0.6;

async function logUsage(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  apiType: string,
  costUsd: number,
) {
  try {
    await supabase.from("api_usage_log").insert({
      user_id: userId,
      function_name: "generate-barber-site",
      api_type: apiType,
      calls_made: 1,
      cache_hit: false,
      estimated_cost_usd: costUsd,
      trigger_source: "site_generation",
    });
  } catch (e) {
    console.error("[GENERATE-BARBER-SITE] Usage logging failed (non-blocking):", e);
  }
}

// ---- Content contract (mirrors src/templates/barber/types.ts) ----------------
interface BarberService {
  name: string;
  description?: string;
  price?: string;
  durationMins?: number;
}
interface BarberOpeningHours {
  day: string;
  open: string;
}
interface BarberSiteContent {
  businessName: string;
  tagline: string;
  heroHeadline: string;
  about: string;
  services: BarberService[];
  hours: BarberOpeningHours[];
  phone: string;
  address: string;
  googleRating?: number;
  reviewCount?: number;
  showExamplePrices?: boolean;
  googleReviewsUrl?: string;
  heroImageUrl?: string;
  aboutImageUrl?: string;
  galleryImageUrls?: string[];
  // Real, verified socials (stored enrichment values only — never fabricated, never
  // a location-mismatch suggestion). Rendered as icons; omitted when absent.
  facebookUrl?: string;
  instagramUrl?: string;
  // Optional trade-template sections (plumber). Generic, operator-editable later.
  whyUsImageUrl?: string;
  whyUsPoints?: string[];
  processSteps?: { title: string; description: string }[];
  faqs?: { question: string; answer: string }[];
  serviceArea?: string;
  // Real Google reviews (Apify deep-enrich). Empty/absent → templates show no
  // testimonial cards (never fabricated).
  reviews?: { author: string; text: string; rating?: number; date?: string }[];
}

// Which design template to generate for. Selected by the admin in the Outreach
// table and stored on the generated_sites row; also steers the copy flavour.
type SiteTemplate = "barber" | "salon" | "plumber";

// Default service set used ONLY when the lead has no stored services. Generic
// names + generic descriptions — no prices, no business-specific claims. One set
// per template so an unknown salon doesn't get a barber's beard services.
const DEFAULT_SERVICES_BY_TEMPLATE: Record<SiteTemplate, BarberService[]> = {
  barber: [
    { name: "Signature Cut", description: "A tailored cut and finish to suit you." },
    { name: "Skin Fade", description: "A clean, gradual fade from skin upwards." },
    { name: "Cut & Beard", description: "A full cut paired with a beard tidy-up." },
    { name: "Beard Trim & Shape", description: "Shaping and tidying to keep the beard sharp." },
    { name: "Hot-Towel Wet Shave", description: "A traditional close shave with a hot towel." },
    { name: "Under 12s", description: "A relaxed cut for younger clients." },
  ],
  salon: [
    { name: "Cut & Finish", description: "A tailored cut finished with a blow-dry." },
    { name: "Balayage", description: "Hand-painted, blended colour through the lengths." },
    { name: "Full Head Colour", description: "Even colour from root to tip." },
    { name: "Gloss & Toner", description: "A shine boost to refresh and balance the tone." },
    { name: "Blow-Dry", description: "A smooth, polished finish." },
    { name: "Conditioning Treatment", description: "A nourishing treatment for the hair." },
  ],
  plumber: [
    { name: "Bathroom & kitchen plumbing", description: "Taps, toilets, showers and pipework fitted and repaired." },
    { name: "Blocked toilets, sinks & drains", description: "Toilets, sinks and external drains cleared with minimal disruption." },
    { name: "Leak detection & repairs", description: "Hidden leaks located and fixed, plus reliable everyday repairs." },
    { name: "Boilers & central heating", description: "Boiler repairs, servicing and heating work to keep you warm." },
    { name: "Emergency call-outs", description: "Burst pipes and major leaks — fast response when it can't wait." },
    { name: "General plumbing & maintenance", description: "Day-to-day upkeep, inspections and non-emergency fixes." },
  ],
};

// Generic plumber sections (not business-factual — safe defaults, operator-editable
// in Phase 3). Injected into content only when template === 'plumber'. Reviews are
// NOT included here: the honesty rule means we never fabricate testimonials.
const PLUMBER_WHY_US = [
  "Clear pricing options before we start",
  "Expert, guaranteed workmanship",
  "Fast, friendly local service",
];
const PLUMBER_PROCESS = [
  { title: "Call or message", description: "Tell us the problem — we'll arrange a convenient visit or emergency attendance." },
  { title: "Assess & quote", description: "We diagnose on site and agree the price before work begins where possible." },
  { title: "Repair & test", description: "Quality parts and proven methods, with checks before we leave." },
  { title: "Invoice & guarantee", description: "Clear paperwork and a warranty on our labour." },
];
const PLUMBER_FAQS = [
  { question: "How quickly can you attend an emergency?", answer: "We prioritise urgent jobs such as major leaks and loss of water. Availability depends on your location — call us for the soonest slot." },
  { question: "Do you charge a call-out fee?", answer: "We explain any call-out or diagnostic charges before work starts, and give a clear quote for the repair wherever possible." },
  { question: "Which areas do you cover?", answer: "We serve homeowners and landlords across the local area. Contact us with your postcode to confirm coverage." },
  { question: "Can I use chemical drain cleaners?", answer: "They may work temporarily but can damage pipes with repeated use. For stubborn blockages a professional clear is safer and more effective." },
];

// Per-template copy cues: the business noun the model writes about, plus the
// factual GOOD/BAD 'about' examples. The honesty rules are identical for both —
// only the worked example and noun change so the copy reads naturally.
const TEMPLATE_COPY: Record<SiteTemplate, { noun: string; focus: string; good: string; bad: string }> = {
  barber: {
    noun: "barbershop",
    focus: "getting every cut right",
    good: "Northern Quarter Barber is a barbershop in Manchester, rated 4.5 from 203 Google reviews.",
    bad: "a welcoming shop where skilled barbers deliver a top-notch grooming experience.",
  },
  salon: {
    noun: "hair salon",
    focus: "getting every look right",
    good: "Aveline is a hair salon in London, rated 4.8 from 156 Google reviews.",
    bad: "a welcoming salon where talented stylists deliver a luxurious pampering experience.",
  },
  plumber: {
    noun: "plumbing service",
    focus: "fixing it right",
    good: "Riverside Plumbing is a plumbing service in Manchester, rated 4.9 from 112 Google reviews.",
    bad: "a trusted plumber delivering expert emergency repairs with a friendly, professional touch.",
  },
};

/**
 * Deterministic, factually-safe "about" text. Uses ONLY known data — verbatim
 * business name, a Google-verified town, real listed service names, and the real
 * Google rating/review count. It writes NO history, founders, years, awards or
 * subjective praise — by construction it cannot invent or flatter. Every clause
 * drops cleanly when its data is missing (no "rated undefined" / "0 reviews").
 */
function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
function buildAbout(opts: {
  name: string;
  noun: string;
  focus: string;
  area?: string;
  services: string[];
  rating?: number;
  reviewCount?: number;
}): string {
  const services = opts.services
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 3);

  let s1 = `${opts.name} is a ${opts.noun}`;
  if (opts.area && opts.area.trim()) s1 += ` in ${opts.area.trim()}`;
  s1 += ` focused on ${opts.focus}`;
  if (services.length) s1 += ` — ${joinNatural(services)}`;
  s1 += ".";

  const s2 = "Walk in or book ahead.";

  let s3 = "";
  if (
    typeof opts.rating === "number" && opts.rating > 0 &&
    typeof opts.reviewCount === "number" && opts.reviewCount > 0
  ) {
    const r = Number.isInteger(opts.rating) ? String(opts.rating) : opts.rating.toFixed(1);
    s3 = `Rated ${r} from ${opts.reviewCount} Google reviews.`;
  }

  return [s1, s2, s3].filter(Boolean).join(" ");
}

// ---- Google enrichment ------------------------------------------------------
// Reuses the SAME Google integration as the google-place-details function:
// Google Places API (New) at places.googleapis.com, authenticated with the
// existing GOOGLE_MAPS_API_KEY secret via the X-Goog-FieldMask header. No new key
// and no new Google service — only an expanded field mask so we also receive
// opening hours, rating and review count (google-place-details requests a slim
// phone/website mask for cost reasons and returns none of these).
//
// Best-effort only: any failure / empty result returns null and the caller
// proceeds with whatever it already has. Returns only real fetched values.
interface GoogleEnrichment {
  rating?: number;
  reviewCount?: number;
  hours?: BarberOpeningHours[];
  phone?: string;
  address?: string;
  mapsUri?: string;
  /** Verified town/city from Google address components (UK postal_town, else locality). */
  area?: string;
}

async function fetchGoogleEnrichment(placeId: string): Promise<GoogleEnrichment | null> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey || !placeId) return null;

  const fieldMask = [
    "rating",
    "userRatingCount",
    "regularOpeningHours.weekdayDescriptions",
    "internationalPhoneNumber",
    "nationalPhoneNumber",
    "formattedAddress",
    "addressComponents",
    "googleMapsUri",
  ].join(",");

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
    });
    if (!res.ok) {
      console.error("[GENERATE-BARBER-SITE] Google enrichment non-OK:", res.status);
      return null;
    }
    const g = await res.json();

    const out: GoogleEnrichment = {};
    if (typeof g.rating === "number" && g.rating > 0 && g.rating <= 5) out.rating = g.rating;
    if (typeof g.userRatingCount === "number" && g.userRatingCount >= 0) out.reviewCount = g.userRatingCount;

    const desc: unknown = g.regularOpeningHours?.weekdayDescriptions;
    if (Array.isArray(desc) && desc.length) {
      // Google returns localized strings like "Monday: 9:00 AM – 6:00 PM".
      const hours = desc
        .filter((l: unknown): l is string => typeof l === "string" && l.trim().length > 0)
        .map((line: string) => {
          const idx = line.indexOf(": ");
          return idx === -1
            ? { day: line.trim(), open: "" }
            : { day: line.slice(0, idx).trim(), open: line.slice(idx + 2).trim() };
        })
        .filter((h) => h.day);
      if (hours.length) out.hours = hours;
    }

    const phone = g.internationalPhoneNumber || g.nationalPhoneNumber;
    if (typeof phone === "string" && phone.trim()) out.phone = phone.trim();
    if (typeof g.formattedAddress === "string" && g.formattedAddress.trim()) out.address = g.formattedAddress.trim();
    // Verified town from Google's structured components (real data, not guessed):
    // prefer UK postal_town, then locality, then postal/admin area level 2.
    const comps: Array<{ longText?: string; types?: string[] }> = Array.isArray(g.addressComponents) ? g.addressComponents : [];
    const pick = (t: string) => comps.find((c) => Array.isArray(c.types) && c.types.includes(t))?.longText;
    const town = pick("postal_town") || pick("locality") || pick("administrative_area_level_2");
    if (typeof town === "string" && town.trim()) out.area = town.trim();
    // Canonical Google Maps link for the place (its reviews live on this page).
    if (typeof g.googleMapsUri === "string" && g.googleMapsUri.trim()) out.mapsUri = g.googleMapsUri.trim();

    return out;
  } catch (e) {
    console.error("[GENERATE-BARBER-SITE] Google enrichment failed (non-blocking):", (e as Error).message);
    return null;
  }
}

// Clean slug base from the business name — no random suffix. Uniqueness is
// enforced by the UNIQUE constraint on generated_sites.site_name; the caller
// appends -2, -3, … on conflict. (Draft privacy is already covered by RLS, which
// only exposes published rows, so the old "unguessable" hash is dropped.)
function slugify(name: string, fallback = "site"): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || fallback
  );
}

/**
 * Readable-but-secret claim/share token: the site slug for readability + a
 * crypto-strong url-safe random suffix that is the actual secret (e.g.
 * "mh-barber-Xk3p9Qz2a"). The slug is public (it's the /p/ + bookmybarber slug),
 * so the unguessable suffix is what protects claiming — never drop it. ~64 bits.
 */
function readableShareToken(slug: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (m) => (m === "+" ? "-" : m === "/" ? "_" : ""));
  return `${slug}-${suffix}`;
}

/** Defensively map an array of {name, price?, durationMins?} (operator-confirmed OR
 *  auto-scanned services) to BarberService[]. Preserves each item's own price +
 *  duration (1:1 — the right price stays with the right service); drops malformed
 *  entries; caps at 60. */
function toBarberServices(arr: unknown): BarberService[] {
  return Array.isArray(arr)
    ? arr
        .filter((s): s is Record<string, unknown> =>
          !!s && typeof s === "object" && typeof (s as { name?: unknown }).name === "string" &&
          (s as { name: string }).name.trim().length > 0)
        .map((s) => {
          const out: BarberService = { name: String((s as { name: string }).name).trim().slice(0, 120) };
          const price = (s as { price?: unknown }).price;
          if (typeof price === "string" && price.trim()) out.price = price.trim().slice(0, 40);
          const dur = (s as { durationMins?: unknown }).durationMins;
          if (typeof dur === "number" && Number.isFinite(dur) && dur > 0) out.durationMins = Math.round(dur);
          return out;
        })
        .slice(0, 60)
    : [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Step 1: Authorization header ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[GENERATE-BARBER-SITE] Missing Authorization header");
      return jsonResponse({ error: "Missing Authorization header" }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Internal-call branch (bulk-jobs runner): exact service-role key + the
    // x-internal-job header. Purely additive — external callers can never hold the
    // service key, so the normal user path below is unchanged. Authorization
    // happened at job-enqueue time; the acting user comes from the body (parsed
    // early — req.json() can only be read once, so Step 6 reuses it). The per-user
    // rate limit is skipped for internal calls (a chunk of sequential items would
    // throttle itself); the 20/24h generation cap below still applies.
    const token = authHeader.replace("Bearer ", "");
    const internalServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    // Internal call (bulk-jobs runner): a matching CRON_SECRET header (robust —
    // decoupled from the service-key comparison, which drifts here) OR the legacy
    // service-key + x-internal-job match. Either way it's the internal path; the
    // external user path below is unchanged.
    const isInternal =
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret && !!req.headers.get("x-internal-job")) ||
      (!!internalServiceKey && token === internalServiceKey && !!req.headers.get("x-internal-job"));
    // deno-lint-ignore no-explicit-any
    let earlyBody: any = null;

    let adminUserId: string;
    let rlHeaders: Record<string, string> = {};
    if (isInternal) {
      earlyBody = await req.json().catch(() => ({}));
      const acting = (earlyBody?.acting_user_id as string) ?? "";
      if (!acting) return jsonResponse({ error: "acting_user_id required for internal calls" }, 400, corsHeaders);
      adminUserId = acting;
      console.log("[GENERATE-BARBER-SITE] Internal call (bulk job) for user:", adminUserId);
    } else {
      // --- Step 2: User client (ANON key + caller's auth header) ---
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      // --- Step 3: Verify token (getClaims, getUser fallback) ---
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

      if (claimsError || !claimsData?.claims) {
        const { data: userData, error: userError } = await userClient.auth.getUser();
        if (userError || !userData?.user) {
          console.error("[GENERATE-BARBER-SITE] Token verification failed:", userError?.message || claimsError?.message);
          return jsonResponse(
            { error: "Invalid token", details: userError?.message || claimsError?.message },
            401,
            corsHeaders,
          );
        }
        adminUserId = userData.user.id;
        console.log("[GENERATE-BARBER-SITE] Auth via getUser fallback, userId:", adminUserId);
      } else {
        adminUserId = claimsData.claims.sub as string;
        console.log("[GENERATE-BARBER-SITE] Auth via getClaims, userId:", adminUserId);
      }

      // --- Rate limit (10 req/min per admin) ---
      const rl = checkRateLimit(`generate-barber-site:${adminUserId}`, 10, 60000);
      rlHeaders = rateLimitHeaders(rl, 10);
      if (!rl.allowed) {
        return jsonResponse({ error: "Rate limit exceeded" }, 429, corsHeaders, rlHeaders);
      }
    }

    // --- Step 4: Service-role client (only after token verified) ---
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // --- Step 5: Per-operator generation cap (replaces the old admin-only gate).
    // Site generation is open to ANY authenticated operator (admin or rep); to
    // contain Google Maps + OpenAI cost we cap each operator at 20 generations per
    // rolling 24h. Count this operator's own generations (their leads' sites) in the
    // last 24h via the lead_id → outreach_leads FK. The 10/min rate-limit above still
    // applies. (adminUserId here is just the authenticated user id — name kept for a
    // minimal diff.) ---
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: genCount } = await serviceClient
      .from("generated_sites")
      .select("id, outreach_leads!inner(user_id)", { count: "exact", head: true })
      .eq("outreach_leads.user_id", adminUserId)
      .gte("created_at", since24h);
    if ((genCount ?? 0) >= 20) {
      console.warn("[GENERATE-BARBER-SITE] 24h generation cap reached for", adminUserId);
      return jsonResponse({ error: "Daily generation limit reached (20 per 24h)." }, 403, corsHeaders, rlHeaders);
    }

    // --- Step 6: Parse body (already parsed for internal calls) ---
    const body = earlyBody ?? await req.json().catch(() => ({}));
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (!leadId) {
      return jsonResponse({ error: "lead_id required" }, 400, corsHeaders, rlHeaders);
    }
    // Which template to generate. Defaults to 'barber' so existing callers that
    // don't pass `template` are unchanged. Only known templates are accepted.
    const template: SiteTemplate =
      body.template === "salon" || body.template === "plumber" ? body.template : "barber";
    const copy = TEMPLATE_COPY[template];
    const defaultServices = DEFAULT_SERVICES_BY_TEMPLATE[template];
    // Booking-only mode (Phase 2): produce a BOOKING CONTAINER (services / hours /
    // branding) with NO marketing copy — skips the OpenAI call and sets booking_only
    // on the row. The full-site path (default) is completely unchanged.
    const bookingOnly = body.mode === "booking_only";

    // --- Step 7: OpenAI key (from secret; never hardcoded) ---
    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!openAiKey) {
      console.error("[GENERATE-BARBER-SITE] OPENAI_API_KEY secret is not set");
      return jsonResponse({ error: "Server misconfigured: OPENAI_API_KEY not set" }, 500, corsHeaders, rlHeaders);
    }

    // --- Step 8: Read the lead's REAL data ---
    const { data: lead, error: leadError } = await serviceClient
      .from("outreach_leads")
      .select(
        "id, business_name, category, address, phone, place_id, services_included, confirmed_services, facebook_url, instagram_url, website, facebook_confidence, image_url, google_maps_url",
      )
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) {
      console.error("[GENERATE-BARBER-SITE] Lead lookup error:", leadError.message);
      return jsonResponse({ error: "Failed to read lead" }, 500, corsHeaders, rlHeaders);
    }
    if (!lead) {
      return jsonResponse({ error: "Lead not found" }, 404, corsHeaders, rlHeaders);
    }

    // --- Step 8b: Don't create duplicates. If a site already exists for this
    // lead, return it (so the caller opens its Manage page) instead of generating
    // and inserting another row. Saves the OpenAI/Google cost of a needless regen.
    const { data: existingSite } = await serviceClient
      .from("generated_sites")
      .select("id, site_name, status")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Decision: convert-in-place vs the duplicate-guard early return.
    //  - A NORMAL / full-site re-generate (no booking_only) keeps the historical
    //    behaviour: return the existing site untouched — never clobber it, never
    //    create a duplicate.
    //  - A BOOKING-ONLY generate on a lead that already has a site CONVERTS that
    //    site in place: we don't return here and don't insert a duplicate — we fall
    //    through, build the booking-only content (confirmed services + marketing
    //    stripped), then UPDATE this row at the save step below (see convertSiteId).
    let convertSiteId: string | null = null;
    if (existingSite) {
      if (!bookingOnly) {
        console.log("[GENERATE-BARBER-SITE] Existing site for lead, returning it:", existingSite.id);
        return jsonResponse(
          {
            success: true,
            existing: true,
            site: {
              id: existingSite.id,
              lead_id: leadId,
              slug: existingSite.site_name,
              status: existingSite.status,
            },
            preview_path: `/p/${existingSite.site_name}`,
          },
          200,
          corsHeaders,
          rlHeaders,
        );
      }
      console.log("[GENERATE-BARBER-SITE] Existing site + booking_only → converting in place:", existingSite.id);
      convertSiteId = existingSite.id as string;
    }

    // --- Step 9a: Deep ENRICH (reviews + images + rating/hours/contacts) ---
    // Source #1 = Apify Google Maps (compass) when APIFY_TOKEN is set, via the
    // shared cache/cap runner. Falls back to a live Google Places call when Apify
    // is off / fails / cap-reached, so generation is never blocked. Honesty:
    // missing fields stay empty — never fabricated.
    const apifyToken = Deno.env.get("APIFY_TOKEN");
    const leadMapsUrlForEnrich = typeof lead.google_maps_url === "string" ? lead.google_maps_url.trim() : "";
    let apifyPlace: NormalizedPlace | null = null;
    if (apifyToken && (lead.place_id || leadMapsUrlForEnrich)) {
      try {
        const outcome = await runEnrichSource<NormalizedPlace | null>({
          service: serviceClient,
          userId: adminUserId,
          type: "maps_enrich",
          cacheKey: `${(lead.place_id as string) || leadMapsUrlForEnrich}:maps_enrich`,
          estCostUsd: 0.02,
          run: async () => {
            const { place } = await mapsEnrich({
              googleMapsUrl: leadMapsUrlForEnrich || undefined,
              placeId: (lead.place_id as string) || undefined,
              token: apifyToken,
              maxReviews: 8,
              maxImages: 10,
              timeoutMs: 90_000,
            });
            return { result: place, costUsd: 0.02 };
          },
        });
        apifyPlace = outcome.result;
        console.log(
          `[GENERATE-BARBER-SITE] Apify enrich: ${apifyPlace ? `rating=${apifyPlace.rating ?? "-"} reviews=${apifyPlace.reviews?.length ?? 0} images=${apifyPlace.imageUrls?.length ?? 0}` : outcome.capReached ? "cap-reached" : "none"}${outcome.cached ? " (cached)" : ""}`,
        );
      } catch (e) {
        console.error("[GENERATE-BARBER-SITE] Apify enrich failed (non-blocking):", (e as Error).message);
      }
    }

    // --- Step 9b: Auto-scan (Change 3) — ensure the lead is enriched (socials +
    // image pool + line-type) BEFORE generating, reusing prior enrichment for free.
    // "Already enriched" = a fresh business_enrich cache row exists; if so we skip
    // (2B reads that same pool, Change 2 reads the already-stored socials). If not,
    // run enrich-business ONCE — it persists socials to the lead + caches the pool.
    // It's itself cache+cap guarded, so this never double-spends; and only STORED
    // (confirmed) socials reach the site (location-mismatch suggestions are never
    // stored), preserving the verify gate end-to-end. Non-blocking on failure.
    if (apifyToken) {
      try {
        const enrichCacheKey = `${(lead.place_id as string) || leadMapsUrlForEnrich || `lead:${leadId}`}:business_enrich`;
        const { data: enrichCached } = await serviceClient
          .from("enrichment_cache")
          .select("cache_key, expires_at")
          .eq("cache_key", enrichCacheKey)
          .maybeSingle();
        const enrichedFresh = !!enrichCached &&
          (!enrichCached.expires_at || new Date(enrichCached.expires_at as string) > new Date());
        if (enrichedFresh) {
          console.log("[GENERATE-BARBER-SITE] auto-scan: lead already enriched (cache hit) → reuse");
        } else {
          console.log("[GENERATE-BARBER-SITE] auto-scan: not enriched → running enrich-business once");
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich-business`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
              apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            },
            body: JSON.stringify({
              lead_id: leadId,
              place_id: lead.place_id ?? null,
              google_maps_url: leadMapsUrlForEnrich || null,
              phone: lead.phone ?? null,
              business_name: lead.business_name ?? null,
              facebook_url: lead.facebook_url ?? null,
              instagram_url: lead.instagram_url ?? null,
              website: (lead.website as string) ?? null,
            }),
          });
          // Refresh stored socials/website so the freshly-enriched values flow into
          // the generated content (Change 2 reads lead.facebook_url/instagram_url).
          const { data: refreshed } = await serviceClient
            .from("outreach_leads")
            .select("facebook_url, instagram_url, website")
            .eq("id", leadId)
            .maybeSingle();
          if (refreshed) Object.assign(lead, refreshed);
        }
      } catch (e) {
        console.error("[GENERATE-BARBER-SITE] auto-scan failed (non-blocking):", (e as Error).message);
      }
    }

    // Google fallback ONLY when Apify produced nothing (avoids double-charging).
    const google = apifyPlace
      ? null
      : lead.place_id
        ? await fetchGoogleEnrichment(lead.place_id as string)
        : null;
    console.log(
      "[GENERATE-BARBER-SITE] Google enrichment:",
      google
        ? `rating=${google.rating ?? "-"} reviews=${google.reviewCount ?? "-"} hoursRows=${google.hours?.length ?? 0}`
        : apifyPlace ? "skipped (apify)" : "none",
    );
    if (google) {
      logUsage(serviceClient, adminUserId, "place_details", GOOGLE_PLACE_DETAILS_COST_USD);
    }

    // Reviews + images from the deep enrich (real data only).
    const mapsReviews = Array.isArray(apifyPlace?.reviews) ? apifyPlace!.reviews! : [];
    const mapsImages = Array.isArray(apifyPlace?.imageUrls) ? apifyPlace!.imageUrls! : [];

    // --- Step 9b: Build a facts object containing ONLY present values ---
    // (real lead values, then live Google values; nulls = unknown to the model).
    const realServices: string[] = Array.isArray(lead.services_included)
      ? lead.services_included.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim())
      : [];
    // Phase 3b: operator-CONFIRMED services (reviewed/edited before saving). Only
    // consulted for booking-only pages (see the services build below) — this is the
    // sole path that carries operator-approved PRICES onto a page. Sanitised
    // defensively; malformed entries are dropped, not trusted.
    const confirmedServices: BarberService[] = toBarberServices(lead.confirmed_services);

    // Phase 3a auto-scan-on-generate: a BOOKING-ONLY site with NO operator-confirmed
    // services scans the lead's OWN website for real services + prices (scan-services
    // uses OpenAI, not Apify — works while Apify is down). Non-blocking: if it finds
    // nothing / the site is a booking-platform / scan fails, autoScannedServices stays
    // empty and the services build falls through to defaults (no regression). Each
    // scanned {name, price?, durationMins?} keeps its own price (1:1 mapping).
    let autoScannedServices: BarberService[] = [];
    if (bookingOnly && confirmedServices.length === 0) {
      const ownWebsite = typeof lead.website === "string" ? lead.website.trim() : "";
      if (ownWebsite) {
        try {
          const scanRes = await fetch(`${supabaseUrl}/functions/v1/scan-services`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: supabaseAnonKey },
            body: JSON.stringify({
              lead_id: leadId,
              place_id: lead.place_id ?? null,
              business_name: lead.business_name ?? null,
              website: ownWebsite,
            }),
          });
          const scanData = await scanRes.json().catch(() => ({}));
          if (scanData?.success && Array.isArray(scanData.services)) {
            autoScannedServices = toBarberServices(scanData.services);
          }
          console.log(`[GENERATE-BARBER-SITE] auto-scan services → ${autoScannedServices.length} found`);
        } catch (e) {
          console.error("[GENERATE-BARBER-SITE] auto-scan services failed (non-blocking):", (e as Error).message);
        }
      }
    }
    const facebookHigh =
      typeof lead.facebook_confidence === "number" && lead.facebook_confidence >= 80 && !!lead.facebook_url;

    // Hard facts, resolved once: lead value preferred, then Apify, then Google.
    const phone = lead.phone || apifyPlace?.phone || google?.phone || "";
    const address = lead.address || apifyPlace?.address || google?.address || "";
    const googleRating =
      typeof apifyPlace?.rating === "number" ? apifyPlace.rating
      : typeof google?.rating === "number" ? google.rating
      : undefined;
    const reviewCount =
      typeof apifyPlace?.reviewCount === "number" ? apifyPlace.reviewCount
      : typeof google?.reviewCount === "number" ? google.reviewCount
      : undefined;
    const hours: BarberOpeningHours[] =
      apifyPlace?.openingHours && apifyPlace.openingHours.length ? apifyPlace.openingHours
      : Array.isArray(google?.hours) ? google!.hours
      : [];
    // Verified town/city for the deterministic About line (Apify city, else Google area).
    const area = apifyPlace?.city || google?.area;
    // Google reviews/Maps link. Precedence:
    //   1. the lead's stored google_maps_url (the SAME column the Outreach page
    //      shows) — the curated, verified source, so the editor matches Outreach;
    //   2. the canonical URL from the live Places fetch (googleMapsUri);
    //   3. a standard place-by-id link reconstructed from the lead's place_id.
    // Empty when we have none (the template hides the link). Real, verifiable
    // link — not invented content — so "Read our Google reviews" is pre-filled.
    const leadMapsUrl = typeof lead.google_maps_url === "string" ? lead.google_maps_url.trim() : "";
    const googleReviewsUrl =
      leadMapsUrl ||
      apifyPlace?.googleMapsUrl ||
      google?.mapsUri ||
      (lead.place_id
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            (lead.business_name as string) || "barber",
          )}&query_place_id=${lead.place_id}`
        : "");

    const facts: Record<string, unknown> = {
      business_name: lead.business_name || null,
      category: lead.category || null,
      address: address || null,
      phone: phone || null,
      services: realServices.length ? realServices : null,
      google_rating: googleRating ?? null,
      review_count: reviewCount ?? null,
      opening_hours: hours.length ? hours : null,
      image_url: lead.image_url || null,
    };

    // --- Step 10: Prompt OpenAI under the honesty rules ---
    const systemPrompt = [
      `You write website copy for a ${copy.noun} using ONLY the structured data provided.`,
      "ABSOLUTE RULE: invent no fact that is not in the data. Never invent history, founding",
      "dates, founder stories, credentials, awards, staff counts, chair counts, years in",
      "business, or any numeric statistic. If a fact is not provided, do not mention it —",
      "leave the field empty or write a shorter section. Inventing a plausible fact is a failure.",
      "Tone for heroHeadline and tagline may be creative, but they must assert no specific fact.",
      "The 'about' paragraph (1-2 short sentences) must be PURELY FACTUAL. It may state ONLY: the",
      "business name, its town or city (from the address), the real Google rating and review count",
      "(when provided), and the names of services offered (when provided). It MUST NOT assert any",
      "subjective quality the data cannot prove — FORBIDDEN: welcoming, friendly, skilled, expert,",
      "experienced, professional, talented, passionate, dedicated, top-notch, premium, high-quality,",
      "best, trusted, relaxing, cosy, 'great atmosphere', 'top-notch experience', and the like. Also",
      "no history, founding, awards, counts, or years. Let the real rating speak for itself. Less data",
      "means a shorter about — never pad with flattery or invention.",
      `GOOD: '${copy.good}'`,
      `BAD: '${copy.bad}'`,
      "Service descriptions must be generic; never claim specific products or techniques the business",
      "has not stated, and never invent prices.",
      "Return ONLY valid JSON matching the schema. No commentary, no markdown.",
    ].join(" ");

    // The model only writes copy. Hard facts (businessName, phone, address, hours,
    // googleRating, reviewCount, service names, image) are applied server-side after
    // parsing, so they cannot be altered or invented by the model.
    const schemaHint = {
      tagline: "string (creative, no factual claim)",
      heroHeadline: "string (creative, no factual claim)",
      about: "string, 1-2 FACTUAL sentences: business name, town/city, real rating+reviews, real service names ONLY — NO subjective quality words (welcoming/skilled/top-notch/friendly/professional/etc.)",
      services: "array of { name: string, description?: string } — generic descriptions, never prices",
    };

    const userPrompt = [
      "REAL DATA (fields that are null are unknown and must NOT be referenced):",
      JSON.stringify(facts, null, 2),
      "",
      "Write a JSON object with exactly these fields:",
      JSON.stringify(schemaHint, null, 2),
      "",
      realServices.length
        ? "Use the provided service names verbatim; add a short generic description for each."
        : `No services were provided — use this default ${copy.noun} list with short generic descriptions: ` +
          defaultServices.map((s) => s.name).join(", ") + ".",
      "Do not invent prices, hours, ratings, counts, years, or history. Output JSON only.",
      "The 'about' must be factual only — no subjective adjectives (welcoming, skilled, top-notch, friendly, professional, etc.). State only the name, town/city, real rating/reviews and real services.",
    ].join("\n");

    // Booking-only skips OpenAI entirely (no tagline / heroHeadline / descriptions)
    // — cheaper + faster. The whole AI block below is gated; full-site is unchanged.
    let modelContent: Partial<BarberSiteContent> = {};
    // Hoisted out of the AI block: the final usage log (openai_usd / total_usd) reads
    // it unconditionally, so booking-only (which skips the block) must leave it 0.
    let openAiCostUsd = 0;
    if (!bookingOnly) {
    let openAiRes: Response;
    try {
      openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.7,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch (e) {
      console.error("[GENERATE-BARBER-SITE] OpenAI request failed:", (e as Error).message);
      return jsonResponse({ error: "AI request failed" }, 502, corsHeaders, rlHeaders);
    }

    if (!openAiRes.ok) {
      const detail = await openAiRes.text().catch(() => "");
      console.error("[GENERATE-BARBER-SITE] OpenAI non-OK:", openAiRes.status, detail.slice(0, 300));
      return jsonResponse({ error: "AI request failed", status: openAiRes.status }, 502, corsHeaders, rlHeaders);
    }

    // --- Step 11: Read completion, log AI cost, then parse safely. ---
    // The OpenAI call is billed whether or not its content parses, so log usage
    // first (best-effort), then enforce "on parse failure, write nothing".
    let completion: any;
    try {
      completion = await openAiRes.json();
    } catch (e) {
      console.error("[GENERATE-BARBER-SITE] AI response not JSON (nothing written):", (e as Error).message);
      return jsonResponse({ error: "AI returned unreadable response; nothing was saved" }, 502, corsHeaders, rlHeaders);
    }

    // Estimate cost from the tokens OpenAI reports, log via the same pattern.
    const inTok = Number(completion?.usage?.prompt_tokens) || 0;
    const outTok = Number(completion?.usage?.completion_tokens) || 0;
    openAiCostUsd =
      (inTok / 1_000_000) * OPENAI_INPUT_USD_PER_M + (outTok / 1_000_000) * OPENAI_OUTPUT_USD_PER_M;
    console.log(
      `[GENERATE-BARBER-SITE] OpenAI tokens in=${inTok} out=${outTok} est_cost_usd=${openAiCostUsd.toFixed(6)}`,
    );
    logUsage(serviceClient, adminUserId, "openai_chat", openAiCostUsd);

    try {
      const raw = completion?.choices?.[0]?.message?.content;
      if (typeof raw !== "string" || !raw.trim()) throw new Error("empty completion");
      modelContent = JSON.parse(raw);
      if (typeof modelContent !== "object" || modelContent === null) throw new Error("not an object");
    } catch (e) {
      console.error("[GENERATE-BARBER-SITE] AI parse failure (nothing written):", (e as Error).message);
      return jsonResponse({ error: "AI returned unparseable content; nothing was saved" }, 502, corsHeaders, rlHeaders);
    }
    }  // end if (!bookingOnly) — booking-only leaves modelContent = {}

    // --- Step 12: Server-side honesty enforcement (overrides the model) ---
    // Hard facts come from the lead, never the model. Unknown facts are dropped.
    const services: BarberService[] = (() => {
      // Phase 3b: a booking-only page prefers operator-CONFIRMED services (with their
      // reviewed prices + durations). Strictly gated on bookingOnly, so the full-site
      // path below is byte-for-byte unchanged. Empty confirmed list → fall through to
      // the existing Maps/defaults behaviour (no regression).
      if (bookingOnly && confirmedServices.length) {
        return confirmedServices;
      }
      // Auto-scanned real services + prices for a fresh booking-only page (when no
      // operator-confirmed list). Empty → falls through to the existing defaults.
      if (bookingOnly && autoScannedServices.length) {
        return autoScannedServices;
      }
      if (realServices.length) {
        // Real service names verbatim; keep only a generic description the model wrote.
        const descByName = new Map<string, string>();
        if (Array.isArray(modelContent.services)) {
          for (const s of modelContent.services) {
            if (s && typeof s.name === "string" && typeof s.description === "string") {
              descByName.set(s.name.trim().toLowerCase(), s.description);
            }
          }
        }
        return realServices.map((name) => {
          const desc = descByName.get(name.toLowerCase());
          return desc ? { name, description: desc } : { name };
        });
      }
      // Default list — allow generic descriptions, never prices.
      if (Array.isArray(modelContent.services) && modelContent.services.length) {
        return modelContent.services
          .filter((s) => s && typeof s.name === "string" && s.name.trim())
          .map((s) => ({
            name: s.name.trim(),
            ...(typeof s.description === "string" && s.description.trim() ? { description: s.description.trim() } : {}),
          }));
      }
      return defaultServices;
    })();

    // Deterministic, factually-safe "about" — built from known data only, NOT the
    // model (so it can never invent history/founders/awards or flatter). Uses the
    // resolved service names, the Google-verified town, and the real rating/reviews.
    const aboutText = buildAbout({
      name: lead.business_name || "",
      noun: TEMPLATE_COPY[template].noun,
      focus: TEMPLATE_COPY[template].focus,
      area,
      services: services.map((s) => s.name),
      rating: googleRating,
      reviewCount,
    });

    // Images: COLLECT the candidate pool (Maps + the cached FB/IG enrich pool) for
    // the editor's MANUAL drag-and-drop board — but DON'T auto-place any into slots.
    // Slots start EMPTY → the template's stock fallback shows (always presentable),
    // and the operator drags real photos into hero/about/why-us/gallery in the
    // editor, where they're re-hosted on save. No AI, no pool-order guessing.
    let imagePool: string[] = [...mapsImages];
    try {
      const enrichKey = `${(lead.place_id as string) || leadMapsUrlForEnrich || `lead:${leadId}`}:business_enrich`;
      const { data: cachedRow } = await serviceClient
        .from("enrichment_cache")
        .select("result")
        .eq("cache_key", enrichKey)
        .maybeSingle();
      const cachedPool = (cachedRow?.result as { imagePool?: unknown })?.imagePool;
      if (Array.isArray(cachedPool) && cachedPool.length) {
        // The cached enrich pool (Maps+FB+IG) is the richer source — union it with
        // this generate's Maps images, de-duped, so e.g. 20 FB photos all show.
        imagePool = Array.from(
          new Set([...(cachedPool.filter((u) => typeof u === "string") as string[]), ...mapsImages]),
        );
      }
    } catch (e) {
      console.error(`[GENERATE-BARBER-SITE] imagePool collect failed (non-blocking): ${(e as Error).message}`);
    }
    imagePool = imagePool.slice(0, 40);
    console.log(`[GENERATE-BARBER-SITE] imagePool collected: ${imagePool.length} (slots start empty → stock; manual board fills them)`);

    const content: BarberSiteContent = {
      businessName: lead.business_name || "", // real, verbatim
      // Booking-only carries NO marketing copy (the booking page never renders these).
      tagline: bookingOnly ? "" : (typeof modelContent.tagline === "string" ? modelContent.tagline : ""),
      heroHeadline: bookingOnly ? "" : (typeof modelContent.heroHeadline === "string" ? modelContent.heroHeadline : ""),
      about: bookingOnly ? "" : aboutText,
      services,
      hours, // real Google hours if fetched, else [] (section omitted)
      phone, // real lead/Google value or "" (omitted)
      address, // real lead/Google value or "" (omitted)
      // Rating/reviews: set ONLY when really fetched from Google; never fabricated.
      ...(googleRating !== undefined ? { googleRating } : {}),
      ...(reviewCount !== undefined ? { reviewCount } : {}),
      // Example prices on by default (clearly labelled "Example" under a disclaimer)
      // so a brand-new site doesn't look empty; the editor can switch this off.
      showExamplePrices: true,
      // Pre-fill the real Google reviews link when we have one (verifiable, not invented).
      // KEPT for booking-only too — the booking page's rating badge links to it.
      ...(googleReviewsUrl ? { googleReviewsUrl } : {}),
      // Image slots start EMPTY (stock fallback). The collected pool is handed to
      // the editor's manual drag-and-drop board; nothing is auto-placed.
      ...(imagePool.length ? { imagePool } : {}),
      // Real Google reviews → testimonial cards, capped at the 3 BEST (highest
      // stars first; tie-break toward longer/substantial text). Site-output cap —
      // the enrich cache still holds the full set. Empty = no cards (never faked).
      ...(!bookingOnly && mapsReviews.length
        ? {
            reviews: [...mapsReviews]
              .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.text?.length ?? 0) - (a.text?.length ?? 0))
              .slice(0, 3),
          }
        : {}),
      // Real verified socials → header/footer icons. Only STORED lead values (enrich
      // never stores location-mismatch suggestions), so the site shows a confirmed
      // social or nothing — never a guessed/dead link. All templates.
      ...(lead.facebook_url ? { facebookUrl: lead.facebook_url as string } : {}),
      ...(lead.instagram_url ? { instagramUrl: lead.instagram_url as string } : {}),
      // Plumber-only sections: generic defaults (not business-factual), plus a
      // real service-area line from the verified town when we have it.
      ...(!bookingOnly && template === "plumber"
        ? {
            whyUsPoints: PLUMBER_WHY_US,
            processSteps: PLUMBER_PROCESS,
            faqs: PLUMBER_FAQS,
            ...(area ? { serviceArea: `${area} & surrounding areas` } : {}),
          }
        : {}),
    };
    // facebookHigh is computed for completeness, but BarberSiteContent has no social
    // field, so a social link is not part of generated content (see notes to user).
    void facebookHigh;

    // --- Step 13: Generate a clean, unique slug and save ---
    // Clean base from the business name; the DB UNIQUE constraint on site_name is
    // the arbiter of uniqueness. Try the bare base, then -2, -3, …, reacting to a
    // unique-violation (Postgres 23505) — race-safe, since two concurrent inserts
    // cannot both win the same slug.
    const SLUG_FALLBACK: Record<SiteTemplate, string> = {
      barber: "barber-site",
      salon: "salon-site",
      plumber: "plumber-site",
    };
    const baseSlug = slugify(content.businessName, SLUG_FALLBACK[template]);

    type SavedRow = { id: string; lead_id: string; site_name: string; status: string; created_at: string };
    let saved: SavedRow | null = null;
    let insertError: { code?: string; message?: string } | null = null;
    let slug = baseSlug;

    if (convertSiteId) {
      // CONVERT IN PLACE: a booking-only generate on a lead that already has a site.
      // UPDATE the existing row (keep its slug, status, owner, share_token, subdomain)
      // and only swap content → booking-only, template, and booking_only=true. The
      // service-role client bypasses the protected-fields lock, so booking_only (a
      // protected column) can be set here. No duplicate row is created.
      const res = await serviceClient
        .from("generated_sites")
        .update({ content, template, booking_only: true })
        .eq("id", convertSiteId)
        .select("id, lead_id, site_name, status, created_at")
        .single();
      if (!res.error) {
        saved = res.data as unknown as SavedRow;
        slug = saved.site_name; // keep the existing slug
      } else {
        insertError = res.error;
      }
    } else {
      for (let attempt = 1; attempt <= 50; attempt++) {
        slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
        // Readable-but-secret claim link: "<slug>-<random>". Built from the final
        // slug so /s/<token> leads with the business name (begin-claim/claim-site
        // resolve by exact share_token — unchanged; only the FORMAT differs).
        const res = await serviceClient
          .from("generated_sites")
          .insert({ lead_id: leadId, site_name: slug, content, status: "draft", template, booking_only: bookingOnly, share_token: readableShareToken(slug) })
          .select("id, lead_id, site_name, status, created_at")
          .single();
        if (!res.error) {
          saved = res.data as unknown as SavedRow;
          insertError = null;
          break;
        }
        insertError = res.error;
        if (res.error.code === "23505") continue; // slug already taken — next suffix
        break; // a different error — stop and report
      }
    }

    if (insertError || !saved) {
      console.error("[GENERATE-BARBER-SITE] Insert failed:", insertError?.message);
      return jsonResponse({ error: "Failed to save generated site" }, 500, corsHeaders, rlHeaders);
    }

    console.log(JSON.stringify({
      level: "info",
      fn: "generate-barber-site",
      admin_user_id: adminUserId,
      lead_id: leadId,
      site_id: saved.id,
      slug,
      template,
      timestamp: new Date().toISOString(),
    }));

    // Surface the same costs we logged so they're visible immediately on the call.
    const googleCostUsd = google ? GOOGLE_PLACE_DETAILS_COST_USD : 0;
    const cost = {
      google_usd: Number(googleCostUsd.toFixed(6)),
      openai_usd: Number(openAiCostUsd.toFixed(6)),
      total_usd: Number((googleCostUsd + openAiCostUsd).toFixed(6)),
    };

    return jsonResponse(
      {
        success: true,
        site: { id: saved.id, lead_id: saved.lead_id, slug, status: saved.status, template },
        preview_path: `/p/${slug}`,
        cost,
        content,
      },
      200,
      corsHeaders,
      rlHeaders,
    );
  } catch (error) {
    console.error("[GENERATE-BARBER-SITE] Unhandled error:", (error as Error).message);
    return jsonResponse({ error: "Internal server error" }, 500, corsHeaders);
  }
});
