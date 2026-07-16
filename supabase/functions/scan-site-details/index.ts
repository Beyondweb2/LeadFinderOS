import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { isAggregatorUrl, isBookingPlatformUrl, domainOf } from "../_shared/aggregators.ts";

// scan-site-details — reads a client's OWN website and extracts business DETAILS
// (phone / address / email / hours) + their SOCIAL & BOOKING LINKS, for the AI-audit
// "autofill" feature. Returns the data ONLY — it does NOT save or auto-apply anything;
// the UI confirm/edit step (Stage 2) writes to ai_audits (NAP columns + client_links).
//
// Two extraction methods, by data type:
//   1) DETAILS — gpt-4o-mini reads the cleaned homepage + contact/about text and returns
//      only values LITERALLY present (no guessing). Mirrors scan-services' strict extract.
//   2) LINKS  — deterministic regex anchor-harvest of the homepage <a href> tags for social
//      + booking platforms. No LLM. Raw hrefs are preserved (so wrong site-builder defaults
//      like facebook.com/wix surface for the operator to see and fix).
//
// Plumbing copied wholesale from scan-services: verify_jwt=false + in-handler Bearer auth,
// service-role client for cache/usage, and cache → daily cost cap → run → persist via the
// shared runEnrichSource runner (enrichment_cache `:site_details`, 30d TTL). Raw fetch (no
// Apify): browser UA, 8s timeout, ~1MB cap, SSRF guard.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// gpt-4o-mini list price (USD per 1M tokens) — same constants scan-services uses.
const OPENAI_INPUT_USD_PER_M = 0.15;
const OPENAI_OUTPUT_USD_PER_M = 0.6;
const EST_COST_USD = 0.005;         // pre-call cap estimate
const MAX_TEXT_CHARS = 60_000;      // ~15-20k tokens of clean text
const MAX_SUBPAGE_CHARS = 15_000;   // cap each contact/about subpage
const MAX_SUBPAGES = 2;             // fetch at most this many contact/about subpages
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1024 * 1024; // 1MB, same as scan-services / extract-facebook

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── Fetch + parse (copied wholesale from scan-services) ─────────────────────── */

/** Block internal/private hosts (SSRF) — ported from scan-services / extract-facebook. */
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

/** Strip scripts/styles/tags → readable text; collapse whitespace (from scan-services). */
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
    .replace(/[​‌‍⁠﻿]/g, "") // strip zero-width cruft (Wix injects these, fragmenting labels/values)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Contact/about subpage finder (adapted from scan-services' findServiceLinks) ── */

// NAP + hours live on contact / about / find-us pages. Rank contact highest.
function findContactLinks(html: string, base: URL, limit: number): string[] {
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const baseHref = base.href.replace(/#.*$/, "").replace(/\/+$/, "");
  const scored = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ");
    const hay = `${href} ${text}`.toLowerCase();

    let score = -1;
    if (/contact|get[-\s]?in[-\s]?touch/.test(hay)) score = 3;
    else if (/find[-\s]?us|where[-\s]?to[-\s]?find|location|directions|visit[-\s]?us/.test(hay)) score = 2;
    else if (/about/.test(hay)) score = 1;
    if (score < 0) continue;

    try {
      const abs = new URL(href, base);
      if (abs.hostname !== base.hostname) continue; // same-origin only (SSRF + relevance)
      if (isPrivateHostname(abs.hostname)) continue;
      abs.hash = "";
      const clean = abs.href.replace(/#.*$/, "").replace(/\/+$/, "") || abs.href;
      if (clean === baseHref) continue; // not the homepage itself
      const prev = scored.get(clean);
      if (prev === undefined || score > prev) scored.set(clean, score);
    } catch {
      continue;
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1]) // contact > find-us/location > about
    .slice(0, limit)
    .map(([url]) => url);
}

/* ── Social + booking link harvest (deterministic — no LLM) ──────────────────── */

interface ScannedLink { label: string; url: string }

// host (registrable) → social label. Booking platforms are matched separately via
// isBookingPlatformUrl so the full BOOKING_PLATFORM_DOMAINS set is covered.
const SOCIAL_LABELS: { test: RegExp; label: string }[] = [
  { test: /(?:^|\.)(?:facebook\.com|fb\.com|fb\.me|fb\.watch|m\.me)$/, label: "Facebook" },
  { test: /(?:^|\.)(?:instagram\.com|instagr\.am)$/, label: "Instagram" },
  { test: /(?:^|\.)linkedin\.com$/, label: "LinkedIn" },
  { test: /(?:^|\.)(?:x\.com|twitter\.com)$/, label: "X (Twitter)" },
  { test: /(?:^|\.)tiktok\.com$/, label: "TikTok" },
  { test: /(?:^|\.)(?:youtube\.com|youtu\.be)$/, label: "YouTube" },
  { test: /(?:^|\.)pinterest\.(?:com|co\.uk)$/, label: "Pinterest" },
];

/** Harvest social + booking links from the homepage anchors. Cross-origin is allowed
 *  here (socials are off-site by nature). Raw hrefs are preserved so wrong site-builder
 *  defaults (facebook.com/wix) surface for the operator rather than being hidden. */
function harvestSocialLinks(html: string, base: URL): ScannedLink[] {
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const seen = new Set<string>();
  const out: ScannedLink[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith("#") || /^(?:mailto:|tel:|javascript:)/i.test(href)) continue;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(abs.protocol)) continue;
    const dom = domainOf(abs.href);

    let label = "";
    for (const s of SOCIAL_LABELS) if (s.test.test(dom)) { label = s.label; break; }
    if (!label && isBookingPlatformUrl(abs.href)) label = `Booking — ${dom.replace(/\.(com|co\.uk|me|site)$/, "")}`;
    if (!label) continue; // only social + booking here

    const key = abs.href.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, url: abs.href }); // RAW href preserved (surfaces wix-default socials)
  }
  return out;
}

/* ── Email harvest (deterministic — no LLM) ──────────────────────────────────── */

// Junk / third-party email domains that are never the business's own contact.
const JUNK_EMAIL_DOMAINS = /(?:sentry\.io|wixpress\.com|wix\.com|example\.com|schema\.org|w3\.org|sentry-next\.wixpress\.com|googleapis\.com|gstatic\.com)$/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function isPlausibleEmail(e: string): boolean {
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) return false;
  if (/\.(?:png|jpe?g|gif|svg|webp|css|js)$/i.test(e)) return false; // asset filenames that look email-ish
  const dom = e.split("@")[1] ?? "";
  return !JUNK_EMAIL_DOMAINS.test(dom);
}

/** All plausible emails in a page's raw HTML — both mailto: hrefs and plain-text addresses. */
function harvestEmails(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    let e = m[1].trim();
    try { e = decodeURIComponent(e); } catch { /* leave as-is */ }
    e = e.toLowerCase();
    if (isPlausibleEmail(e)) out.add(e);
  }
  for (const m of html.matchAll(EMAIL_RE)) {
    const e = m[0].trim().toLowerCase();
    if (isPlausibleEmail(e)) out.add(e);
  }
  return [...out];
}

/** Pick the most likely MAIN business email from candidates gathered per page. Prefers an
 *  own-domain address (e.g. @ablm.co.uk), then one seen on the contact page; first-seen wins ties. */
function pickMainEmail(cands: { email: string; fromContact: boolean }[], siteDomain: string): string | undefined {
  if (!cands.length) return undefined;
  const ownDomain = (e: string): boolean => {
    const d = e.split("@")[1] ?? "";
    return !!siteDomain && (d === siteDomain || d.endsWith(`.${siteDomain}`));
  };
  const score = (c: { email: string; fromContact: boolean }) => (ownDomain(c.email) ? 4 : 0) + (c.fromContact ? 2 : 0);
  let best = cands[0];
  for (const c of cands) if (score(c) > score(best)) best = c; // strictly-greater → first-seen wins ties
  return best.email;
}

/* ── LLM details extraction ──────────────────────────────────────────────────── */

interface ScannedDetails { phone?: string; address?: string; email?: string; hours?: string }

const SYSTEM_PROMPT = `You extract a business's contact details from the plain text of THEIR OWN website.

Capture what is SHOWN — do not invent. Rules:
- Extract values that appear in the text. Do NOT guess, infer, or normalise a value that isn't shown; if a field genuinely does not appear, OMIT it (an omitted field is correct when it isn't shown).
- Clearly-labelled contact info SHOULD be captured even when the layout is loose or fragmented. Contact details commonly sit next to headings/labels like "Contact", "Get in touch", "Let's Chat", "Working Hours", "Opening Hours", "Find us", "Visit us" — read the value next to the label. E.g. a "Working Hours" heading followed by "Mon - Fri: 9am - 5pm" → hours = "Mon - Fri: 9am - 5pm"; a "Let's Chat" / "Email" label followed by "info@acme.co.uk" → email = "info@acme.co.uk".
- "phone": the business phone exactly as written (e.g. "01733 555123", "+44 1733 555123"). Omit if none shown.
- "email": the business email exactly as written. Omit if none shown.
- "address": the full postal address as one comma-joined line exactly as written (street, town, county, postcode). Omit if none shown — do NOT assemble an address from stray fragments.
- "hours": opening hours as a short single string exactly as written (e.g. "Mon - Fri: 9am - 5pm"). Omit if none shown.

Return ONLY a JSON object of this exact shape (omit any field not found):
{"phone"?: string, "address"?: string, "email"?: string, "hours"?: string}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Auth (same pattern as scan-services) ---
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
    const auditId: string = typeof body.audit_id === "string" ? body.audit_id : "";
    const businessName: string = typeof body.business_name === "string" ? body.business_name : "";
    const websiteRaw: string = typeof body.website === "string" ? body.website.trim() : "";

    if (!websiteRaw) return json({ success: false, error: "No website to scan." }, 400);
    if (isAggregatorUrl(websiteRaw)) {
      // A booking-platform / social / directory "website" is not the business's own site.
      return json({ success: false, error: "That URL is a booking platform / social / directory page, not an own website." }, 400);
    }
    const homepage = normaliseUrl(websiteRaw);
    if (!homepage) return json({ success: false, error: "Invalid website URL." }, 400);

    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!openAiKey) return json({ success: false, error: "Server misconfigured: OPENAI_API_KEY not set" }, 500);

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    // _v2: the extraction was fixed (deterministic email + stronger hours prompt + zwsp strip);
    // bump the version so already-cached empty-detail results don't keep coming back.
    const cacheKey = `${auditId || homepage.hostname}:site_details_v2`;

    // cache → cap → run → persist (enrichment_cache/usage + api_usage_log).
    const outcome = await runEnrichSource<{
      details: ScannedDetails;
      links: ScannedLink[];
      source_urls: string[];
      found: boolean;
    }>({
      service,
      userId,
      type: "site_details",
      cacheKey,
      estCostUsd: EST_COST_USD,
      run: async () => {
        const sourceUrls: string[] = [];

        // 1) Homepage (always first + in full).
        const homeHtml = await fetchHtml(homepage.toString());
        if (!homeHtml) {
          return { result: { details: {}, links: [], source_urls: [], found: false }, costUsd: 0 };
        }
        sourceUrls.push(homepage.toString());

        // Links: deterministic harvest from the HOMEPAGE anchors (no LLM, no cost).
        const links = harvestSocialLinks(homeHtml, homepage);

        // Email candidates harvested per page (mailto: + plain-text) — deterministic, not the LLM.
        const emailCands: { email: string; fromContact: boolean }[] = [];
        for (const e of harvestEmails(homeHtml)) emailCands.push({ email: e, fromContact: false });

        // Details text: homepage + up to MAX_SUBPAGES contact/about pages (that's where NAP lives).
        let text = htmlToText(homeHtml);
        const candidates = findContactLinks(homeHtml, homepage, MAX_SUBPAGES);
        for (const url of candidates) {
          const subHtml = await fetchHtml(url);
          if (!subHtml) continue;
          sourceUrls.push(url);
          const fromContact = /contact/i.test(url);
          for (const e of harvestEmails(subHtml)) emailCands.push({ email: e, fromContact });
          text += `\n\n----- ${url} -----\n\n` + htmlToText(subHtml).slice(0, MAX_SUBPAGE_CHARS);
          if (text.length >= MAX_TEXT_CHARS) break;
        }
        text = text.slice(0, MAX_TEXT_CHARS);

        // Deterministic main email (prefers own-domain, then contact page). Beats the LLM for email.
        const harvestedEmail = pickMainEmail(emailCands, domainOf(homepage.href));

        if (!text.trim()) {
          // No readable text for the LLM, but a harvested email still stands on its own.
          const details: ScannedDetails = harvestedEmail ? { email: harvestedEmail } : {};
          return { result: { details, links, source_urls: sourceUrls, found: links.length > 0 || !!harvestedEmail }, costUsd: 0 };
        }

        // 2) Strict details extraction via gpt-4o-mini (temperature 0 — extraction, not creative).
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: `Business name: ${businessName || "(unknown)"}\n\nWebsite text:\n${text}` },
            ],
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error(`[scan-site-details] OpenAI ${res.status}: ${errText.slice(0, 300)}`);
          throw new Error(`OpenAI ${res.status}`);
        }

        const completion = await res.json();
        const inTok = Number(completion?.usage?.prompt_tokens) || 0;
        const outTok = Number(completion?.usage?.completion_tokens) || 0;
        const costUsd =
          (inTok / 1_000_000) * OPENAI_INPUT_USD_PER_M + (outTok / 1_000_000) * OPENAI_OUTPUT_USD_PER_M;

        const details: ScannedDetails = {};
        try {
          const parsed = JSON.parse(completion?.choices?.[0]?.message?.content ?? "{}");
          const pick = (v: unknown, cap: number): string | undefined =>
            typeof v === "string" && v.trim() ? v.trim().slice(0, cap) : undefined;
          const phone = pick(parsed?.phone, 40);
          const address = pick(parsed?.address, 200);
          const email = pick(parsed?.email, 120);
          const hours = pick(parsed?.hours, 200);
          if (phone) details.phone = phone;
          if (address) details.address = address;
          if (email) details.email = email; // LLM email is a fallback; harvested wins below
          if (hours) details.hours = hours;
        } catch (e) {
          console.error("[scan-site-details] JSON parse failed:", (e as Error).message);
        }

        // Deterministic email is authoritative — override the LLM's when we harvested one.
        if (harvestedEmail) details.email = harvestedEmail;

        const found = links.length > 0 || Object.keys(details).length > 0;
        return { result: { details, links, source_urls: sourceUrls, found }, costUsd };
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

    const result = outcome.result ?? { details: {}, links: [], source_urls: [], found: false };
    return json({
      success: true,
      cached: outcome.cached,
      found: result.found,
      details: result.details,
      links: result.links,
      source_urls: result.source_urls,
      cost_usd: Number(outcome.costUsd.toFixed(4)),
    });
  } catch (error) {
    console.error("scan-site-details error:", error);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
