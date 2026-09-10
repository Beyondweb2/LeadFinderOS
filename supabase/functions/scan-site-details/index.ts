import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { isAggregatorUrl, isBookingPlatformUrl, domainOf } from "../_shared/aggregators.ts";
import { imageVariant, looksLikePlaceholder, resolveImgSizes, GRID_WIDTH, PLACE_WIDTH } from "../_shared/image-variant.ts";

// scan-site-details — reads a business's OWN website in ONE pass and extracts
// business DETAILS (phone / address / email / hours), the SERVICE AREAS it covers,
// its SERVICE LIST, its own IMAGES, and its SOCIAL & BOOKING LINKS. Returns the data
// ONLY — it does NOT save or auto-apply anything; the operator confirms first.
//
// ⚠️ THE NAME UNDERSTATES IT AND IS KEPT ON PURPOSE. Renaming a deployed function means
// a new function, an undeploy, and a caller change for zero functional gain; services,
// areas and images are all "site details". Do not rename it just to tidy the label.
//
// ⛔ ITS ONE CALLER IS src/pages/PageGenerator.tsx — NOT the AI Audit page. Two comments
// (this header, and PageGenerator's own) used to say the AI-audit autofill used it, and
// both were stale: AiAudit.tsx invokes create-ai-audit, extract-competitors, run-seo-scan
// and generate-report, and never this. That stale comment was believed and quoted as a
// reason NOT to touch this function (§4: a stale comment is a load-bearing bug). Grep for
// the callers before believing any sentence about what depends on this.
//
// ── WHY THIS DOES FIVE JOBS INSTEAD OF TWO FUNCTIONS DOING THREE AND TWO ──────────
// A separate trade scraper was built, measured on six real locksmith sites, and then
// folded in here (2026-09-10, Paul's call). It extracted services + areas but NOT
// phone/address/hours — which the mockup's contact block needs — so the mockup flow would
// have called BOTH functions per prospect: two fetches of the same website, two LLM calls,
// two chances for their site to be down. Their website is the least reliable input in the
// whole system, so fetching it twice doubled the failure rate and the cost for no gain.
// One pass: 1 homepage + up to MAX_SUBPAGES, one LLM call.
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
/* Was 2 (contact/about only). Now 4, because ONE pass has to reach BOTH the contact page
   (where NAP lives) and the services page (where the service list lives). Still fewer
   fetches than the two-function shape it replaces: 1 homepage + up to 4, against
   2 homepages + up to 5. */
const MAX_SUBPAGES = 4;
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1024 * 1024; // 1MB, same as scan-services / extract-facebook

/* ── Area cap ──────────────────────────────────────────────────────────────────
   DEFAULT STAYS 12 so the one existing caller (PageGenerator) is byte-for-byte
   unchanged: it pre-fills one operator text field, and a 38-item list is not a
   pre-fill, it is a paste. The mockup flow asks for more via `max_areas`, because a
   location page per covered town is the product. CEILING 60: the largest real list
   measured is Delta's 38, so 60 is headroom without letting a runaway list through. */
const DEFAULT_MAX_AREAS = 12;
const MAX_MAX_AREAS = 60;

/* ── Image harvest caps ────────────────────────────────────────────────────────
   Their OWN photos of their van, shop and work beat a Maps photo and beat Street
   View. 24 is enough for a picker grid without turning the response into a payload. */
const MAX_IMAGES = 24;

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

/* ⛔ DEFECT 1, FIXED 2026-09-10: NUMERIC HTML ENTITIES WERE NEVER DECODED. The old chain
   handled &nbsp; &amp; &pound; &#163; and then stripped /&[a-z]+;/i — ALPHABETIC ONLY — so
   every numeric entity survived into the text AND into extracted values. Measured leftovers
   on six real locksmith sites: 4, 3, 5, 0, 14, 0. WordPress emits &#038; for a plain
   ampersand and &#8211; for an en dash, so this hit ordinary punctuation constantly:
   "Car Ignition &#038; Lock Repairs" was a real extracted service name.
   ⚠️ ORDER MATTERS. Numeric first, then the known names, and only THEN the catch-all strip —
   otherwise the catch-all eats the leading "&" of a numeric entity and leaves "#038;". */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", pound: "£", quot: '"', apos: "'", lt: "<", gt: ">",
  euro: "€", cent: "¢", yen: "¥", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", deg: "°", middot: "·", bull: "•", times: "×",
};

function decodeEntities(s: string): string {
  return s
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
      /* An UNKNOWN named entity becomes a space, never its own literal text — the old
         behaviour, kept deliberately: a stray "&foo;" inside a service name is worse than
         a gap, because the gap is obviously missing and the artefact looks intentional. */
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, k) ? NAMED_ENTITIES[k] : " ";
    });
}

/** Strip scripts/styles/tags → readable text; collapse whitespace (from scan-services). */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[​‌‍⁠﻿]/g, "") // strip zero-width cruft (Wix injects these, fragmenting labels/values)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ⛔ DEFECT 4, FIXED 2026-09-10: NAV-ACCORDION AND CTA FURNITURE reads as service-shaped
   text and was going to the model as content. Grays (Nottingham) emits "Close Master
   Locksmith" / "Open Master Locksmith" once per menu group and "Explore" six times.
   ⛔ EVERY PATTERN IS ANCHORED TO A WHOLE LINE, never a substring. "Open" as a substring
   would delete "Safe Opening" and "Open 24 Hours"; "close" would take "Closed Sundays" —
   i.e. it would eat real services and real HOURS, the field this function exists for.
   ✅ CHECKED FOR OVER-REACH across all six measured sites before shipping: 22 distinct
   strings dropped, every one navigation furniture, zero services and zero areas. Re-run
   that check if you add a pattern. */
const NAV_JUNK_LINE = new RegExp(
  "^(?:" +
    [
      "(?:open|close)\\s+.{0,40}",
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
function stripNavJunk(text: string): { text: string; dropped: number } {
  let dropped = 0;
  const kept = text.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (NAV_JUNK_LINE.test(t)) { dropped++; return false; }
    return true;
  });
  return { text: kept.join("\n"), dropped };
}

/* ── Subpage finder: contact/about AND services, in ONE pass ─────────────────────
   Was contact-only (findContactLinks). It now has to reach BOTH kinds, because merging
   the trade scraper in here is what removes a SECOND fetch of the same website — their
   site being the least reliable input in the system, fetching it twice doubled both the
   failure rate and the cost for no gain.
   ⚠️ INTERLEAVED, NOT CONCATENATED. Taking "the top 4 by score" would spend the whole
   budget on contact pages for a site with contact/about/find-us/directions links and
   never reach /services/ — the list the mockup is built from. So the budget is split:
   contact-ish and service-ish are ranked separately and then taken in turns. */

const BOOKING_WIDGET_PATH =
  /(booking-calendar|book-now|book-online|book-a|\/booking\/|\/bookings\/|\/book\/|schedule|appointment|calendar|service-page\/)/i;

/* ⛔ DEFECT 2, FIXED 2026-09-10: THE DEDUPE WAS PROTOCOL-SENSITIVE. It stripped the hash
   and trailing slashes but not the scheme, so a site served over http whose own nav links
   https did not match its own base — and fetched ITS OWN HOMEPAGE as a subpage. RL
   Locksmiths duplicated 1,522 chars, half its entire payload, for nothing. */
function sameTarget(a: string, b: string): boolean {
  const norm = (u: string) =>
    u.replace(/^https?:\/\//i, "").replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

type LinkKind = "contact" | "service";

function rankLinks(html: string, base: URL, kind: LinkKind): string[] {
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const scored = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, " ");
    const hay = `${href} ${text}`.toLowerCase();

    let score = -1;
    if (kind === "contact") {
      // NAP + hours live on contact / about / find-us pages. Rank contact highest.
      if (/contact|get[-\s]?in[-\s]?touch/.test(hay)) score = 3;
      else if (/find[-\s]?us|where[-\s]?to[-\s]?find|location|directions|visit[-\s]?us/.test(hay)) score = 2;
      else if (/about/.test(hay)) score = 1;
    } else {
      /* SERVICE-first, not price-first. The deleted scan-services ranked price above
         service because a barber's menu IS a price list. ⚠️ On all six measured trade
         sites the two orderings picked the SAME pages — trade sites label the page
         "Services" and link it from price copy too — so this is the right default for the
         trade and it is NOT claimed as a fix for anything. */
      if (/service/.test(hay)) score = 3;
      else if (/pric|\bcost/.test(hay)) score = 2;
      else if (/what[-\s]?we[-\s]?do|our[-\s]?work/.test(hay)) score = 1;
      // JS scheduling widgets are huge and carry no service list.
      if (score >= 0 && BOOKING_WIDGET_PATH.test(href)) score = -1;
    }
    if (score < 0) continue;

    try {
      const abs = new URL(href, base);
      if (abs.hostname !== base.hostname) continue; // same-origin only (SSRF + relevance)
      if (isPrivateHostname(abs.hostname)) continue;
      abs.hash = "";
      const clean = abs.href.replace(/#.*$/, "").replace(/\/+$/, "") || abs.href;
      if (sameTarget(clean, base.href)) continue; // DEFECT 2 — never the homepage itself
      const prev = scored.get(clean);
      if (prev === undefined || score > prev) scored.set(clean, score);
    } catch {
      continue;
    }
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}

/** Up to `limit` subpages, alternating contact-ish and service-ish so neither starves. */
function findSubpages(html: string, base: URL, limit: number): string[] {
  const contact = rankLinks(html, base, "contact");
  const services = rankLinks(html, base, "service");
  const out: string[] = [];
  const seen = new Set<string>();
  /* Contact goes FIRST on each turn: NAP is what the live caller depends on, so if the
     budget runs out it must run out on the newer half, never on the shipped one. */
  for (let i = 0; out.length < limit && (i < contact.length || i < services.length); i++) {
    for (const cand of [contact[i], services[i]]) {
      if (!cand || out.length >= limit) continue;
      if (out.some((u) => sameTarget(u, cand)) || seen.has(cand)) continue;
      seen.add(cand);
      out.push(cand);
    }
  }
  return out;
}

/* ── Image harvest (deterministic — no LLM) ──────────────────────────────────────
   THEIR OWN photos, from the HTML already fetched. A van, a shopfront, real work —
   all of which beat a scraped Maps photo and all of which beat a Street View frame of
   the road outside.
   ⛔ EVERY IMAGE CARRIES ITS SOURCE, and that is a hard requirement rather than a nicety:
   a saved mockup may later become a real build, and at that point Places-sourced imagery
   has to be swapped out FIRST. After re-hosting into our own bucket a Maps photo and an
   own-site photo are both just bucket URLs — indistinguishable — which is exactly how the
   old picker lost provenance. Record it at harvest, not later. */
interface ScannedImage {
  /** ~PLACE_WIDTH — the copy that gets re-hosted and rendered. */
  url: string;
  /** ~GRID_WIDTH — what the picker's grid loads. Same image, a size that does not crawl. */
  thumb: string;
  source: "own_site";
  from: "og" | "img";
  alt?: string;
  width?: number;
  /** Set when the harvested URL was a low-quality placeholder we upgraded away from. */
  was_placeholder?: boolean;
}

/** Skip sprites, icons, logos, tracking pixels and data URIs — never a hero photo. */
const IMG_SKIP = /(?:sprite|icon|favicon|logo|badge|pixel|spacer|placeholder|1x1|blank|loader|spinner|avatar|flag|arrow|chevron|star|cookie)/i;

function harvestImages(html: string, base: URL, limit: number): ScannedImage[] {
  const out: ScannedImage[] = [];
  const seen = new Set<string>();
  const push = (raw: string, from: "og" | "img", alt?: string, width?: number) => {
    if (out.length >= limit) return;
    const u = (raw || "").trim();
    if (!u || u.startsWith("data:")) return;   // inline data URIs are icons, not photos
    let abs: URL;
    try { abs = new URL(u, base); } catch { return; }
    if (!["http:", "https:"].includes(abs.protocol)) return;
    if (!/\.(?:jpe?g|png|webp|avif)(?:$|\?)/i.test(abs.pathname + abs.search) && from === "img") return;
    if (IMG_SKIP.test(abs.pathname)) return;
    /* ⛔ ASK THE CDN FOR A REAL SIZE. Wix (and Squarespace, and WordPress) put a blurred
       thumbnail in `src` and swap the photo in with JavaScript — measured on Starr Keys: 10 of 12
       harvested URLs carried `blur_2` at 73x49. Upgrading here rather than at display time means
       the VISION PASS also sees the real photo; scoring the placeholder is what made nine of their
       perfectly good photos read as "blurry". */
    const placed = imageVariant(abs.href, PLACE_WIDTH);
    const thumb = imageVariant(abs.href, GRID_WIDTH);
    const wasPlaceholder = looksLikePlaceholder(abs.href);
    /* ⚠️ A placeholder we could NOT upgrade is dropped — an un-upgradeable 73x49 is not a photo and
       putting it in the grid wastes a slot and a vision score. One we COULD upgrade is kept, and
       flagged so the picker can say where it came from. */
    if (wasPlaceholder && placed === abs.href) return;
    const key = placed.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      url: placed, thumb, source: "own_site", from,
      ...(alt ? { alt: alt.slice(0, 120) } : {}),
      ...(width ? { width } : {}),
      ...(wasPlaceholder ? { was_placeholder: true } : {}),
    });
  };

  /** Push an already-resolved { url, thumb } pair (the srcset path chose real sizes for us). */
  const pushPair = (url: string, thumb: string, from: "og" | "img", alt?: string, width?: number) => {
    if (out.length >= limit) return;
    let a: URL, t: URL;
    try { a = new URL(url); t = new URL(thumb || url); } catch { return; }
    if (!["http:", "https:"].includes(a.protocol)) return;
    // Same extension gate as push(): an SVG or extensionless URL is furniture, not a photo.
    if (from === "img" && !/\.(?:jpe?g|png|webp|avif)(?:$|\?)/i.test(a.pathname + a.search)) return;
    if (IMG_SKIP.test(a.pathname)) return;
    /* ⛔ ITEM 5's GUARD, AND IT IS ENFORCED AFTER RESOLUTION, NOT BEFORE. A placeholder that
       srcset or a CDN transform has already replaced is fine; one that is STILL a placeholder here
       could not be rescued and must never reach the grid or the vision scorer. */
    if (looksLikePlaceholder(a.href)) return;
    const key = a.href.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      url: a.href, thumb: t.href, source: "own_site", from,
      ...(alt ? { alt: alt.slice(0, 120) } : {}),
      ...(width ? { width } : {}),
    });
  };

  // og:image first — it is the one image the site itself nominated as representative.
  for (const m of html.matchAll(/<meta\b[^>]*property\s*=\s*["']og:image(?::secure_url)?["'][^>]*>/gi)) {
    const c = m[0].match(/content\s*=\s*["']([^"']+)["']/i);
    if (c) push(c[1], "og");
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    /* ⛔ srcset FIRST, THEN A LAZY ATTRIBUTE, THEN src — in that order, and the order is the whole
       fix. MEASURED across six real locksmith sites 2026-09-11: four of the six lazy-load
       (data-src, data-srcset, data-lazy-src) and FIVE are WordPress, where an arbitrary width
       cannot be requested because WordPress only generates a fixed set at upload. srcset is the
       builder telling us exactly which sizes exist, so the size is CHOSEN rather than guessed.
       ⛔ AND READING src FIRST IS WHAT CAUSED THE BLURRY GRID: on a lazy-loading site src holds the
       placeholder. Wix's carried `blur_2` at 73x49. */
    const srcset = tag.match(/\bdata-srcset\s*=\s*["']([^"']+)["']/i)?.[1]
      ?? tag.match(/\bsrcset\s*=\s*["']([^"']+)["']/i)?.[1];
    const lazy = tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1]
      ?? tag.match(/\bdata-lazy-src\s*=\s*["']([^"']+)["']/i)?.[1]
      ?? tag.match(/\bdata-original\s*=\s*["']([^"']+)["']/i)?.[1]
      ?? tag.match(/\bdata-full-src\s*=\s*["']([^"']+)["']/i)?.[1];
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];

    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1];
    const wAttr = Number(tag.match(/\bwidth\s*=\s*["']?(\d+)/i)?.[1]);
    // A declared width under 100px is furniture whatever it is called.
    if (Number.isFinite(wAttr) && wAttr > 0 && wAttr < 100) continue;

    const resolved = resolveImgSizes({ src, srcset, lazy }, base.href, { place: PLACE_WIDTH, grid: GRID_WIDTH });
    if (!resolved) continue;
    pushPair(resolved.url, resolved.thumb, "img", alt, Number.isFinite(wAttr) && wAttr > 0 ? wAttr : undefined);
  }
  return out;
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

/* ⛔ TEMPLATE PLACEHOLDER LOCAL-PARTS, added 2026-09-10 on Paul's call. Aston's Access
   returns `someone@gmail.com` — a theme placeholder its owner never replaced, sitting in a
   real mailto: on a real business's real site. The domain is gmail.com, so no domain filter
   can catch it; it has to be caught on the LOCAL part.
   ⚠️ ANCHORED WHOLE-STRING, never a substring. As a substring "name" would delete
   `name@rglocksmiths.co.uk` and "info" would delete every `info@…` address in the book,
   which is the most common real business email there is. Each entry must match the WHOLE
   local part.
   ⚠️ It is a curated list and will be incomplete — append to it when one gets through. The
   failure mode is mild in one direction (a placeholder prints on a mockup and Paul spots it)
   and severe in the other (a real address is silently dropped and the contact block is
   blank), which is why the list is exact-match and short rather than clever. */
const PLACEHOLDER_EMAIL_LOCAL = new Set([
  "someone", "example", "placeholder", "sample", "changeme",
  "yourname", "your-name", "your_name", "youremail", "your-email", "yourmail", "myemail",
  "firstname", "lastname", "firstnamelastname", "firstname.lastname",
  "john.doe", "johndoe", "jane.doe", "janedoe", "joe.bloggs", "joebloggs",
  "test", "testing", "demo", "username", "asdf",
  // Real but useless on a contact block — a prospect cannot reply to these.
  "noreply", "no-reply", "donotreply", "do-not-reply",
]);
/* ⛔ FIVE ENTRIES WERE REMOVED FROM THE LIST ABOVE BEFORE IT SHIPPED, and the test is what
   caught it: `name`, `email`, `user`, `abc`, `xyz`. The unit test drove
   `name@rglocksmiths.co.uk` — a case this file's own comment had warned about — and the
   filter rejected it. `abc@abc-locksmiths.co.uk` is the same shape: a local part that reads
   like filler but is the business's actual initials.
   ⚠️ THE RULE THIS LEAVES BEHIND: only list a local part that CANNOT plausibly be a real
   mailbox at a real trade business. Dropping a genuine address blanks the contact block
   silently; letting a placeholder through puts one visible line on a draft Paul reviews. */

/* Counties and regions are not towns. A location page for "Cheshire" is not a location page.
   ⚠️ THE OLD PHRASE FILTER CANNOT CATCH THESE and that is a word-boundary subtlety worth
   naming: it tests /\bshire\b/, which does NOT match inside "Cheshire" — there is no boundary
   between "Che" and "shire". So Cheshire and Lancashire both sailed through it.
   ⛔ AN EXACT LIST, NOT A SUFFIX RULE. "-shire" alone would be tempting and would also be
   wrong in the other direction eventually; and "-side" would catch Merseyside but risks a
   real place. Paul appends to this the same way he appends to knownEntities.ts. */
const COUNTIES_AND_REGIONS = new Set([
  // -shire counties
  "cheshire", "lancashire", "yorkshire", "north yorkshire", "south yorkshire",
  "west yorkshire", "east yorkshire", "hampshire", "lincolnshire", "leicestershire",
  "nottinghamshire", "derbyshire", "staffordshire", "warwickshire", "worcestershire",
  "gloucestershire", "oxfordshire", "berkshire", "buckinghamshire", "bedfordshire",
  "hertfordshire", "cambridgeshire", "northamptonshire", "shropshire", "wiltshire",
  "dorset", "somerset", "devon", "cornwall", "herefordshire", "rutland", "cumbria",
  // metropolitan counties + regions
  "merseyside", "tyneside", "humberside", "teesside", "greater manchester",
  "west midlands", "east midlands", "greater london", "tyne and wear",
  "south wales", "north wales", "mid wales",
  // compass regions
  "north west", "north east", "south west", "south east", "the north", "the south",
  "the midlands", "home counties", "east anglia", "the lake district", "the cotswolds",
  // non-shire counties commonly listed
  "kent", "essex", "surrey", "sussex", "east sussex", "west sussex", "norfolk",
  "suffolk", "durham", "northumberland", "county durham", "clwyd", "gwynedd", "powys",
  // nations
  "england", "scotland", "wales", "northern ireland", "uk", "united kingdom",
]);

/** True for a county, region or nation — anything that is not a town you could target. */
function isCountyOrRegion(s: string): boolean {
  const k = s.trim().toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ");
  return COUNTIES_AND_REGIONS.has(k) || COUNTIES_AND_REGIONS.has(`the ${k}`);
}
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function isPlausibleEmail(e: string): boolean {
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) return false;
  if (/\.(?:png|jpe?g|gif|svg|webp|css|js)$/i.test(e)) return false; // asset filenames that look email-ish
  const [local, dom] = [e.split("@")[0] ?? "", e.split("@")[1] ?? ""];
  if (PLACEHOLDER_EMAIL_LOCAL.has(local.toLowerCase())) return false; // someone@gmail.com et al
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

/* `areas` was added 2026-08-28 for the page generator's autofill (credentials were added the
   same day and REMOVED again — see below).
   ⛔ AREAS ARE FACTUAL AND CARRY NO SAFETY WEIGHT, which is why they are scraped and credentials are
   not. Areas are
   FACTUAL and pre-fill a field the operator reviews. Credentials are TRUST AND SAFETY CLAIMS and
   are only ever offered as UNTICKED SUGGESTIONS — a website is the worst possible source for
   whether a registration is CURRENT (a badge outlives a lapsed membership, and numbers go stale),
   so "it appears on their site" is evidence it was once claimed, never evidence it is true today.
   This function reports what it read; it decides nothing.

   ⛔ CREDENTIALS ARE NO LONGER SCRAPED AT ALL (Paul, 2026-08-28 — reversing the same day's build,
   deliberately). Scraping them was working: RG's site claimed none, SC Plumbing's said "Gas Safe"
   three times. The problem was not accuracy but what a suggestion IMPLIES. A scraped credential
   arrives wearing evidence ("it's on their site") and invites a rubber-stamp tick — while a site
   only proves a claim was made ONCE, never that a registration is CURRENT. The page generator now
   offers TRADE-BASED suggestions instead (src/lib/tradeCredentials.ts), which cannot be mistaken
   for evidence and so force the operator to supply the knowledge. Areas stay scraped: they are
   factual and carry no safety weight. */
interface ScannedService { name: string; price?: string; description?: string }

interface ScannedDetails {
  phone?: string; address?: string; email?: string; hours?: string;
  /** Place names the site says the business covers. Literal only. */
  areas?: string[];
  /** Services as the site names them, with a price ONLY where one is shown per-service. */
  services?: ScannedService[];
}

/* ── TWO PROMPTS, ONE FETCH ────────────────────────────────────────────────────
   ⛔ THE MERGE WENT ONE STEP TOO FAR AND MEASURED WORSE. Folding services into the
   SAME prompt as NAP + areas cost real extraction: Delta went 27 services -> 0 and
   Grays 37 -> 20, from BYTE-IDENTICAL input text and the same pages fetched. Delta's
   services sit in a three-column grid that reads as interleaved short lines, and with
   six extraction targets plus a long exclusion list ahead of them the model treated
   them as navigation.
   ⛔ IT ALSO MOVED NAP, which is the thing that must never move: Aston's lost its
   address and Delta's gained/lost a comma.

   THE FIX IS ONE FETCH, TWO CALLS -- not one call. The expensive, slow, fragile part is
   fetching THEIR WEBSITE, and that is still done once. gpt-4o-mini costs ~$0.0008 a
   call, so the second call is ~0.08p per prospect; the fetch is 8-25 seconds and can
   fail. Splitting the calls buys prompt isolation for a rounding error.

   ⛔ NAP_SYSTEM_PROMPT IS v4's PROMPT, BYTE-FOR-BYTE, spliced in from git rather than
   retyped. That is what makes a NAP regression structurally impossible instead of
   merely unlikely: the phone/address/email/hours/areas extraction is running the exact
   text it ran before this feature existed. If you edit it, you are changing a shipped
   extractor -- capture a baseline FIRST (see the report), because a prompt tweak that
   looks harmless moved an address last time. */

const NAP_SYSTEM_PROMPT = `You extract a business's contact details from the plain text of THEIR OWN website.

Capture what is SHOWN — do not invent. Rules:
- Extract values that appear in the text. Do NOT guess, infer, or normalise a value that isn't shown; if a field genuinely does not appear, OMIT it (an omitted field is correct when it isn't shown).
- Clearly-labelled contact info SHOULD be captured even when the layout is loose or fragmented. Contact details commonly sit next to headings/labels like "Contact", "Get in touch", "Let's Chat", "Working Hours", "Opening Hours", "Find us", "Visit us" — read the value next to the label. E.g. a "Working Hours" heading followed by "Mon - Fri: 9am - 5pm" → hours = "Mon - Fri: 9am - 5pm"; a "Let's Chat" / "Email" label followed by "info@acme.co.uk" → email = "info@acme.co.uk".
- "phone": the business phone exactly as written (e.g. "01733 555123", "+44 1733 555123"). Omit if none shown.
- "email": the business email exactly as written. Omit if none shown.
- "address": the full postal address as one comma-joined line exactly as written (street, town, county, postcode). Omit if none shown — do NOT assemble an address from stray fragments.
- "hours": opening hours as a short single string exactly as written (e.g. "Mon - Fri: 9am - 5pm"). Omit if none shown.
- "areas": the towns, villages, cities or districts the site says the business COVERS or SERVES (e.g. from "Areas we cover", a footer list, or "serving X, Y and Z"). Place names only, exactly as written, no counties-as-catch-alls like "the Midlands" and no phrases like "and surrounding areas". Omit the field entirely if the site names no areas.

⛔ DO NOT EXTRACT CREDENTIALS AT ALL. Accreditations, memberships, certifications, awards and insurance statements are NOT wanted from this scan — do not report them in any field. A human confirms those separately from trade knowledge, because a site only shows a claim was made once, never that it is still current.

Return ONLY a JSON object of this exact shape (omit any field not found):
{"phone"?: string, "address"?: string, "email"?: string, "hours"?: string, "areas"?: string[]}`;

/* The SERVICES prompt, verbatim from the deleted scan-trade-site (commit 5db2e243) --
   the version MEASURED at 12/4/37/27/9/2 services across the six real locksmith sites.
   It carries its own anti-headline-price rule: Dr Locks' banner "from £65" was being
   attached to four specific services whose own bands are different (uPVC is
   "£125 - £150"), which is a price that is literally on the site but paired with the
   wrong service -- and a mockup that misquotes a prospect's own prices back at them is
   the wrong-town report in a new place. */
const SERVICES_SYSTEM_PROMPT = `You extract a trade business's SERVICE LIST and SERVICE AREAS from the plain text of THEIR OWN website. Typical trades: locksmith, plumber, electrician, mechanic.

THE ONE RULE THAT OVERRIDES EVERYTHING: extract ONLY what is LITERALLY present in the text. Never invent, infer, guess, normalise or complete a value. If something is not shown, omit it. An empty list is the correct answer when the page does not list services.

"services" — the things this business does, as the site names them.
- "name": the service exactly as written (e.g. "Emergency Door Opening", "uPVC Door Repairs", "Car Key Programming"). Keep their wording and capitalisation. Do not translate, expand, tidy or merge.
- "price": ONLY if a price is literally shown BESIDE THAT SPECIFIC SERVICE, as the literal string exactly as written ("£65", "from £65", "£60 – £100", "£50 – £100 per lock"). Do NOT convert, round, average or estimate. Do NOT take a site-wide headline or strapline price (a banner reading "from £65", "transparent pricing from £65", a footer "prices from …") and attach it to individual services — if no price is stated beside that specific service, OMIT the field for that service. Most trade sites show NO prices — omitting the field is the normal, correct outcome.
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
    /* --- Auth: an operator's JWT (as before) OR a trusted INTERNAL call. ---
       ⛔ THE INTERNAL DOOR IS CRON_SECRET + x-internal-job, AND IT IS NOT A CHOICE.
       CLAUDE.md §8 records the full matrix: since the ~2026-08-11 rotation the service-role key is
       `sb_secret_` shaped, not a JWT, so `getClaims` cannot read it — AND the gateway only forwards
       a JWT-shaped bearer while `sb_` keys are accepted only in `apikey`. The two requirements are
       mutually exclusive, so a service-role bearer branch is dead code on every function that has
       one. Do NOT "fix" a 401 here by hunting for the right key; CRON_SECRET and an operator JWT
       are the only two doors that exist. This is the same shape extract-competitors and
       generate-report use.
       ⚠️ ADDED 2026-09-10 for the mockup reply trigger, which runs inside a Meta webhook and has no
       operator JWT to offer. The user-JWT path below is byte-for-byte unchanged, and an external
       caller can hold neither header, so this is purely additive. */
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const authHeader = req.headers.get("Authorization");

    const isInternal = !!cronSecret &&
      req.headers.get("x-cron-secret") === cronSecret &&
      !!req.headers.get("x-internal-job");

    let userId: string;
    if (isInternal) {
      /* ⛔ THE CALLER MUST NAME AN OWNER, and it is read here for the DAILY COST CAP, not for
         permission. runEnrichSource skips the cap entirely when userId is null, so accepting an
         internal call without one would quietly create an uncapped spend path into a paid API —
         the opposite of what an internal branch should cost. An internal call with no user_id is
         refused rather than run uncapped. */
      const bodyPeek = await req.clone().json().catch(() => ({}));
      const claimed = typeof bodyPeek?.user_id === "string" ? bodyPeek.user_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(claimed)) {
        return json({ success: false, error: "internal call requires user_id (for the cost cap)" }, 400);
      }
      userId = claimed;
    } else {
      if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) return json({ success: false, error: "Unauthorized" }, 401);
      userId = claimsData.claims.sub as string;
    }

    // --- Parse + validate ---
    const body = await req.json().catch(() => ({}));
    const auditId: string = typeof body.audit_id === "string" ? body.audit_id : "";
    const businessName: string = typeof body.business_name === "string" ? body.business_name : "";
    const websiteRaw: string = typeof body.website === "string" ? body.website.trim() : "";
    /* max_areas: the existing caller sends nothing and gets 12 — unchanged. An absent,
       non-numeric or out-of-range value falls back to the DEFAULT rather than to the
       ceiling: absence must never widen what a caller receives. */
    const rawMaxAreas = Number(body.max_areas);
    const maxAreas = Number.isFinite(rawMaxAreas) && rawMaxAreas >= 1
      ? Math.min(Math.floor(rawMaxAreas), MAX_MAX_AREAS)
      : DEFAULT_MAX_AREAS;

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

    /* _v2: the extraction was fixed (deterministic email + stronger hours prompt + zwsp strip);
       bump the version so already-cached empty-detail results don't keep coming back.
       ⛔ _v4 (2026-08-28): `areas` was ADDED, then credential extraction was REMOVED. The cache has a
       30-day TTL, so without a bump a client scanned last week would return a hit with neither
       30-day TTL, so without a bump a client scanned before either change returns a HIT missing
       areas (or carrying dead credentials) — an absent value reading as a measured "none".
       Change what an extractor returns, bump its version.
       ⛔ _v5 (2026-09-10): SERVICES and IMAGES were added, and the four fetch/parse defects
       were fixed. Same reasoning, and it is the one that would bite hardest: a hostname
       scanned yesterday would return a _v4 HIT carrying no `services` and no `images`, and
       the mockup generator would read that absence as "this business lists no services" —
       then build a page with none. The bump is not tidiness, it is the absent-value fault
       on a 30-day cache.
       ⛔ _v6 (same day): the single merged prompt became TWO prompts over one fetch, because
       the merged one measured worse (Delta 27 services -> 0, Grays 37 -> 20) AND moved NAP.
       Every _v5 row therefore holds a service list produced by the bad prompt — a hit would
       serve Delta's zero services as though they were measured.
       ⛔ _v7 (same day): counties/regions are now dropped from `areas` and template
       placeholder emails from `email`. Both REMOVE values, so a stale hit would keep
       serving "Cheshire" as a target town and someone@gmail.com as a contact.
       ⛔ _v8 (same day): the IMAGE HARVEST changed — Wix/Squarespace/WordPress placeholder URLs
       are now upgraded to a real size. AND I FORGOT THIS BUMP THE FIRST TIME, which is how the
       rule earns its place: the fix was deployed, a refill was run, and 10 of 12 own-site URLs
       came back STILL CARRYING blur_2 from the _v7 row written 35 minutes earlier. The code was
       right, the cache was old, and the picker looked exactly as broken as before. Change what an
       extractor RETURNS, bump its version — every time, including when the change is a bug fix.
       ⛔ _v9: the harvest now reads `srcset` FIRST (the builder's own list of real sizes) and only
       then a lazy attribute, then `src`. Measured across the six test sites: the grid's own-site
       thumbnails fall from 11,563KB to 2,195KB — Grays alone 10,071KB to 609KB, 2,940ms to 513ms
       — and the URLs stored change on every lazy-loading site, so a _v8 hit would serve the old
       heavy set. Bumped BEFORE deploying this time. */
    const cacheKey = `${auditId || homepage.hostname}:site_details_v9`;

    // cache → cap → run → persist (enrichment_cache/usage + api_usage_log).
    const outcome = await runEnrichSource<{
      details: ScannedDetails;
      links: ScannedLink[];
      images: ScannedImage[];
      source_urls: string[];
      found: boolean;
      diag: { textChars: number; navJunkDropped: number; subpages: number };
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
          return {
            result: {
              details: {}, links: [], images: [], source_urls: [], found: false,
              diag: { textChars: 0, navJunkDropped: 0, subpages: 0 },
            },
            costUsd: 0,
          };
        }
        sourceUrls.push(homepage.toString());

        // Links: deterministic harvest from the HOMEPAGE anchors (no LLM, no cost).
        const links = harvestSocialLinks(homeHtml, homepage);

        /* Images: deterministic harvest, homepage first so og:image and the hero rank
           highest. No LLM, no cost. Each carries source: "own_site". */
        const images = harvestImages(homeHtml, homepage, MAX_IMAGES);

        // Email candidates harvested per page (mailto: + plain-text) — deterministic, not the LLM.
        const emailCands: { email: string; fromContact: boolean }[] = [];
        for (const e of harvestEmails(homeHtml)) emailCands.push({ email: e, fromContact: false });

        // Details text: homepage + up to MAX_SUBPAGES contact/about AND service pages.
        let text = htmlToText(homeHtml);
        const candidates = findSubpages(homeHtml, homepage, MAX_SUBPAGES);
        for (const url of candidates) {
          const subHtml = await fetchHtml(url);
          if (!subHtml) continue;
          sourceUrls.push(url);
          const fromContact = /contact/i.test(url);
          for (const e of harvestEmails(subHtml)) emailCands.push({ email: e, fromContact });
          for (const im of harvestImages(subHtml, homepage, MAX_IMAGES - images.length)) images.push(im);
          text += `\n\n----- ${url} -----\n\n` + htmlToText(subHtml).slice(0, MAX_SUBPAGE_CHARS);
          if (text.length >= MAX_TEXT_CHARS) break;
        }

        /* DEFECT 4: drop navigation furniture before spending tokens on it — and before it
           can be mistaken for a service name. Applied AFTER assembly so a junk line on a
           subpage is caught too. */
        const nav = stripNavJunk(text);
        text = nav.text.slice(0, MAX_TEXT_CHARS);
        const diag = { textChars: text.length, navJunkDropped: nav.dropped, subpages: sourceUrls.length - 1 };

        // Deterministic main email (prefers own-domain, then contact page). Beats the LLM for email.
        const harvestedEmail = pickMainEmail(emailCands, domainOf(homepage.href));

        if (!text.trim()) {
          // No readable text for the LLM, but a harvested email still stands on its own.
          const details: ScannedDetails = harvestedEmail ? { email: harvestedEmail } : {};
          return {
            result: {
              details, links, images, source_urls: sourceUrls,
              found: links.length > 0 || images.length > 0 || !!harvestedEmail, diag,
            },
            costUsd: 0,
          };
        }

        /* 2) TWO extractions over the SAME text, on ONE fetch. gpt-4o-mini, temperature 0
              (extraction, not writing). See the two-prompts note above for why they are not
              one call.
           ⛔ THE NAP CALL IS THE SHIPPED ONE AND THE SERVICES CALL MUST NOT BE ABLE TO BREAK
              IT. The NAP call throws on a non-OK response exactly as it did before, so a real
              OpenAI outage still fails the run and never caches a hollow result. The SERVICES
              call is wrapped so that ANY failure — HTTP, parse, malformed shape — costs the
              service list and nothing else. The newer half is not allowed to take the half
              PageGenerator depends on down with it. */
        const callOpenAi = async (systemPrompt: string) => {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              temperature: 0,
              response_format: { type: "json_object" },
              max_tokens: 3000,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Business name: ${businessName || "(unknown)"}\n\nWebsite text:\n${text}` },
              ],
            }),
          });
          return r;
        };
        const usdOf = (c: Record<string, unknown>): number => {
          const u = (c?.usage ?? {}) as Record<string, unknown>;
          return (
            ((Number(u.prompt_tokens) || 0) / 1_000_000) * OPENAI_INPUT_USD_PER_M +
            ((Number(u.completion_tokens) || 0) / 1_000_000) * OPENAI_OUTPUT_USD_PER_M
          );
        };

        /* Fired together: they are independent reads of the same string, so serialising them
           would add the whole second latency for nothing. Their SETTLEMENT is handled
           separately below — Promise.all would let the services call's rejection discard the
           NAP result, which is the one thing this split exists to prevent. */
        const [napSettled, svcSettled] = await Promise.allSettled([
          callOpenAi(NAP_SYSTEM_PROMPT),
          callOpenAi(SERVICES_SYSTEM_PROMPT),
        ]);

        if (napSettled.status !== "fulfilled") {
          console.error(`[scan-site-details] NAP call failed: ${String(napSettled.reason).slice(0, 300)}`);
          throw new Error("OpenAI request failed");
        }
        const res = napSettled.value;
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error(`[scan-site-details] OpenAI ${res.status}: ${errText.slice(0, 300)}`);
          throw new Error(`OpenAI ${res.status}`);
        }

        const completion = await res.json();
        let costUsd = usdOf(completion);

        /* SERVICES — best-effort by construction. A failure here logs and leaves `services`
           absent, which the mockup flow must read as "not extracted", never as "this business
           lists none". */
        let servicesRaw: unknown[] = [];
        if (svcSettled.status === "fulfilled" && svcSettled.value.ok) {
          try {
            const sc = await svcSettled.value.json();
            costUsd += usdOf(sc);
            const p = JSON.parse(sc?.choices?.[0]?.message?.content ?? "{}");
            if (Array.isArray(p?.services)) servicesRaw = p.services;
          } catch (e) {
            console.error(`[scan-site-details] services parse failed: ${(e as Error).message}`);
          }
        } else {
          const why = svcSettled.status === "fulfilled"
            ? `HTTP ${svcSettled.value.status}`
            : String(svcSettled.reason).slice(0, 200);
          console.error(`[scan-site-details] services call failed (${why}) — NAP unaffected`);
        }

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

          /* AREAS — place names only, deduped case-insensitively, bounded. Anything phrase-shaped
             ("and surrounding areas", a county catch-all) is dropped here as well as in the prompt:
             the operator field weaves these in verbatim, so a phrase would read as a place. */
          const rawAreas = Array.isArray(parsed?.areas) ? parsed.areas : [];
          const seenArea = new Set<string>();
          const areas: string[] = [];
          for (const a of rawAreas) {
            const t = typeof a === "string" ? a.trim().replace(/\s+/g, " ") : "";
            if (!t || t.length > 40 || /[<>]/.test(t)) continue;
            if (/\b(?:surrounding|areas?|nearby|county|shire|midlands|region|beyond|more)\b/i.test(t)) continue;
            if (isCountyOrRegion(t)) continue;   // Cheshire, Merseyside, Kent … not a town
            const k = t.toLowerCase();
            if (seenArea.has(k)) continue;
            seenArea.add(k);
            areas.push(t);
            /* Was a hardcoded 12. Now the caller's cap, defaulting to 12 — so the existing
               caller is unchanged and the mockup flow can ask for the whole list. */
            if (areas.length >= maxAreas) break;
          }
          if (areas.length) details.areas = areas;

          /* SERVICES — same discipline as areas: bounded, deduped case-insensitively on the
             name, and every field trimmed. A nameless entry is dropped rather than kept with
             a blank label. `price` and `description` are only ever passed through.
             ⛔ SOURCED FROM THE SECOND CALL (`servicesRaw`), NOT from `parsed`. The NAP prompt
             is v4's byte-for-byte and does not ask for services at all, so reading
             parsed.services here would silently always be []. */
          const rawServices = servicesRaw;
          const seenSvc = new Set<string>();
          const services: ScannedService[] = [];
          for (const s of rawServices) {
            const name = pick((s as Record<string, unknown>)?.name, 120);
            if (!name) continue;
            const k = name.toLowerCase();
            if (seenSvc.has(k)) continue;
            seenSvc.add(k);
            const price = pick((s as Record<string, unknown>)?.price, 60);
            const description = pick((s as Record<string, unknown>)?.description, 300);
            services.push({ name, ...(price ? { price } : {}), ...(description ? { description } : {}) });
            if (services.length >= 60) break;
          }
          if (services.length) details.services = services;

        } catch (e) {
          console.error("[scan-site-details] JSON parse failed:", (e as Error).message);
        }

        // Deterministic email is authoritative — override the LLM's when we harvested one.
        if (harvestedEmail) details.email = harvestedEmail;

        const found = links.length > 0 || images.length > 0 || Object.keys(details).length > 0;
        return { result: { details, links, images, source_urls: sourceUrls, found, diag }, costUsd };
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

    const result = outcome.result ?? {
      details: {}, links: [], images: [], source_urls: [], found: false,
      diag: { textChars: 0, navJunkDropped: 0, subpages: 0 },
    };
    /* ⛔ THE EXISTING KEYS KEEP THEIR EXACT NAMES AND SHAPES. The one live caller
       (PageGenerator) reads success / cached / found / details.{phone,address,email,hours,
       areas} and ignores links and source_urls — so `images`, `services` (inside details)
       and `diag` are PURELY ADDITIVE and it needs no change. Verified against the real v5
       response, not assumed. */
    return json({
      success: true,
      cached: outcome.cached,
      found: result.found,
      details: result.details,
      links: result.links,
      images: result.images,
      source_urls: result.source_urls,
      diag: result.diag,
      cost_usd: Number(outcome.costUsd.toFixed(4)),
    });
  } catch (error) {
    console.error("scan-site-details error:", error);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
