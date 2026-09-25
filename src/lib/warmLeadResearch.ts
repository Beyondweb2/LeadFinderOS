/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WARM LEAD RESEARCH — what we know about a prospect's site once they have REPLIED (2026-09-25).

   A cold prospect answered. Before Paul replies, the Inbox's "Research & draft reply" button gathers
   what LeadFinder already holds, reads the prospect's site ONCE, and saves the result as one record
   per lead (`warm_lead_research`). Every later draft in that conversation reads the saved record; it
   never re-reads the site unless Paul presses "Refresh research".

   THE ORDER, CHEAPEST FIRST (the brief's §16, and why each step exists):
     1. saved research, fresh and for the same website  → reuse it, fetch nothing;
     2. saved research, stale                            → ONE homepage fetch; unchanged text → reuse;
     3. the lead's crawl-check row (lead_crawl_checks)   → its faults/evidence are reused as findings;
     4. the lead's newest usable audit                   → the AI-visibility finding and rival names;
     5. a TARGETED fetch: the homepage + up to WARM_RESEARCH_MAX_PAGES - 1 of its own menu pages.
   ⛔ THERE IS NO FULL CRAWL HERE. The exhaustive crawl is the operator's own Crawl site button
      (crawl-check `mode: "full"`); this module never starts one and never writes lead_crawl_checks.

   ⛔ NOTHING INVENTED REACHES A PROSPECT. Findings come from three places and each is checked:
      · RULE findings are computed here from the page text and carry the text they were read from;
      · CRAWL / AUDIT findings are re-stated from rows other code already measured;
      · MODEL findings (the LLM reading the same pages) must quote the page VERBATIM — every quote is
        matched against the fetched text by `verifyQuote`, and a finding with no quote that matches is
        DROPPED, with a warning to the operator saying so. The model can add colour; it cannot add a
        fault the page does not show. `scripts/warm-lead-research.test.ts` drives a hallucinated one.

   ⛔ NEVER ASSERT HOW AN AI MODEL DECIDES (CLAUDE.md §6 WhatsApp). Every detail is WHAT I SAW → WHAT
      IT MEANS → why it MAY make AI visibility harder. "AI reads those as one page" is a claim about a
      process nobody outside those companies has observed.

   Pure and edge-reachable: relative `.ts` imports only, no fetch, no DOM, no platform globals.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { CRAWL_FRESH_MS, visibleText, detectClientRendered, usableCrawlSignals, type CrawlSignals } from './crawlCheck.ts';
import { extractCanonical, metaRobotsDirectives, directiveHasNoindex, sameRegistrableDomain, usableSiteEvidence, selectableEvidence, type SiteEvidence } from './siteEvidence.ts';
import { candidateFindings } from './siteFindings.ts';

export const WARM_RESEARCH_VERSION = 1;
/** Research younger than this, for the same website, is reused without touching the site. Same
 *  horizon as a crawl-check row (a month) — one idea of "recent" across the product. */
export const WARM_RESEARCH_FRESH_MS = CRAWL_FRESH_MS;
/** Pages read by a targeted research pass: the homepage plus its most useful menu pages. */
export const WARM_RESEARCH_MAX_PAGES = 6;
export const WARM_RESEARCH_FETCH_TIMEOUT_MS = 8_000;
/** Wall-clock budget for the whole fetch phase; a page not started by then is skipped. */
export const WARM_RESEARCH_DEADLINE_MS = 25_000;
/** Visible text kept per page, for the model and for quote verification. */
export const WARM_RESEARCH_PAGE_TEXT_CHARS = 6_000;
/** How many findings a reply may draw on. The brief: "normally choose 2–4". */
export const MAX_STRONGEST_FINDINGS = 4;
/** A finding below this strength is recorded but never offered to a reply — the trivia line. */
export const MIN_SALES_STRENGTH = 2;
/** A model quote shorter than this (after normalising) cannot be verified meaningfully. */
export const MIN_QUOTE_CHARS = 8;

export type FindingKind =
  | 'positioning_conflict' | 'hours_conflict' | 'contact_conflict' | 'missing_core_service_pages'
  | 'provider_attribution' | 'title_h1' | 'off_trade_content' | 'outdated_content' | 'weak_evidence'
  | 'thin_or_duplicate' | 'crawl_indexing' | 'structured_data' | 'ai_visibility' | 'other';
export const FINDING_KINDS: readonly FindingKind[] = [
  'positioning_conflict', 'hours_conflict', 'contact_conflict', 'missing_core_service_pages',
  'provider_attribution', 'title_h1', 'off_trade_content', 'outdated_content', 'weak_evidence',
  'thin_or_duplicate', 'crawl_indexing', 'structured_data', 'ai_visibility', 'other',
];
export type FindingCategory = 'technical' | 'content' | 'local_visibility' | 'trust' | 'ownership';
export const FINDING_CATEGORIES: readonly FindingCategory[] = ['technical', 'content', 'local_visibility', 'trust', 'ownership'];
export type FindingSource = 'rule' | 'crawl' | 'audit' | 'model';

export interface ResearchFinding {
  id: string;
  kind: FindingKind;
  category: FindingCategory;
  /** Operator-facing label, a few words. */
  title: string;
  /** Plain English: what was seen → what it means → why it may matter. */
  detail: string;
  /** Verbatim text the finding rests on (page text, a URL list, or a measured count). */
  evidence: string[];
  pageUrl: string | null;
  strength: 1 | 2 | 3 | 4 | 5;
  source: FindingSource;
  verified: boolean;
}

export type ResearchStatus = 'complete' | 'partial' | 'failed' | 'no_website';
export type Positioning = 'local' | 'regional' | 'national' | 'mixed' | 'unclear';

export interface ResearchSource {
  url: string;
  kind: 'page' | 'crawl_check' | 'audit';
  status: number | null;
  ok: boolean;
  at: string | null;
}

export interface WarmLeadResearch {
  version: number;
  generatedAt: string;
  website: string | null;
  /** When the SITE was last actually read — this pass, or the crawl row it reused. */
  sourceCrawlAt: string | null;
  status: ResearchStatus;
  businessSummary: string | null;
  locationSignals: { homeTown: string | null; serviceAreas: string[]; positioning: Positioning; quotes: string[] };
  services: string[];
  strongestFindings: ResearchFinding[];
  technicalFindings: ResearchFinding[];
  contentFindings: ResearchFinding[];
  localVisibilityFindings: ResearchFinding[];
  /** Why we might ask "do you own/control the site?" — empty means there is no reason to ask. */
  ownershipClues: string[];
  providerClues: string[];
  usefulQuestions: string[];
  /** For the OPERATOR only: what was incomplete, dropped, or could not be checked. */
  warnings: string[];
  sources: ResearchSource[];
  /** True when the site was read and nothing technical of substance was found — the reply should
   *  then say so honestly and lean on AI visibility / content, never invent a fault. */
  technicallyClean: boolean;
  contentHash: string | null;
  timings: { researchMs: number; fetchMs: number; analyseMs: number | null };
}

/* ─────────────────────────────── freshness and the plan ─────────────────────────────── */

export interface StoredResearchRow {
  research: WarmLeadResearch | null;
  generated_at: string | null;
  website: string | null;
  research_status: string | null;
  /** Set when a stale record was re-checked against the live homepage and found unchanged. */
  revalidated_at?: string | null;
}

/** Compare two website addresses the way a person would: scheme, `www.` and a trailing slash are
 *  noise. Unparseable → the trimmed lowercase string. */
export function normaliseWebsite(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

export type ResearchFreshness = 'none' | 'fresh' | 'stale' | 'website_changed' | 'failed';

/** What the saved research is worth right now. The Inbox button reads this: `fresh` → "Draft reply"
 *  (with Refresh research beside it); anything else → "Research & draft reply". */
export function researchFreshness(row: StoredResearchRow | null | undefined, leadWebsite: string | null | undefined, nowMs: number): ResearchFreshness {
  if (!row?.research || !row.generated_at) return 'none';
  if (row.research.version !== WARM_RESEARCH_VERSION) return 'stale';
  if (row.research_status === 'failed') return 'failed';
  if (normaliseWebsite(row.website) !== normaliseWebsite(leadWebsite)) return 'website_changed';
  const at = Math.max(new Date(row.generated_at).getTime(), row.revalidated_at ? new Date(row.revalidated_at).getTime() : 0);
  if (!Number.isFinite(at)) return 'stale';
  return nowMs - at < WARM_RESEARCH_FRESH_MS ? 'fresh' : 'stale';
}

export type ResearchPlan =
  | { action: 'reuse' }
  | { action: 'revalidate' }
  | { action: 'research'; reason: 'none' | 'refresh' | 'website_changed' | 'failed_before' | 'version' }
  | { action: 'no_website' };

/**
 * The one decision about whether to read the site. `refresh` is Paul pressing "Refresh research" —
 * the ONLY way fresh research is re-read. A draft or a regenerate never reaches this: the draft
 * action reads the saved row and has no fetch path at all.
 */
export function planResearch(input: { row: StoredResearchRow | null | undefined; leadWebsite: string | null | undefined; refresh: boolean; nowMs: number }): ResearchPlan {
  if (!normaliseWebsite(input.leadWebsite)) return { action: 'no_website' };
  if (input.refresh) return { action: 'research', reason: 'refresh' };
  const f = researchFreshness(input.row, input.leadWebsite, input.nowMs);
  if (f === 'fresh') return { action: 'reuse' };
  if (f === 'none') return { action: 'research', reason: 'none' };
  if (f === 'website_changed') return { action: 'research', reason: 'website_changed' };
  if (f === 'failed') return { action: 'research', reason: 'failed_before' };
  if (input.row?.research?.version !== WARM_RESEARCH_VERSION) return { action: 'research', reason: 'version' };
  return { action: 'revalidate' };
}

/** Stable hash of a page's visible text (FNV-1a, 32-bit, hex). Stale research is reused when the
 *  homepage hashes the same — "the website has not materially changed". */
export function contentHash(text: string): string {
  const s = normaliseForMatch(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* ─────────────────────────────── reading one page ─────────────────────────────── */

/** Lowercase, entity-decoded, punctuation to spaces, whitespace collapsed. Used on BOTH sides of a
 *  quote check, so "Heating &amp; Plumbing" and "Heating & Plumbing" and "heating plumbing" meet. */
export function normaliseForMatch(s: string): string {
  return decodeEntities(s)
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9£]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeEntities(s: string): string {
  return (s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { const n = parseInt(h, 16); return n < 0xe000 || n > 0xf8ff ? String.fromCharCode(n) : ' '; })
    .replace(/&#(\d+);/g, (_, d) => { const n = Number(d); return n < 0xe000 || n > 0xf8ff ? String.fromCharCode(n) : ' '; });
}

const tagText = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export interface PageFacts {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  title: string | null;
  h1s: string[];
  metaDescription: string | null;
  /** Visible text, entity-decoded, capped at WARM_RESEARCH_PAGE_TEXT_CHARS. */
  text: string;
  /** Internal page links (absolute, no query/hash), in document order. */
  links: string[];
  jsonLdTypes: string[];
  noindex: boolean;
  canonical: string | null;
  clientRendered: boolean;
  wordCount: number;
}

const ASSET_PATH = /\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|xml|ico|mp4|mp3|woff2?|ttf|php)$/i;
const NON_PAGE_PATH = /\/(?:wp-admin|wp-json|wp-content|wp-includes|feed|comments|tag|category|author|cart|checkout|account|my-account|login|logout)(?:\/|$)|\/page\/\d+/i;

export function extractPageFacts(html: string, url: string, finalUrl: string, status: number, ok: boolean): PageFacts {
  const title = (() => { const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? tagText(m[1]) || null : null; })();
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => tagText(m[1])).filter(Boolean).slice(0, 5);
  const metaDescription = (() => {
    const m = html.match(/<meta[^>]+name=["']description["'][^>]*>/i);
    const c = m?.[0].match(/content=["']([^"']*)["']/i);
    return c ? decodeEntities(c[1]).trim() || null : null;
  })();
  const text = decodeEntities(visibleText(html)).replace(/\s+/g, ' ').trim().slice(0, WARM_RESEARCH_PAGE_TEXT_CHARS);
  let origin = '';
  try { origin = new URL(finalUrl || url).origin; } catch { /* no links from an unparseable URL */ }
  const seen = new Set<string>();
  const links: string[] = [];
  if (origin) {
    for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["']/gi)) {
      try {
        const u = new URL(decodeEntities(m[1]), origin);
        if (!sameRegistrableDomain(u.href, origin) || !/^https?:$/.test(u.protocol)) continue;
        if (ASSET_PATH.test(u.pathname) || NON_PAGE_PATH.test(u.pathname)) continue;
        u.hash = ''; u.search = '';
        const href = u.href.replace(/\/$/, '');
        if (href === origin || seen.has(href)) continue;
        seen.add(href);
        links.push(href);
      } catch { /* malformed href */ }
    }
  }
  const jsonLdTypes: string[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1].matchAll(/"@type"\s*:\s*(?:"([^"]+)"|\[([^\]]*)\])/g)) {
      const vals = t[1] ? [t[1]] : (t[2] ?? '').split(',').map((x) => x.replace(/["\s]/g, ''));
      for (const v of vals) if (v && !jsonLdTypes.includes(v)) jsonLdTypes.push(v);
    }
  }
  // metaRobotsDirectives returns the whole tag (for evidence); the directive is its content.
  const noindex = metaRobotsDirectives(html).some((d) => directiveHasNoindex(/content="([^"]*)"/i.exec(d)?.[1] ?? ''));
  const canonical = extractCanonical(html, finalUrl || url);
  const cr = detectClientRendered(html);
  const wordCount = text ? text.split(/\s+/).length : 0;
  return { url, finalUrl: finalUrl || url, status, ok, title, h1s, metaDescription, text, links, jsonLdTypes, noindex, canonical, clientRendered: !!cr.flagged, wordCount };
}

/** Which of the homepage's own links a targeted pass reads: contact/about/service/location first,
 *  then whatever else the menu offers, up to `limit`. */
export function pickResearchPages(home: PageFacts, limit = WARM_RESEARCH_MAX_PAGES - 1): string[] {
  const score = (u: string) => {
    const p = u.toLowerCase();
    if (/contact/.test(p)) return 5;
    if (/about|who-we-are|our-story/.test(p)) return 4;
    if (/service|repair|install|emergenc|boiler|plumb|electric|lock|roof|heating/.test(p)) return 3;
    if (/area|location|cover|near/.test(p)) return 2;
    if (/review|testimonial|accredit|gallery|project/.test(p)) return 2;
    if (/privacy|cookie|terms|policy|sitemap|basket/.test(p)) return -1;
    return 1;
  };
  return home.links
    .map((u, i) => ({ u, s: score(u), i }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, Math.max(0, limit))
    .map((x) => x.u);
}

/* ─────────────────────────────── rule findings ─────────────────────────────── */

/** The sentence around a match, from the text itself (so it always verifies). */
export function sentenceAround(text: string, index: number, length: number): string {
  const head = text.slice(Math.max(0, index - 90), index);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  let start = index - head.length + (stop >= 0 ? stop + 2 : 0);
  if (stop < 0) {
    // No sentence start in reach (menus run into body text): begin a few words back.
    const from = Math.max(0, index - 45);
    const sp = text.indexOf(' ', from);
    start = from === 0 ? 0 : (sp >= 0 && sp < index ? sp + 1 : index);
  }
  const tail = text.slice(index + length, index + length + 120);
  const m = tail.match(/[.!?](?=\s|$)/);
  let end = index + length + (m && m.index !== undefined ? m.index + 1 : tail.length);
  if (!m) { const sp = text.lastIndexOf(' ', end); if (sp > index + length) end = sp; }
  return text.slice(start, end).trim();
}

const NATIONAL_RE = /\b(nationwide|nation-wide|across (?:the )?(?:uk|england|britain|great britain|the country)|throughout (?:the )?(?:uk|england|britain)|all over (?:the )?(?:uk|england|country)|uk[- ]wide|anywhere in the uk)\b/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function positioningFinding(pages: PageFacts[], town: string | null | undefined): ResearchFinding | null {
  const t = (town ?? '').trim();
  if (!t) return null;
  const townRe = new RegExp(`\\b${escapeRe(t)}\\b`, 'i');
  let national: { q: string; url: string } | null = null;
  let local: { q: string; url: string } | null = null;
  for (const p of pages) {
    if (!p.ok || !p.text) continue;
    const n = p.text.match(NATIONAL_RE);
    if (n && n.index !== undefined && !national) national = { q: sentenceAround(p.text, n.index, n[0].length), url: p.finalUrl };
    // Prefer a sentence that CLAIMS the town as a base ("Scunthorpe-based", "based in Scunthorpe").
    const based = p.text.match(new RegExp(`\\b${escapeRe(t)}[- ]based\\b|\\bbased in ${escapeRe(t)}\\b`, 'i'));
    const any = based ?? p.text.match(townRe);
    if (any && any.index !== undefined && (!local || based)) local = { q: sentenceAround(p.text, any.index, any[0].length), url: p.finalUrl };
  }
  if (!national || !local) return null;
  return {
    id: 'rule:positioning_conflict',
    kind: 'positioning_conflict',
    category: 'local_visibility',
    title: 'Local vs nationwide positioning',
    detail: `The site describes the business as covering the whole country in one place and as ${t}-based in another. Mixed signals about where a business works can make it harder for AI tools to connect it clearly with ${t}.`,
    evidence: [national.q, local.q],
    pageUrl: national.url,
    strength: 4,
    source: 'rule',
    verified: true,
  };
}

const TIME = '\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)';
const HOURS_RANGE_RE = new RegExp(`\\b(${TIME})\\s*(?:-|–|—|to|until)\\s*(${TIME})`, 'gi');
const OPEN_24_RE = /\bopen\s+(?:24\s*hours|24\s*\/\s*7|24-7|all day|round the clock)\b/gi;
const normTime = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[:.]00/, '');

export function hoursFinding(pages: PageFacts[]): ResearchFinding | null {
  const statements = new Map<string, { q: string; url: string; degenerate: boolean }>();
  let open24: { q: string; url: string } | null = null;
  for (const p of pages) {
    if (!p.ok || !p.text) continue;
    for (const m of p.text.matchAll(HOURS_RANGE_RE)) {
      const a = normTime(m[1]); const b = normTime(m[2]);
      const key = `${a}-${b}`;
      if (!statements.has(key)) statements.set(key, { q: m[0].trim(), url: p.finalUrl, degenerate: a === b });
    }
    const o = p.text.match(OPEN_24_RE);
    if (o && !open24) open24 = { q: o[0].trim(), url: p.finalUrl };
  }
  const list = [...statements.values()];
  const conflict = list.length >= 2 || list.some((s) => s.degenerate) || (open24 !== null && list.length >= 1);
  if (!conflict) return null;
  const evidence = [...list.map((s) => s.q), ...(open24 ? [open24.q] : [])].slice(0, 4);
  return {
    id: 'rule:hours_conflict',
    kind: 'hours_conflict',
    category: 'trust',
    title: 'Opening hours don’t agree',
    detail: `The site gives different opening hours in different places (${evidence.map((e) => `“${e}”`).join(', ')}). When basic details disagree, anything reading the site — a customer or an AI tool — has less to go on about when you are actually available.`,
    evidence,
    pageUrl: list[0]?.url ?? open24?.url ?? null,
    strength: 3,
    source: 'rule',
    verified: true,
  };
}

const UK_PHONE_RE = /(?:\+44\s?\(?0?\)?\s?|\b0)(?:\d[\s-]?){9,10}\d?\b/g;
const normPhone = (s: string) => { const d = s.replace(/\D/g, ''); return d.startsWith('44') ? `0${d.slice(2).replace(/^0/, '')}` : d; };

export function contactFinding(pages: PageFacts[]): ResearchFinding | null {
  const found = new Map<string, { q: string; url: string }>();
  for (const p of pages) {
    if (!p.ok || !p.text) continue;
    for (const m of p.text.matchAll(UK_PHONE_RE)) {
      const n = normPhone(m[0]);
      if (n.length < 10 || n.length > 11) continue;
      if (!found.has(n)) found.set(n, { q: m[0].trim(), url: p.finalUrl });
    }
  }
  // Two numbers (a landline and a mobile) is normal. Three or more is where it starts to confuse.
  if (found.size < 3) return null;
  const list = [...found.values()];
  return {
    id: 'rule:contact_conflict',
    kind: 'contact_conflict',
    category: 'trust',
    title: 'Several different phone numbers',
    detail: `The site lists ${found.size} different phone numbers. Inconsistent contact details are one of the things that can make a business harder to pin down as one clear entity.`,
    evidence: list.slice(0, 4).map((x) => x.q),
    pageUrl: list[0].url,
    strength: 2,
    source: 'rule',
    verified: true,
  };
}

/** The core services a trade is normally searched for, matched against the site's own page
 *  ADDRESSES. Only trades listed here are judged; an unlisted trade is never flagged. */
export const CORE_SERVICE_TRADES: ReadonlyArray<{ trade: RegExp; describe: string; terms: RegExp[] }> = [
  { trade: /plumb|heating|boiler|gas engineer/i, describe: 'plumbing, boiler repair or installation, or emergency call-outs',
    terms: [/plumb/, /boiler-?(?:repair|install|servic|replace|fit)|new-?boiler|combi/, /emergenc/, /central-?heating|heating-?(?:repair|servic|install|engineer)/, /leak|drain|bathroom/] },
  { trade: /electric/i, describe: 'electrical work such as rewiring, fuse boards, testing or emergency call-outs',
    terms: [/electric/, /rewir/, /fuse|consumer-?unit/, /eicr|inspection|testing/, /emergenc/, /ev-?charg/] },
  { trade: /locksmith/i, describe: 'lock changes, lockouts or emergency call-outs',
    terms: [/lock/, /emergenc|lockout|locked-?out/, /upvc|door/, /safe/] },
  { trade: /roof/i, describe: 'roof repairs, flat roofs, guttering or chimney work',
    terms: [/roof/, /repair/, /gutter|fascia|soffit/, /chimney/] },
];

export function coreServiceFinding(home: PageFacts | null, trade: string | null | undefined): ResearchFinding | null {
  const t = (trade ?? '').trim();
  if (!home?.ok || !t) return null;
  const entry = CORE_SERVICE_TRADES.find((e) => e.trade.test(t));
  if (!entry) return null;
  const paths = home.links.map((u) => { try { return new URL(u).pathname.toLowerCase(); } catch { return ''; } }).filter((p) => p && p !== '/');
  if (paths.length < 3) return null; // too few pages to judge the structure
  const hit = entry.terms.some((re) => paths.some((p) => re.test(p)));
  if (hit) return null;
  const listed = paths.slice(0, 10);
  return {
    id: 'rule:missing_core_service_pages',
    kind: 'missing_core_service_pages',
    category: 'content',
    title: 'No pages for the core services',
    detail: `None of the pages linked from the homepage is about ${entry.describe}. The menu is about other things. Without a page for each main service, there is less on the site that clearly says what you do and where — which can make it harder for AI tools to match you to those searches.`,
    evidence: listed,
    pageUrl: home.finalUrl,
    strength: 3,
    source: 'rule',
    verified: true,
  };
}

/** Footer credits: "Website designed and hosted by X", "Site built by X". */
const CREDIT_RE = /\b(?:web\s*site|site|web\s*design|web)\s+(?:(?:designed|built|created|developed|hosted|managed|maintained)(?:\s*(?:&|and|,)\s*)?){1,3}\s*by\s+([A-Za-z0-9][\w&'.\-]*(?:\s+[A-Za-z0-9&][\w&'.\-]*){0,5})/i;
const CREDIT_STOP = /^(get|call|contact|menu|home|request|fill|privacy|terms|cookie|all|copyright|follow|site|phone|email)$/i;
const COMPANY_SUFFIX = /^(ltd|limited|llp|plc|ltd\.|inc)$/i;

export interface ProviderCredit { name: string; hosted: boolean; quote: string; url: string }

export function providerCredit(pages: PageFacts[], businessName: string | null | undefined, crawlCredit?: string | null): ProviderCredit | null {
  const own = normaliseForMatch(businessName ?? '');
  for (const p of pages) {
    if (!p.ok || !p.text) continue;
    const m = p.text.match(CREDIT_RE);
    if (!m || m.index === undefined) continue;
    const tokens = m[1].split(/\s+/);
    const name: string[] = [];
    for (const tok of tokens) {
      if (CREDIT_STOP.test(tok)) break;
      name.push(tok);
      if (COMPANY_SUFFIX.test(tok)) break;
    }
    const nm = name.join(' ').replace(/[|,.;:]+$/, '').trim();
    if (!nm || (own && normaliseForMatch(nm) === own)) continue;
    const quote = p.text.slice(m.index, m.index + m[0].length - m[1].length + nm.length).trim();
    return { name: nm, hosted: /hosted|managed|maintained/i.test(m[0]), quote, url: p.finalUrl };
  }
  const c = (crawlCredit ?? '').trim();
  if (c && (!own || normaliseForMatch(c) !== own)) return { name: c, hosted: false, quote: c, url: '' };
  return null;
}

export function providerFinding(credit: ProviderCredit | null): ResearchFinding | null {
  if (!credit) return null;
  return {
    id: 'rule:provider_attribution',
    kind: 'provider_attribution',
    category: 'ownership',
    title: credit.hosted ? 'Site built and hosted by another company' : 'Site built by another company',
    detail: `The site credits ${credit.name}${credit.hosted ? ' for building and hosting it' : ' for building it'}. That can mean they control changes to it, so it is worth knowing who owns and controls the site before anything is changed.`,
    evidence: [credit.quote],
    pageUrl: credit.url || null,
    strength: 3,
    source: 'rule',
    verified: true,
  };
}

export function titleFinding(home: PageFacts | null, trade: string | null | undefined, town: string | null | undefined): ResearchFinding | null {
  if (!home?.ok) return null;
  const tradeEntry = CORE_SERVICE_TRADES.find((e) => e.trade.test(trade ?? ''));
  const stem = normaliseForMatch(trade ?? '').split(' ')[0]?.replace(/s$/, '').slice(0, 6) ?? '';
  const says = (s: string | null | undefined, what: 'trade' | 'town') => {
    const n = normaliseForMatch(s ?? '');
    if (!n) return false;
    if (what === 'town') return !!town && n.includes(normaliseForMatch(town));
    return (stem.length >= 4 && n.includes(stem)) || (!!tradeEntry && tradeEntry.trade.test(n));
  };
  const titleTrade = says(home.title, 'trade');
  const titleTown = says(home.title, 'town');
  const h1 = home.h1s[0] ?? null;
  if (home.title && (titleTrade || titleTown)) return null;
  const evidence = [home.title ? `Title: ${home.title}` : 'No page title', h1 ? `Main heading: ${h1}` : 'No main heading (H1)'];
  return {
    id: 'rule:title_h1',
    kind: 'title_h1',
    category: 'technical',
    title: 'Homepage title doesn’t say what or where',
    detail: home.title
      ? `The homepage title is “${home.title}” — it doesn’t mention the trade or ${town ? town : 'the town'}. The title is one of the first things any search tool reads about a page, so it gives less to work with.`
      : `The homepage has no title at all. The title is one of the first things any search tool reads about a page.`,
    evidence,
    pageUrl: home.finalUrl,
    strength: 2,
    source: 'rule',
    verified: true,
  };
}

export function indexingFindings(pages: PageFacts[]): ResearchFinding[] {
  const out: ResearchFinding[] = [];
  const home = pages[0];
  if (home?.ok && home.noindex) {
    out.push({ id: 'rule:noindex', kind: 'crawl_indexing', category: 'technical', title: 'Homepage tells search engines not to list it',
      detail: 'The homepage carries a "noindex" instruction, which asks search engines not to list it. That is a genuine technical fault and can stop the page being found at all.',
      evidence: ['meta robots: noindex'], pageUrl: home.finalUrl, strength: 5, source: 'rule', verified: true });
  }
  if (home?.ok && home.canonical && !sameRegistrableDomain(home.canonical, home.finalUrl)) {
    out.push({ id: 'rule:canonical_offsite', kind: 'crawl_indexing', category: 'technical', title: 'Homepage points search engines at another site',
      detail: `The homepage says its "real" address is ${home.canonical}, a different website. Anything following that signal is sent to the other site instead of this one.`,
      evidence: [`canonical: ${home.canonical}`], pageUrl: home.finalUrl, strength: 4, source: 'rule', verified: true });
  }
  if (home?.ok && home.clientRendered) {
    out.push({ id: 'rule:client_rendered', kind: 'crawl_indexing', category: 'technical', title: 'Homepage is nearly empty without JavaScript',
      detail: 'The homepage shows almost no text until JavaScript runs. Tools that read the page without running it see very little, which can make it harder for them to understand the business.',
      evidence: [`${home.wordCount} words readable without JavaScript`], pageUrl: home.finalUrl, strength: 4, source: 'rule', verified: true });
  }
  return out;
}

export function outdatedFinding(pages: PageFacts[], nowYear: number): ResearchFinding | null {
  for (const p of pages) {
    if (!p.ok || !p.text) continue;
    const m = p.text.match(/(?:©|copyright)\s*(?:-\s*)?((?:19|20)\d{2})|((?:19|20)\d{2})\s*©/i);
    const year = m ? Number(m[1] ?? m[2]) : NaN;
    if (Number.isFinite(year) && year <= nowYear - 2) {
      return { id: 'rule:outdated', kind: 'outdated_content', category: 'content', title: 'Copyright year is out of date',
        detail: `The footer still says ${year}. Minor on its own, but it can make a site look unattended.`,
        evidence: [m![0].trim()], pageUrl: p.finalUrl, strength: 1, source: 'rule', verified: true };
    }
  }
  return null;
}

export function structuredDataFinding(home: PageFacts | null): ResearchFinding | null {
  if (!home?.ok || home.jsonLdTypes.length) return null;
  return { id: 'rule:no_structured_data', kind: 'structured_data', category: 'technical', title: 'No structured business data',
    detail: 'The homepage has no structured data describing the business. A minor technical point on its own.',
    evidence: ['no application/ld+json on the homepage'], pageUrl: home.finalUrl, strength: 1, source: 'rule', verified: true };
}

/* ─────────────────────────────── crawl + audit, reused ─────────────────────────────── */

export interface CrawlRowInput {
  created_at: string | null;
  result: { version?: number; status?: string; signals?: CrawlSignals; siteInfo?: { builtBy?: { credit?: string | null } | null; services?: string[]; towns?: string[]; openingHours?: string[] | null } | null; evidence?: SiteEvidence | null; evidenceVersion?: number } | null;
}

/** Findings the crawl-check row already measured — reused, never re-measured. Stale rows (older
 *  than the crawl freshness horizon) are ignored by the same helpers every other screen uses. */
/* ⛔ THE CRAWL'S WORDS COME FROM siteFindings.ts, NOT FROM buildFaultLines. The report's fault lines
   predate the "never assert how AI decides" rule ("AI reads them as one", "AI doesn't run
   JavaScript") and are report copy. `candidateFindings` is the hedged, WhatsApp-safe rewrite of the
   SAME signals, under the same freshness gate — so a reply can never quote an absolute claim. */
const CRAWL_KIND: Record<string, { kind: FindingKind; strength: ResearchFinding['strength']; title: string }> = {
  crawler_blocked: { kind: 'crawl_indexing', strength: 5, title: 'AI search crawlers are blocked' },
  unreadable_homepage: { kind: 'crawl_indexing', strength: 4, title: 'Homepage is nearly empty without JavaScript' },
  duplicate_pages: { kind: 'thin_or_duplicate', strength: 3, title: 'Many near-identical pages' },
  thin_pages: { kind: 'thin_or_duplicate', strength: 3, title: 'Pages with very little on them' },
};

export function crawlFindings(row: CrawlRowInput | null | undefined, nowMs: number): { findings: ResearchFinding[]; usedAt: string | null; credit: string | null } {
  if (!row?.result || !row.created_at) return { findings: [], usedAt: null, credit: null };
  const createdAtMs = new Date(row.created_at).getTime();
  const fresh = Number.isFinite(createdAtMs) && nowMs - createdAtMs < CRAWL_FRESH_MS;
  const credit = row.result.siteInfo?.builtBy?.credit ?? null;
  if (!fresh) return { findings: [], usedAt: null, credit };
  const signals = usableCrawlSignals(row.result as { version?: number; signals?: CrawlSignals }, createdAtMs);
  const evidence = selectableEvidence(usableSiteEvidence(row.result, createdAtMs, CRAWL_FRESH_MS));
  const out: ResearchFinding[] = [];
  if (signals) {
    candidateFindings(signals, evidence).forEach((f, i) => {
      const meta = CRAWL_KIND[f.kind] ?? { kind: 'crawl_indexing' as FindingKind, strength: 4 as const, title: f.kind.replace(/_/g, ' ') };
      const clause = f.clause.charAt(0).toUpperCase() + f.clause.slice(1);
      out.push({ id: `crawl:${f.kind}:${i}`, kind: meta.kind, category: 'technical', title: meta.title,
        detail: `${clause}. ${f.rest}`, evidence: [`crawl check ${row.created_at}: ${f.kind}`], pageUrl: signals.homeUrl ?? null,
        strength: meta.strength, source: 'crawl', verified: true });
    });
  }
  return { findings: out, usedAt: row.created_at, credit };
}

export interface AuditContext {
  auditId: string | null;
  reportUrl: string | null;
  createdAt: string | null;
  trade: string | null;
  town: string | null;
  competitors: string[];
  /** The quick check named the business on every engine it tried — no absence to talk about. */
  namedEverywhere: boolean;
  namedDatapoints: number | null;
  totalDatapoints: number | null;
  /** Why no audit context is available, for the operator. */
  unavailableReason: string | null;
}

export function auditFinding(a: AuditContext | null | undefined): ResearchFinding | null {
  if (!a || a.namedEverywhere) return null;
  const named = a.namedDatapoints; const total = a.totalDatapoints;
  if (named == null || total == null || total <= 0) return null;
  const share = named / total;
  if (share >= 0.67) return null;
  const rivals = a.competitors.slice(0, 3);
  const rivalText = rivals.length ? ` The businesses that came up instead included ${rivals.join(', ')}.` : '';
  return {
    id: 'audit:ai_visibility',
    kind: 'ai_visibility',
    category: 'local_visibility',
    title: 'Low AI visibility in our check',
    detail: `When we asked AI tools for a ${a.trade ?? 'business like yours'}${a.town ? ` in ${a.town}` : ''}, the business was named in ${named} of ${total} answers.${rivalText}`,
    evidence: [`named ${named} of ${total}`, ...rivals],
    pageUrl: a.reportUrl,
    strength: share < 0.34 ? 4 : 3,
    source: 'audit',
    verified: true,
  };
}

/* ─────────────────────────────── model findings, verified ─────────────────────────────── */

export interface ModelResearchOutput {
  business_summary?: unknown;
  services?: unknown;
  home_town?: unknown;
  service_areas?: unknown;
  positioning?: unknown;
  findings?: unknown;
  ownership_clues?: unknown;
  useful_questions?: unknown;
  warnings?: unknown;
}

const str = (v: unknown, max = 400): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const strList = (v: unknown, max = 12, each = 200): string[] => (Array.isArray(v) ? v.map((x) => str(x, each)).filter((x): x is string => !!x).slice(0, max) : []);

/** True when `quote` (normalised) appears in `corpus` (normalised). Short quotes never verify. */
export function verifyQuote(quote: string, normalisedCorpus: string): boolean {
  const q = normaliseForMatch(quote);
  if (q.length < MIN_QUOTE_CHARS) return false;
  return normalisedCorpus.includes(q);
}

/** Turn the model's findings into ResearchFindings, keeping ONLY those with at least one quote that
 *  appears in the page text. Returns the dropped titles so the operator is told. */
export function verifyModelFindings(raw: unknown, pages: PageFacts[]): { kept: ResearchFinding[]; dropped: string[] } {
  const list = Array.isArray(raw) ? raw.slice(0, 12) : [];
  const corpora = pages.filter((p) => p.ok).map((p) => ({ url: p.finalUrl, n: normaliseForMatch(`${p.title ?? ''} ${p.h1s.join(' ')} ${p.text}`) }));
  const all = corpora.map((c) => c.n).join(' | ');
  const kept: ResearchFinding[] = [];
  const dropped: string[] = [];
  list.forEach((f, i) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const title = str(o.title, 120) ?? 'Untitled finding';
    const detail = str(o.detail, 600);
    const kind = FINDING_KINDS.includes(o.kind as FindingKind) ? (o.kind as FindingKind) : 'other';
    const category = FINDING_CATEGORIES.includes(o.category as FindingCategory) ? (o.category as FindingCategory) : 'content';
    const quotes = strList(o.evidence_quotes, 4, 300).filter((q) => verifyQuote(q, all));
    if (!detail || quotes.length === 0 || kind === 'ai_visibility') { dropped.push(title); return; }
    const where = corpora.find((c) => c.n.includes(normaliseForMatch(quotes[0])))?.url ?? null;
    const s = Math.round(Number(o.strength));
    // The model may not outrank what we measured ourselves: its ceiling is 4.
    const strength = (Number.isFinite(s) ? Math.min(4, Math.max(1, s)) : 2) as ResearchFinding['strength'];
    kept.push({ id: `model:${i}`, kind, category, title, detail, evidence: quotes, pageUrl: where, strength, source: 'model', verified: true });
  });
  return { kept, dropped };
}

/* ─────────────────────────────── assembling the record ─────────────────────────────── */

const SOURCE_RANK: Record<FindingSource, number> = { rule: 0, crawl: 1, audit: 2, model: 3 };

/** Rank for the sales conversation: strength first, then what we measured ourselves over what the
 *  model read, one finding per kind, trivia (below MIN_SALES_STRENGTH) never. */
export function rankStrongest(findings: ResearchFinding[], max = MAX_STRONGEST_FINDINGS): ResearchFinding[] {
  const seen = new Set<string>();
  return [...findings]
    .filter((f) => f.verified && f.strength >= MIN_SALES_STRENGTH)
    .sort((a, b) => b.strength - a.strength || SOURCE_RANK[a.source] - SOURCE_RANK[b.source])
    .filter((f) => { const k = f.kind === 'other' ? f.id : f.kind; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, max);
}

/** Rule, crawl and audit findings win their kind; the model only adds kinds nobody measured. */
export function mergeFindings(measured: ResearchFinding[], model: ResearchFinding[]): ResearchFinding[] {
  const covered = new Set(measured.map((f) => f.kind));
  return [...measured, ...model.filter((f) => f.kind === 'other' || !covered.has(f.kind))];
}

export interface AssembleInput {
  nowIso: string;
  website: string | null;
  businessName: string | null;
  trade: string | null;
  town: string | null;
  pages: PageFacts[];
  crawl: CrawlRowInput | null;
  audit: AuditContext | null;
  model: ModelResearchOutput | null;
  modelError: string | null;
  fetchMs: number;
  analyseMs: number | null;
  researchMs: number;
  nowYear: number;
}

/** Build the saved record from everything gathered. Pure: the edge function does the fetching and
 *  the model call; every judgement is made here, where it can be tested. */
export function assembleResearch(i: AssembleInput): WarmLeadResearch {
  const nowMs = new Date(i.nowIso).getTime();
  const warnings: string[] = [];
  const home = i.pages[0] ?? null;
  const siteRead = !!home?.ok;
  const crawl = crawlFindings(i.crawl, nowMs);

  const rules: ResearchFinding[] = [];
  if (siteRead) {
    const credit = providerCredit(i.pages, i.businessName, crawl.credit);
    for (const f of [
      ...indexingFindings(i.pages),
      positioningFinding(i.pages, i.town),
      hoursFinding(i.pages),
      coreServiceFinding(home, i.trade),
      providerFinding(credit),
      titleFinding(home, i.trade, i.town),
      contactFinding(i.pages),
      outdatedFinding(i.pages, i.nowYear),
      structuredDataFinding(home),
    ]) if (f) rules.push(f);
  } else if (i.website) {
    warnings.push('The website could not be read this time, so no site findings were checked. Nothing about the site should be claimed to the prospect.');
    const credit = providerCredit([], i.businessName, crawl.credit);
    const pf = providerFinding(credit);
    if (pf) rules.push(pf);
  }
  const failedPages = i.pages.slice(1).filter((p) => !p.ok).length;
  if (siteRead && failedPages) warnings.push(`${failedPages} of ${i.pages.length - 1} inner pages could not be read.`);

  const audit = auditFinding(i.audit);
  if (i.audit?.unavailableReason) warnings.push(`Audit: ${i.audit.unavailableReason}`);
  if (i.audit?.namedEverywhere) warnings.push('The audit named this business on every engine it tried — do not tell them AI is missing them.');

  let modelKept: ResearchFinding[] = [];
  if (i.model && siteRead) {
    const v = verifyModelFindings(i.model.findings, i.pages);
    modelKept = v.kept;
    for (const d of v.dropped) warnings.push(`Dropped a finding the page text did not support: "${d}".`);
  }
  if (i.modelError) warnings.push(`Site analysis was incomplete (${i.modelError}); only findings measured by rule are included.`);

  const measured = [...rules, ...crawl.findings, ...(audit ? [audit] : [])];
  const all = mergeFindings(measured, modelKept);
  const strongest = rankStrongest(all);
  const by = (c: FindingCategory | FindingCategory[]) => all.filter((f) => (Array.isArray(c) ? c : [c]).includes(f.category));
  const technical = by('technical');
  const technicallyClean = siteRead && !technical.some((f) => f.strength >= 3);

  const credit = rules.find((f) => f.kind === 'provider_attribution');
  const ownershipClues = [
    ...(credit ? [credit.detail] : []),
    ...(i.model && siteRead ? strList(i.model.ownership_clues, 4) : []),
  ];
  const providerClues = credit ? credit.evidence.slice(0, 2) : [];

  const m = i.model ?? {};
  const positioning = (['local', 'regional', 'national', 'mixed', 'unclear'] as Positioning[]).includes(m.positioning as Positioning)
    ? (m.positioning as Positioning)
    : (rules.some((f) => f.kind === 'positioning_conflict') ? 'mixed' : 'unclear');

  const sources: ResearchSource[] = [
    ...i.pages.map((p) => ({ url: p.finalUrl, kind: 'page' as const, status: p.status || null, ok: p.ok, at: i.nowIso })),
    ...(crawl.usedAt ? [{ url: i.website ?? '', kind: 'crawl_check' as const, status: null, ok: true, at: crawl.usedAt }] : []),
    ...(i.audit?.auditId ? [{ url: i.audit.reportUrl ?? i.audit.auditId, kind: 'audit' as const, status: null, ok: true, at: i.audit.createdAt }] : []),
  ];

  const status: ResearchStatus = !i.website ? 'no_website' : !siteRead ? 'failed' : (i.modelError || failedPages) ? 'partial' : 'complete';
  return {
    version: WARM_RESEARCH_VERSION,
    generatedAt: i.nowIso,
    website: i.website,
    sourceCrawlAt: siteRead ? i.nowIso : crawl.usedAt,
    status,
    businessSummary: siteRead ? str(m.business_summary, 500) : null,
    locationSignals: {
      homeTown: str(m.home_town, 80) ?? i.town,
      serviceAreas: siteRead ? strList(m.service_areas, 12, 60) : [],
      positioning,
      quotes: rules.find((f) => f.kind === 'positioning_conflict')?.evidence ?? [],
    },
    services: siteRead ? strList(m.services, 15, 80) : [],
    strongestFindings: strongest,
    technicalFindings: technical,
    contentFindings: by(['content', 'trust']),
    localVisibilityFindings: by('local_visibility'),
    ownershipClues,
    providerClues,
    usefulQuestions: siteRead ? strList(i.model?.useful_questions, 5) : [],
    warnings: [...warnings, ...(siteRead ? strList(i.model?.warnings, 4) : [])],
    sources,
    technicallyClean,
    contentHash: siteRead && home ? contentHash(home.text) : null,
    timings: { researchMs: i.researchMs, fetchMs: i.fetchMs, analyseMs: i.analyseMs },
  };
}

/** A research record for a lead with no website: nothing is read; the audit (if any) still counts. */
export function noWebsiteResearch(nowIso: string, audit: AuditContext | null): WarmLeadResearch {
  const r = assembleResearch({ nowIso, website: null, businessName: null, trade: null, town: audit?.town ?? null, pages: [], crawl: null, audit, model: null, modelError: null, fetchMs: 0, analyseMs: null, researchMs: 0, nowYear: new Date(nowIso).getUTCFullYear() });
  r.warnings.unshift('This lead has no website stored — a reply can offer to build one (the new-site route), never critique a site.');
  return r;
}

/* ─────────────────────────────── the research prompt ─────────────────────────────── */

export const RESEARCH_MODEL = 'gpt-4o-mini';

export const RESEARCH_SYSTEM_PROMPT = `You read a UK local business's website for a salesperson at Findable, a service that improves how often AI assistants (ChatGPT, Gemini) name local businesses. You return ONLY structured data via the return_research tool.

Your job: understand the business, and find the few things on the site that genuinely matter for being clearly understood as "this business, doing this service, in this place".

RULES — break none of them:
- Use ONLY the page text you are given. Invent nothing. If you did not see it, it does not exist.
- Every finding MUST include evidence_quotes copied EXACTLY, character for character, from the page text (short, 5–25 words). A finding you cannot quote is not a finding — leave it out.
- Do not report something as missing unless the text itself shows it (for example a menu that lists other things).
- If the site is technically fine, say so in warnings and focus on content, trust and local signals. Do not pad with trivia (alt text, meta descriptions, image sizes, copyright years, schema) unless it is genuinely serious.
- Never claim to know how an AI model decides. Say "can make it harder", "may mean", "gives less to work with" — never "AI can't see", "AI ignores", "AI reads it as".
- Look especially for: conflicting locations or local-vs-national claims; inconsistent opening hours or contact details; missing or weak pages for the trade's core services; content that belongs to a different trade or country (template leftovers); contradictory claims; weak or missing evidence (accreditations, reviews, real photos, named people); signs another company built, hosts or manages the site (ownership clues).
- The OBSERVED FACTS block lists things already measured by code. Do not repeat them as findings; you may rely on them.
- strength: 5 = serious fault that plainly hurts, 3 = clear sales point, 1 = trivia.
- useful_questions: at most three questions the salesperson could genuinely ask this prospect, based on what you saw.`;

export const RESEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'return_research',
    description: 'Return the structured research on this business website.',
    parameters: {
      type: 'object',
      properties: {
        business_summary: { type: 'string', description: 'One or two plain sentences: who they are, what they do, where.' },
        services: { type: 'array', items: { type: 'string' } },
        home_town: { type: 'string' },
        service_areas: { type: 'array', items: { type: 'string' } },
        positioning: { type: 'string', enum: ['local', 'regional', 'national', 'mixed', 'unclear'] },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: FINDING_KINDS as unknown as string[] },
              category: { type: 'string', enum: FINDING_CATEGORIES as unknown as string[] },
              title: { type: 'string' },
              detail: { type: 'string', description: 'What I saw → what it means in normal English → why it may make AI visibility harder. Hedged.' },
              evidence_quotes: { type: 'array', items: { type: 'string' } },
              strength: { type: 'integer', minimum: 1, maximum: 5 },
            },
            required: ['kind', 'category', 'title', 'detail', 'evidence_quotes', 'strength'],
            additionalProperties: false,
          },
        },
        ownership_clues: { type: 'array', items: { type: 'string' } },
        useful_questions: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      required: ['business_summary', 'services', 'positioning', 'findings', 'ownership_clues', 'useful_questions', 'warnings'],
      additionalProperties: false,
    },
  },
} as const;

/** The user prompt for the research model: the pages (capped), the lead's facts, and the observed
 *  facts so the model neither repeats nor contradicts them. */
export function buildResearchPrompt(i: { businessName: string | null; trade: string | null; town: string | null; pages: PageFacts[]; observed: ResearchFinding[] }): string {
  const pages = i.pages.filter((p) => p.ok).map((p, n) => [
    `=== PAGE ${n + 1}: ${p.finalUrl}`,
    `Title: ${p.title ?? '(none)'}`,
    `H1: ${p.h1s.join(' | ') || '(none)'}`,
    `Menu links: ${n === 0 ? p.links.slice(0, 25).map((u) => { try { return new URL(u).pathname; } catch { return u; } }).join(', ') : '(see page 1)'}`,
    `Text: ${p.text.slice(0, n === 0 ? 5000 : 2500)}`,
  ].join('\n')).join('\n\n');
  const observed = i.observed.length
    ? i.observed.map((f) => `- ${f.title}: ${f.evidence.slice(0, 2).join(' / ')}`).join('\n')
    : '- (nothing measured yet)';
  return `Business: ${i.businessName ?? '(unknown)'}
Trade: ${i.trade ?? '(unknown)'}
Home town (from our records): ${i.town ?? '(unknown)'}

OBSERVED FACTS (already measured by code — do not repeat):
${observed}

${pages}

Return via return_research.`;
}
