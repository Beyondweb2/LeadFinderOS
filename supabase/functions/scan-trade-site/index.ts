import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { isAggregatorUrl, domainOf } from "../_shared/aggregators.ts";

// scan-trade-site — reads a TRADE business's OWN website and extracts, in ONE pass:
//   • services (name + optional price + optional one-line description)
//   • the service-AREA list (towns/villages/districts the site says it covers)
// for the per-prospect mockup generator. Returns data only — it saves nothing and
// publishes nothing; the operator confirms on the picker screen.
//
// ── LINEAGE, AND WHY THIS IS A NEW FUNCTION RATHER THAN A CHANGE TO A LIVE ONE ──
// The fetch/parse plumbing is copied wholesale from scan-site-details, which itself
// copied it from the deleted scan-services — the established convention in this repo.
// ⚠️ scan-site-details ALREADY extracts `areas` (added 2026-08-28 for the page
// generator) and is LIVE, feeding the AI-audit autofill. Extending it to also return
// services would mean rewriting a prompt a live feature depends on, so the area
// extraction here is a DELIBERATE second copy: one fetch for the mockup flow, and no
// risk to the audit autofill. If the two ever need to converge, extract a shared
// _shared/site-fetch.ts and redeploy BOTH (§4's shared-file trap).
//
// ── FOUR DEFECTS FIXED, all four measured on six real locksmith sites 2026-09-10 ──
//  1. NUMERIC HTML ENTITIES were never decoded. htmlToText handled &nbsp; &amp;
//     &pound; &#163; and then stripped only /&[a-z]+;/i — ALPHABETIC. So &#038; &#8211;
//     &#8217; survived into the text AND into extracted service names ("Car Ignition
//     &#038; Lock Repairs"). Measured leftovers per site: 4, 3, 5, 0, 14, 0.
//  2. SUBPAGE DEDUPE WAS PROTOCOL-SENSITIVE. It compared against base.href, so a site
//     served over http whose own nav links https fetched its OWN HOMEPAGE as a
//     "subpage" — RL Locksmiths duplicated 1,522 chars, half its payload, for nothing.
//     Now normalised on protocol + trailing slash + case before comparing.
//  3. HOMEPAGE_PRICE_SUFFICIENT (3 prices on the homepage → skip all subpages) was
//     written for barbers, where prices ARE the menu. On a trade site prices say
//     nothing about where the SERVICES are listed: Dr Locks has 36 "£" on its homepage,
//     so all three of its service subpages were skipped. Removed entirely — 13,619
//     chars became 55,287.
//  4. NAV-ACCORDION AND CTA JUNK reads as service-shaped text. Grays emits "Close
//     Master Locksmith" / "Open Master Locksmith" per menu group and "Explore" x6.
//     Now filtered from the model's input, and named in the prompt as well.
//  5. (carried from scan-site-details, absent from scan-services) ZERO-WIDTH cruft
//     strip — Wix injects it and it fragments labels mid-word.
//
// ⛔ PRICES ARE KEPT, and that reverses my own recommendation. I told Paul locksmiths
// publish service names but not prices; ONE OF FIVE publishes a full banded price table
// (Dr Locks: "£60 – £100 (standard) // £100 – £150 (emergency)"). So the prompt still
// forbids inventing a price and still omits the field when none is shown — but it takes
// one when it is literally there. Never round, never convert, never estimate.
//
// ⛔ AREAS ARE SCRAPED; CREDENTIALS ARE NOT, and that split is deliberate and carried
// verbatim from scan-site-details' reasoning: areas are FACTUAL and carry no safety
// weight, while accreditations are TRUST claims and a website only proves a claim was
// made ONCE, never that a registration is CURRENT. A scraped credential arrives wearing
// evidence and invites a rubber-stamp tick. Do not add credentials to this scan.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// gpt-4o-mini list price (USD per 1M tokens) — same constants scan-site-details uses.
const OPENAI_INPUT_USD_PER_M = 0.15;
const OPENAI_OUTPUT_USD_PER_M = 0.6;
const EST_COST_USD = 0.005;          // pre-call cap estimate
const MAX_TEXT_CHARS = 60_000;       // ~15-20k tokens of clean text
const MAX_SUBPAGE_CHARS = 15_000;    // cap each service subpage
const MAX_SUBPAGES = 3;
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── Fetch (copied from scan-site-details) ──────────────────────────────────── */

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

/* ── DEFECT 1: decode EVERY entity, numeric included, BEFORE the alphabetic strip ── */

/** Named entities worth decoding to a real character rather than to a space. */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", pound: "£", quot: '"', apos: "'", lt: "<", gt: ">",
  euro: "€", cent: "¢", yen: "¥", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", deg: "°", middot: "·", bull: "•",
};

export function decodeEntities(s: string): string {
  return s
    // Numeric FIRST — the original never did this at all, which is defect 1.
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const n = parseInt(dec, 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    })
    .replace(/&([a-z][a-z0-9]*);/gi, (_m, name) => {
      const k = String(name).toLowerCase();
      // An unknown named entity becomes a SPACE, never its own literal text — the
      // original behaviour, kept: a stray "&foo;" in a service name is worse than a gap.
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, k) ? NAMED_ENTITIES[k] : " ";
    });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    // DEFECT 5 (carried from scan-site-details): Wix injects zero-width characters
    // that fragment labels mid-word.
    .replace(/[​‌‍⁠﻿]/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── DEFECT 4: nav-accordion / CTA junk ─────────────────────────────────────── */

/* Menu-toggle and CTA strings that read as service-shaped text. Measured on Grays
   (Nottingham): "Close Master Locksmith" / "Open Master Locksmith" appear once per menu
   group, and "Explore" six times.
   ⛔ ANCHORED, NOT SUBSTRING. "Open" must not delete "Safe Opening", and "Close" must
   not touch "Closed circuit". Each pattern matches a WHOLE line only. */
const NAV_JUNK_LINE = new RegExp(
  "^(?:" +
    [
      "(?:open|close)\\s+.{0,40}",          // accordion toggles: "Open Auto Keys"
      "explore",
      "skip to (?:main )?content",
      "menu|main menu|toggle (?:menu|navigation)",
      "read more|learn more|find out more|see more|view (?:all|more)",
      "back to top|top of page|bottom of page",
      "use tab to navigate through the menu items\\.?",
      "call now|call us|get a quote|request a quote|book (?:now|online)",
      "previous|next|prev",
      "search",
      "cookie[s]? (?:policy|settings|preferences)|accept (?:all )?cookies|manage cookies",
      "privacy policy|terms(?: and conditions| of use)?|sitemap",
      "share|tweet|follow us",
    ].join("|") +
  ")$",
  "i",
);

/** Drop whole lines that are pure navigation furniture. Content lines are untouched. */
export function stripNavJunk(text: string): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const kept = text.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (NAV_JUNK_LINE.test(t)) { dropped.push(t); return false; }
    return true;
  });
  return { text: kept.join("\n"), dropped };
}

/* ── DEFECT 2 + service-first ranking ───────────────────────────────────────── */

const BOOKING_WIDGET_PATH =
  /(booking-calendar|book-now|book-online|book-a|\/booking\/|\/bookings\/|\/book\/|schedule|appointment|calendar|service-page\/)/i;

/** DEFECT 2: compare links protocol-, slash- and case-insensitively, so a site cannot
 *  be fetched as its own subpage. */
function sameTarget(a: string, b: string): boolean {
  const norm = (u: string) =>
    u.replace(/^https?:\/\//i, "").replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Same-origin candidate SERVICE pages, ranked best-first:
 *   3 = "service"  (a trade site's own word for its list)
 *   2 = "price" / "pricing" / "cost"
 *   1 = "what we do" / "our work"
 * ⚠️ SERVICE-FIRST RATHER THAN PRICE-FIRST, and the honest note is that on all six
 * measured sites the two rankings picked the SAME pages — trade sites label the page
 * "Services" and link it from price copy too. It is the right default for the trade and
 * it fixed nothing on that sample; it is not claimed as a fix.
 */
function findServiceLinks(html: string, base: URL, limit: number): string[] {
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const scored = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ");
    const hay = `${href} ${text}`.toLowerCase();

    let score = -1;
    if (/service/.test(hay)) score = 3;
    else if (/pric|\bcost/.test(hay)) score = 2;
    else if (/what[-\s]?we[-\s]?do|our[-\s]?work/.test(hay)) score = 1;
    if (score < 0) continue;
    if (BOOKING_WIDGET_PATH.test(href)) continue; // JS scheduling widgets: huge and priceless

    try {
      const abs = new URL(href, base);
      if (abs.hostname !== base.hostname) continue; // same-origin only (SSRF + relevance)
      const clean = abs.href.replace(/#.*$/, "");
      if (sameTarget(clean, base.href)) continue;   // DEFECT 2
      const prev = scored.get(clean);
      if (prev === undefined || score > prev) scored.set(clean, score);
    } catch {
      continue;
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([url]) => url);
}

/* ── LLM extraction ─────────────────────────────────────────────────────────── */

interface ScannedService { name: string; price?: string; description?: string }
interface TradeSiteScan {
  services: ScannedService[];
  areas: string[];
  found: boolean;
  source_urls: string[];
  /** Diagnostics so a thin result is explainable rather than just empty. */
  diag: { textChars: number; poundCount: number; navJunkDropped: number; subpages: number };
}

const SYSTEM_PROMPT = `You extract a trade business's SERVICE LIST and SERVICE AREAS from the plain text of THEIR OWN website. Typical trades: locksmith, plumber, electrician, mechanic.

THE ONE RULE THAT OVERRIDES EVERYTHING: extract ONLY what is LITERALLY present in the text. Never invent, infer, guess, normalise or complete a value. If something is not shown, omit it. An empty list is the correct answer when the page does not list services.

"services" — the things this business does, as the site names them.
- "name": the service exactly as written (e.g. "Emergency Door Opening", "uPVC Door Repairs", "Car Key Programming"). Keep their wording and capitalisation. Do not translate, expand, tidy or merge.
- "price": ONLY if a price is literally shown for that service, as the literal string exactly as written ("£65", "from £65", "£60 – £100", "£50 – £100 per lock"). Do NOT convert, round, average or estimate. Most trade sites show NO prices — omitting the field is the normal, correct outcome.
- "description": ONLY if the site gives a short explanatory line for that service; copy it near-verbatim, trimmed to one sentence. Omit rather than write your own.
- Do NOT include: navigation labels, headings that are not services, phone numbers, addresses, opening hours, review text, blog titles, cookie/consent text, "Read more", accreditation or membership badges, or vehicle make/model lists (a list of car marques is not a service).
- Do NOT list the same service twice. If the site groups services (Residential / Commercial / Motor Vehicle), return each service once; do not invent group names as services.

"areas" — the towns, villages, cities or districts the site says the business COVERS or SERVES (from "Areas we cover", a footer list, or "serving X, Y and Z").
- Place names only, exactly as written.
- Do NOT include vague catch-alls ("the Midlands", "the North West", "and surrounding areas", "nationwide") and do NOT add a place the text does not name.
- Return [] if the site names no areas.

⛔ DO NOT EXTRACT CREDENTIALS. Accreditations, memberships, certifications, awards and insurance statements are NOT wanted in any field. A website only shows a claim was made once, never that a registration is current; a human confirms those separately.

Return ONLY a JSON object of this exact shape:
{"services": [{"name": string, "price"?: string, "description"?: string}], "areas": string[]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Auth: operator JWT, same pattern as scan-site-details. ---
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

    // --- Body ---
    const body = await req.json().catch(() => ({}));
    const websiteRaw: string = typeof body.website === "string" ? body.website.trim() : "";
    const leadId: string = typeof body.lead_id === "string" ? body.lead_id : "";
    const force = body.force === true;

    if (!websiteRaw) return json({ success: false, error: "No website to scan." }, 400);
    /* ⛔ AGGREGATOR CHECK FIRST. A Facebook page or a Checkatrade profile is not their
       own site, and scraping one would put a directory's service vocabulary onto the
       prospect's mockup. Same gate scan-site-details applies. */
    if (isAggregatorUrl(websiteRaw)) {
      return json({
        success: false,
        error: "not_own_website",
        detail: "That URL is a social, directory or booking-platform page, not the business's own website.",
      }, 400);
    }
    const homepage = normaliseUrl(websiteRaw);
    if (!homepage) return json({ success: false, error: "Invalid website URL." }, 400);

    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!openAiKey) return json({ success: false, error: "Server misconfigured: OPENAI_API_KEY not set" }, 500);

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    /* Cache key carries a VERSION. ⛔ Bump it whenever this extractor's OUTPUT SHAPE or
       its prompt changes: the TTL is 30 days, so without a bump a site scanned under the
       old prompt returns a HIT whose missing field reads as a measured "none" — the
       absent-value fault on a cache. (scan-site-details is at _v4 for exactly this.)
       `force` appends an hour bucket so a re-test is fresh without disabling the cost cap. */
    const hourBucket = new Date().toISOString().slice(0, 13);
    const cacheKey =
      `${leadId || homepage.hostname}:trade_site_v1` + (force ? `:force-${hourBucket}` : "");

    const outcome = await runEnrichSource<TradeSiteScan>({
      service,
      userId,
      type: "trade_site",
      cacheKey,
      estCostUsd: EST_COST_USD,
      /* A scan that produced NO services caches only briefly: a site that was down, or
         behind a challenge, must not read as "this business lists no services" for 30 days. */
      isEmpty: (r) => !r || !Array.isArray(r.services) || r.services.length === 0,
      /* A fetch that returned nothing at all is a transient failure — never cache it,
         or one outage blocks retries for a day. */
      noCacheWrite: (r) => !r || r.found === false,
      run: async () => {
        const sourceUrls: string[] = [];

        const homeHtml = await fetchHtml(homepage.toString());
        if (!homeHtml) {
          return {
            result: {
              services: [], areas: [], found: false, source_urls: [],
              diag: { textChars: 0, poundCount: 0, navJunkDropped: 0, subpages: 0 },
            },
            costUsd: 0,
          };
        }
        sourceUrls.push(homepage.toString());

        /* DEFECT 3: no HOMEPAGE_PRICE_SUFFICIENT short-circuit. Service subpages are
           fetched whether or not the homepage happens to show prices. */
        let text = htmlToText(homeHtml);
        const candidates = findServiceLinks(homeHtml, homepage, MAX_SUBPAGES);
        for (const url of candidates) {
          const subHtml = await fetchHtml(url);
          if (!subHtml) continue;
          sourceUrls.push(url);
          text += `\n\n===== ${url} =====\n` + htmlToText(subHtml).slice(0, MAX_SUBPAGE_CHARS);
          if (text.length >= MAX_TEXT_CHARS) break;
        }

        // DEFECT 4: strip nav furniture before spending tokens on it.
        const stripped = stripNavJunk(text);
        text = stripped.text.slice(0, MAX_TEXT_CHARS);

        const diag = {
          textChars: text.length,
          poundCount: (text.match(/£/g) || []).length,
          navJunkDropped: stripped.dropped.length,
          subpages: sourceUrls.length - 1,
        };

        if (!text.trim()) {
          return { result: { services: [], areas: [], found: true, source_urls: sourceUrls, diag }, costUsd: 0 };
        }

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0,                       // extraction, not writing
            response_format: { type: "json_object" },
            max_tokens: 3000,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: text },
            ],
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`openai_http_${res.status}: ${detail.slice(0, 200)}`);
        }
        const data = await res.json();
        const usage = data?.usage ?? {};
        const costUsd =
          ((usage.prompt_tokens ?? 0) / 1_000_000) * OPENAI_INPUT_USD_PER_M +
          ((usage.completion_tokens ?? 0) / 1_000_000) * OPENAI_OUTPUT_USD_PER_M;

        let parsed: { services?: unknown; areas?: unknown } = {};
        try {
          parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
        } catch {
          parsed = {};
        }

        const services: ScannedService[] = Array.isArray(parsed.services)
          ? parsed.services
              .map((s: Record<string, unknown>) => {
                const name = typeof s?.name === "string" ? s.name.trim() : "";
                const price = typeof s?.price === "string" && s.price.trim() ? s.price.trim() : undefined;
                const description =
                  typeof s?.description === "string" && s.description.trim() ? s.description.trim() : undefined;
                return name ? { name, ...(price ? { price } : {}), ...(description ? { description } : {}) } : null;
              })
              .filter((s): s is ScannedService => s !== null)
          : [];

        const areas: string[] = Array.isArray(parsed.areas)
          ? [...new Set(
              parsed.areas
                .map((a: unknown) => (typeof a === "string" ? a.trim() : ""))
                .filter((a: string) => a.length > 1 && a.length < 60),
            )]
          : [];

        return { result: { services, areas, found: true, source_urls: sourceUrls, diag }, costUsd };
      },
    });

    if (outcome.capReached) return json({ success: false, error: "daily_cost_cap_reached" }, 429);
    const r = outcome.result;
    if (!r) return json({ success: false, error: "scan_failed" }, 502);
    if (!r.found) {
      return json({
        success: false,
        error: "site_unreachable",
        detail: "Their website did not respond, or blocked the request.",
        website: homepage.toString(),
      }, 200);
    }

    return json({
      success: true,
      cached: outcome.cached,
      cost_usd: Number(outcome.costUsd.toFixed(5)),
      website: homepage.toString(),
      domain: domainOf(homepage.href),
      services: r.services,
      areas: r.areas,
      source_urls: r.source_urls,
      diag: r.diag,
    });
  } catch (e) {
    console.error("[scan-trade-site]", e);
    return json({ success: false, error: "internal_error", detail: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
