import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";

// scan-services — PHASE 3a MEASUREMENT ONLY.
//
// Reads a has-website barber's OWN site and asks gpt-4o-mini to extract the
// services + prices LITERALLY present on the page. Result is returned to the
// operator for eyeballing the hit rate — it is NOT wired into generate, the
// booking page, or anything that publishes. Nothing here auto-applies.
//
// Plumbing mirrors extract-facebook / enrich-lead:
//   - verify_jwt=false in config.toml + in-handler Bearer auth
//   - service-role client for cache/usage/log writes
//   - cache → daily cost cap → run → cache write + usage + api_usage_log via
//     the shared runEnrichSource runner (enrichment_cache `:services`, 30d TTL)
//
// Fetch is the SAME raw pattern as extract-facebook: browser UA, 8s timeout,
// read ~1MB. We fetch the homepage, and — if a same-origin link's text/href
// matches prices|services|menu|book — one extra page, strip to clean text,
// truncate to ~15-20k tokens, and send that to the model.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// gpt-4o-mini list price (USD per 1M tokens) — same constants generate uses.
const OPENAI_INPUT_USD_PER_M = 0.15;
const OPENAI_OUTPUT_USD_PER_M = 0.6;
// Pre-call cap estimate: ~18k input + small output ≈ $0.003; round up for safety.
const EST_COST_USD = 0.005;
// ~15-20k tokens of clean text. 1 token ≈ 4 chars → ~60k chars total budget.
const MAX_TEXT_CHARS = 60_000;
// Each appended subpage is capped so one noisy page (e.g. a Wix booking-calendar
// app, 170k+ chars of cruft) can never drown the homepage menu in the truncation.
const MAX_SUBPAGE_CHARS = 15_000;
// Fetch at most this many candidate price/service subpages.
const MAX_SUBPAGES = 3;
// If the homepage already shows at least this many £ prices, the menu is on the
// homepage — don't append ANY subpages (they only add noise / dilute the signal).
const HOMEPAGE_PRICE_SUFFICIENT = 3;
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1024 * 1024; // 1MB, same as extract-facebook

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Block internal/private hosts (SSRF) — ported from extract-facebook. */
function isPrivateHostname(hostname: string): boolean {
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"].includes(hostname)) return true;
  if (hostname.startsWith("169.254.") || hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
  const m = hostname.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (hostname.startsWith("fd") || hostname.startsWith("fe80")) return true;
  return false;
}

function normaliseUrl(raw: string): URL | null {
  let u = raw.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (isPrivateHostname(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Fetch a page and return up to ~1MB of HTML (browser UA, 8s timeout). */
async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadFinder/1.0)", "Accept": "text/html" },
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    reader.cancel();
    const decoder = new TextDecoder();
    return chunks.map((c) => decoder.decode(c, { stream: true })).join("") + decoder.decode();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Booking-WIDGET deep-links (Wix booking-calendar, "book now", booking apps) are
// NOT price/menu pages — they're JS scheduling widgets that are huge and priceless.
// Matching them via a bare "book" keyword is what made thebarberchop.com fail
// (it grabbed /booking-calendar/haircut, 176k chars, 0 prices). Exclude them.
const BOOKING_WIDGET_PATH = /(booking-calendar|book-now|book-online|book-a|\/booking\/|\/bookings\/|\/book\/|schedule|appointment|calendar|service-page\/)/i;

/**
 * Find same-origin candidate price/service subpages, RANKED best-first:
 *   3 = href/text contains "price"  (most specific — the real menu)
 *   2 = href/text contains "menu"
 *   1 = href/text contains "service"
 *   0 = bare "book" only            (last resort, and only if not a booking widget)
 * Booking-widget deep-links are excluded entirely. Returns up to `limit` URLs.
 */
function findServiceLinks(html: string, base: URL, limit: number): string[] {
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const baseHref = base.href.replace(/#.*$/, "");
  const scored = new Map<string, number>(); // url → best score seen
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ");
    const hay = `${href} ${text}`.toLowerCase();

    let score = -1;
    if (/price/.test(hay)) score = 3;
    else if (/menu/.test(hay)) score = 2;
    else if (/service/.test(hay)) score = 1;
    else if (/\bbook/.test(hay)) score = 0;
    if (score < 0) continue;

    try {
      const abs = new URL(href, base);
      if (abs.hostname !== base.hostname) continue; // same-origin only (SSRF + relevance)
      if (isPrivateHostname(abs.hostname)) continue;
      abs.hash = "";
      // Normalise trailing slash so /prices and /prices/ don't waste two slots.
      const clean = abs.href.replace(/#.*$/, "").replace(/\/+$/, "") || abs.href;
      if (clean === baseHref.replace(/\/+$/, "")) continue; // not the homepage itself
      // Drop booking-widget deep-links — unless the link explicitly says price/menu,
      // a path like /booking-calendar/ is a scheduling app, not a price list.
      if (score <= 1 && BOOKING_WIDGET_PATH.test(abs.pathname)) continue;
      const prev = scored.get(clean);
      if (prev === undefined || score > prev) scored.set(clean, score);
    } catch {
      continue;
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1]) // highest score first; price > menu > service > book
    .slice(0, limit)
    .map(([url]) => url);
}

/** Strip scripts/styles/tags → readable text; collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&pound;/gi, "£")
    .replace(/&#163;/g, "£")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ScannedService {
  name: string;
  price?: string;
  durationMins?: number;
}

const SYSTEM_PROMPT = `You extract a barber/salon's service menu from the plain text of THEIR OWN website.

Rules — follow exactly:
- Extract ONLY services and prices that are LITERALLY present in the text. Never invent, infer, guess, or normalise a price.
- If a service has no price shown, OMIT the price field entirely. Do NOT estimate it.
- Only include durationMins when a duration is literally shown for that service; otherwise omit it.
- "price" is the literal string exactly as written (e.g. "£15", "from £20", "£15-£25"). Do not convert or round.
- Do NOT include non-service content: opening hours, address, phone numbers, social links, reviews/testimonials, blog posts, cookie/consent text, or navigation labels.
- If the page has no clear service menu, return an empty list. An empty list is the correct answer when prices/services are not literally present.

Return ONLY a JSON object of this exact shape:
{"services": [{"name": string, "price"?: string, "durationMins"?: number}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Auth (same pattern as extract-facebook / enrich-lead) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ success: false, error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    // --- Parse + validate ---
    const body = await req.json().catch(() => ({}));
    const leadId: string = typeof body.lead_id === "string" ? body.lead_id : "";
    const placeId: string = typeof body.place_id === "string" ? body.place_id : "";
    const businessName: string = typeof body.business_name === "string" ? body.business_name : "";
    const websiteRaw: string = typeof body.website === "string" ? body.website.trim() : "";

    if (!websiteRaw) return json({ success: false, error: "This lead has no website to scan." }, 400);
    if (isAggregatorUrl(websiteRaw)) {
      // A Fresha/Booksy/Facebook "website" is not the business's own site — scanning
      // it would measure the platform's menu, not theirs. Refuse before any spend.
      return json({ success: false, error: "That URL is a booking platform / social page, not an own website." }, 400);
    }
    const homepage = normaliseUrl(websiteRaw);
    if (!homepage) return json({ success: false, error: "Invalid website URL." }, 400);

    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!openAiKey) return json({ success: false, error: "Server misconfigured: OPENAI_API_KEY not set" }, 500);

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    const cacheKey = `${placeId || `lead:${leadId}` || homepage.hostname}:services`;

    // cache → cap → run → persist (enrichment_cache/usage + api_usage_log).
    const outcome = await runEnrichSource<{
      services: ScannedService[];
      source_urls: string[];
      found: boolean;
    }>({
      service,
      userId,
      type: "services",
      cacheKey,
      estCostUsd: EST_COST_USD,
      run: async () => {
        const sourceUrls: string[] = [];

        // 1) Homepage.
        const homeHtml = await fetchHtml(homepage.toString());
        if (!homeHtml) {
          return { result: { services: [], source_urls: [], found: false }, costUsd: 0 };
        }
        sourceUrls.push(homepage.toString());
        // Homepage ALWAYS comes first and in full — so a noisy subpage can never
        // push the real menu out of the truncation window.
        let text = htmlToText(homeHtml);

        // 2) Subpages — only if the homepage doesn't already carry the menu.
        // Count £ prices on the homepage; many barber sites (incl. Wix shells that
        // server-render their menu) list everything on the homepage itself.
        const homepagePriceCount = (text.match(/£\s?\d/g) || []).length;
        if (homepagePriceCount < HOMEPAGE_PRICE_SUFFICIENT) {
          // Ranked best-first (price > menu > service > book); booking widgets excluded.
          const candidates = findServiceLinks(homeHtml, homepage, MAX_SUBPAGES);
          for (const url of candidates) {
            const subHtml = await fetchHtml(url);
            if (!subHtml) continue;
            sourceUrls.push(url);
            // Cap each subpage so one huge noisy page can't dominate the input.
            const subText = htmlToText(subHtml).slice(0, MAX_SUBPAGE_CHARS);
            text += `\n\n----- ${url} -----\n\n` + subText;
            if (text.length >= MAX_TEXT_CHARS) break;
          }
        }

        text = text.slice(0, MAX_TEXT_CHARS);
        if (!text.trim()) {
          return { result: { services: [], source_urls: sourceUrls, found: false }, costUsd: 0 };
        }

        // 3) Strict extraction via gpt-4o-mini (temperature 0 — extraction, not creative).
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: `Business name: ${businessName || "(unknown)"}\n\nWebsite text:\n${text}`,
              },
            ],
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error(`[scan-services] OpenAI ${res.status}: ${errText.slice(0, 300)}`);
          throw new Error(`OpenAI ${res.status}`);
        }

        const completion = await res.json();
        const inTok = Number(completion?.usage?.prompt_tokens) || 0;
        const outTok = Number(completion?.usage?.completion_tokens) || 0;
        const costUsd =
          (inTok / 1_000_000) * OPENAI_INPUT_USD_PER_M + (outTok / 1_000_000) * OPENAI_OUTPUT_USD_PER_M;

        let services: ScannedService[] = [];
        try {
          const parsed = JSON.parse(completion?.choices?.[0]?.message?.content ?? "{}");
          if (Array.isArray(parsed?.services)) {
            services = parsed.services
              .filter((s: unknown) => s && typeof (s as ScannedService).name === "string" && (s as ScannedService).name.trim())
              .map((s: ScannedService) => {
                const out: ScannedService = { name: String(s.name).trim().slice(0, 120) };
                if (typeof s.price === "string" && s.price.trim()) out.price = s.price.trim().slice(0, 40);
                if (typeof s.durationMins === "number" && Number.isFinite(s.durationMins) && s.durationMins > 0) {
                  out.durationMins = Math.round(s.durationMins);
                }
                return out;
              })
              .slice(0, 60);
          }
        } catch (e) {
          console.error("[scan-services] JSON parse failed:", (e as Error).message);
        }

        return { result: { services, source_urls: sourceUrls, found: services.length > 0 }, costUsd };
      },
    });

    if (outcome.capReached) {
      return json({
        success: false,
        limit_reached: true,
        error: "Daily scan/enrichment limit reached. Try again tomorrow.",
        spent_usd: Number((outcome.spentUsd ?? 0).toFixed(2)),
      });
    }

    const result = outcome.result ?? { services: [], source_urls: [], found: false };
    return json({
      success: true,
      cached: outcome.cached,
      found: result.found,
      services: result.services,
      source_urls: result.source_urls,
      cost_usd: Number(outcome.costUsd.toFixed(4)),
    });
  } catch (error) {
    console.error("scan-services error:", error);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
