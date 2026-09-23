/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FULL MANUAL CRAWL — profile, page selection and the evidence it extracts (2026-09-23).

   ONE CRAWLER, TWO PROFILES. `crawl-check` is the only crawler; this module is what its FULL mode
   adds. The rule (Paul, 2026-09-23):
     · a USER-INITIATED "Crawl site" / "Re-crawl site" button  → FULL (every entry point, one profile)
     · an AUTOMATED crawl (audit finalise, report background populate) → STANDARD, bounded as before
   ⛔ FULL IS OPT-IN AND OPERATOR-ONLY (resolveCrawlMode). An internal caller cannot ask for it, and an
   absent / unknown mode is STANDARD — so no background path can be turned expensive by a missing flag
   or a shape change upstream.

   ⛔ EVIDENCE, NEVER TRUTH. Everything here is "what the public website currently says". It is shown
   as DETECTED / NEEDS APPROVAL and never promoted to an approved client fact (clientFacts,
   buildFacts, clientContext keep that line).
   ⛔ NOTHING IS INVENTED. Every item carries the URL it was read on; a field with nothing found is
   empty, never guessed.

   IMPORTED BY AN EDGE FUNCTION: relative imports with an explicit .ts extension only (CLAUDE.md §4).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { crawlPageKind, patternKey, visibleText, THIN_WORDS, MAX_CRAWL_PAGES } from './crawlCheck.ts';

export type CrawlMode = 'standard' | 'full';

export interface CrawlProfile {
  mode: CrawlMode;
  /** Pages of theirs we fetch, beyond the homepage. */
  maxPages: number;
  /** Hard ceiling on requests of every kind (crawler probes, robots, sitemaps, pages). */
  fetchBudget: number;
  /** Wall clock for the fetch phase. Anything past it is skipped, never queued. */
  deadlineMs: number;
  /** Sitemap documents read (robots-declared, /sitemap.xml, index children). */
  sitemapFetches: number;
  /** Simultaneous page fetches — polite to a small host. */
  concurrency: number;
  /** Per-request timeout. */
  fetchTimeoutMs: number;
}

/* ⛔ THE STANDARD PROFILE IS THE BUDGET crawl-check HAS ALWAYS HAD. It runs across the whole outreach
   book and inside the audit-finalise wall clock; nothing in this change raises it. */
export const STANDARD_CRAWL: CrawlProfile = {
  mode: 'standard', maxPages: MAX_CRAWL_PAGES, fetchBudget: 22, deadlineMs: 35_000,
  sitemapFetches: 4, concurrency: 6, fetchTimeoutMs: 6_000,
};

/* THE FULL PROFILE. Sized for a small-business site (most have 5–60 real pages) inside the edge
   runtime's request limit: the fetch phase stops at deadlineMs, well under the platform's 150 s,
   leaving time to analyse and store. A site bigger than maxPages is crawled BREADTH-FIRST (one page
   per template family before any family gets a second) and the row says "partial" with the counts —
   never "full" for a crawl that stopped. Every URL discovered is still RECORDED, fetched or not. */
export const FULL_CRAWL: CrawlProfile = {
  mode: 'full', maxPages: 60, fetchBudget: 90, deadlineMs: 95_000,
  sitemapFetches: 12, concurrency: 6, fetchTimeoutMs: 8_000,
};

export const FULL_CRAWL_EVIDENCE_VERSION = 1;
/** Discovered URLs stored on the row (fetched or not) — the old-URL list the rebuild redirects from. */
export const MAX_STORED_URLS = 1_000;

/** Which profile a request gets. Positive match: only an OPERATOR saying exactly 'full' gets FULL. */
export function resolveCrawlMode(requested: unknown, isOperator: boolean): CrawlMode {
  return isOperator && requested === 'full' ? 'full' : 'standard';
}
export const profileFor = (mode: CrawlMode): CrawlProfile => (mode === 'full' ? FULL_CRAWL : STANDARD_CRAWL);

/** Where the manual crawl was started — recorded, never used to decide anything. */
export const CRAWL_REQUEST_SOURCES = ['outreach', 'inbox', 'lead_detail', 'paid_client', 'website_build'] as const;
export type CrawlRequestSource = (typeof CRAWL_REQUEST_SOURCES)[number];
export function cleanRequestSource(v: unknown): CrawlRequestSource | null {
  return (CRAWL_REQUEST_SOURCES as readonly string[]).includes(String(v)) ? (v as CrawlRequestSource) : null;
}

/* ── same site ────────────────────────────────────────────────────────────────────────────────── */

const hostKey = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** Same website for crawling purposes: same host once a leading `www.` is ignored.
 *  🔴 WHY THIS EXISTS. crawl-check compared every sitemap URL and link against the origin it was
 *  HANDED; a site that redirects apex → www (BS4 Electrical, 2026-09-23: every Wix site does) had
 *  every one of its URLs thrown away as "another site", and the crawl read the homepage only. */
export function sameSiteUrl(url: string, servedUrl: string): boolean {
  try {
    const a = new URL(url), b = new URL(servedUrl);
    return /^https?:$/.test(a.protocol) && hostKey(a.hostname) === hostKey(b.hostname);
  } catch { return false; }
}

/** Rewrite a same-site URL onto the SERVED origin (so apex/www twins collapse) and drop hash/query. */
export function toServedUrl(url: string, servedUrl: string): string | null {
  try {
    const u = new URL(url, servedUrl);
    if (!sameSiteUrl(u.href, servedUrl)) return null;
    const served = new URL(servedUrl);
    u.protocol = served.protocol; u.host = served.host; u.hash = ''; u.search = '';
    return u.href;
  } catch { return null; }
}

const ASSET = /\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|xml|ico|mp4|mp3|woff2?|ttf|eot|txt|json|rss)$/i;
const NON_PAGE = /\/(?:wp-admin|wp-login\.php|admin|login|logout|cart|basket|checkout|account|my-account|wp-json|feed|xmlrpc\.php|cdn-cgi|_api|_partials)(?:\/|$)/i;
/** A URL worth fetching as a page. */
export function isPageUrl(url: string): boolean {
  try { const p = new URL(url).pathname; return !ASSET.test(p) && !NON_PAGE.test(p); } catch { return false; }
}

/** Same-site absolute page URLs from <a href>, on the served origin. */
export function internalPageLinks(html: string, pageUrl: string, servedUrl: string): string[] {
  const out = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#][^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html || '')) !== null) {
    let abs = '';
    try { abs = new URL(m[1], pageUrl).href; } catch { continue; }
    const s = toServedUrl(abs, servedUrl);
    if (s && isPageUrl(s)) out.add(s);
  }
  return [...out];
}

/** Sitemap children to read first: a site's own PAGES sitemap before its generated collections
 *  (Wix lists `pages-sitemap.xml` last, after dozens of `dynamic-…` location sitemaps). */
export function orderSitemapChildren(children: string[]): string[] {
  const pages = /(?:^|[/_-])pages?[-_]?sitemap|sitemap[-_]pages?|wp-sitemap-posts-page|page-sitemap/i;
  const posts = /post|blog|news|article/i;
  const rank = (u: string) => (pages.test(u) ? 0 : posts.test(u) ? 2 : 1);
  return children.map((u, i) => ({ u, i })).sort((a, b) => rank(a.u) - rank(b.u) || a.i - b.i).map((x) => x.u);
}

/* ── page selection for the FULL profile ──────────────────────────────────────────────────────── */

const pathKeyOf = (u: string) => { try { return new URL(u).pathname.replace(/\/+$/, '') || '/'; } catch { return u; } };

/** Breadth-first page selection: the homepage's own links (its navigation) first, then ONE page from
 *  every template family (patternKey), then round-robin through the families. So a site with 300
 *  generated location pages still has its services, about, contact, FAQ and pricing pages read, and
 *  a sample of each location template — not 60 near-identical town pages. Deterministic. */
export function selectFullCrawlUrls(input: { homeLinks: string[]; discovered: string[]; homeUrl: string; limit: number; town?: string | null; exclude?: Set<string> }): string[] {
  const homeKey = pathKeyOf(input.homeUrl);
  const seen = new Set<string>([homeKey, ...(input.exclude ?? [])].map(pathKeyOf));
  const out: string[] = [];
  const take = (u: string) => {
    const k = pathKeyOf(u);
    if (seen.has(k) || out.length >= input.limit) return;
    seen.add(k); out.push(u);
  };
  // 1. The navigation: what the business chose to put on its homepage.
  for (const u of input.homeLinks) take(u);
  // 2. Families, one at a time.
  /* A page's template family: its parent directory when it has one (Wix puts every generated town
     page under /<service>-locations/<town>, and patternKey keeps a one-word town as its own stem),
     else the slug pattern (/emergency-electrician-leeds ~ /emergency-electrician-york). */
  const familyOf = (u: string) => {
    const p = pathKeyOf(u).replace(/^\/+/, '').split('/').filter(Boolean);
    return p.length >= 2 ? p.slice(0, -1).join('/') + '/*' : (patternKey(u, input.town) || pathKeyOf(u));
  };
  const families = new Map<string, string[]>();
  for (const u of [...input.homeLinks, ...input.discovered]) {
    const k = familyOf(u);
    (families.get(k) ?? families.set(k, []).get(k)!).push(u);
  }
  const lists = [...families.values()];
  for (let round = 0; out.length < input.limit; round++) {
    let any = false;
    for (const l of lists) { if (l[round]) { any = true; take(l[round]); } }
    if (!any) break;
  }
  return out;
}

/* ── lean HTML: what we keep of a page after fetching it ──────────────────────────────────────── */

/** The page with executable noise removed — scripts (except JSON-LD), styles, SVG, comments. A Wix
 *  page is ~700 KB of which a few KB is content; holding 60 raw pages would risk the edge runtime's
 *  memory. Everything this module and siteInfo read survives: head tags, headings, text, links,
 *  images, JSON-LD. */
export function leanHtml(html: string): string {
  return (html || '')
    .replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/* ── per-page digest ──────────────────────────────────────────────────────────────────────────── */

const decode = (s: string) => s
  .replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
  .replace(/&quot;|&ldquo;|&rdquo;/gi, '"').replace(/&ndash;|&mdash;/gi, '-').replace(/&pound;/gi, '£')
  .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(Number(d)); } catch { return m; } })
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
const tagText = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function metaContent(html: string, attr: 'name' | 'property', value: string): string {
  const re = new RegExp(`<meta\\b[^>]*${attr}=["']${value}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0] ?? '';
  return decode(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? '').trim();
}
function linkHref(html: string, rel: RegExp): string {
  const re = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const r = /rel=["']([^"']+)["']/i.exec(m[0])?.[1] ?? '';
    if (rel.test(r)) return decode(/href=["']([^"']+)["']/i.exec(m[0])?.[1] ?? '').trim();
  }
  return '';
}
function headings(html: string, level: 1 | 2 | 3, max: number): string[] {
  const re = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < max) { const t = clip(tagText(m[1]), 160); if (t) out.push(t); }
  return out;
}

// deno-lint-ignore no-explicit-any
export function jsonLdNodes(html: string): any[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html || '')) !== null) {
    try {
      const stack = [JSON.parse(m[1].trim())];
      while (stack.length) {
        const n = stack.pop();
        if (Array.isArray(n)) stack.push(...n);
        else if (n && typeof n === 'object') { out.push(n); for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v); }
      }
    } catch { /* malformed block skipped */ }
  }
  // deno-lint-ignore no-explicit-any
  return out as any[];
}
// deno-lint-ignore no-explicit-any
const typesOf = (n: any): string[] => (Array.isArray(n?.['@type']) ? n['@type'] : n?.['@type'] ? [n['@type']] : []).map(String);

export type FullPageFamily = 'homepage' | 'service' | 'location' | 'about' | 'contact' | 'faq' | 'pricing' | 'reviews' | 'gallery' | 'blog' | 'legal' | 'other';

/** The page's family for architecture — crawlPageKind plus the families a rebuild needs. */
export function fullPageFamily(url: string, homeUrl: string): FullPageFamily {
  if (pathKeyOf(url) === pathKeyOf(homeUrl)) return 'homepage';
  let p = '';
  try { p = new URL(url).pathname.toLowerCase(); } catch { return 'other'; }
  if (/faq|questions/.test(p)) return 'faq';
  if (/pric|cost|rates|tariff/.test(p)) return 'pricing';
  if (/review|testimonial/.test(p)) return 'reviews';
  if (/gallery|portfolio|our-work|projects|case-stud/.test(p)) return 'gallery';
  if (/privacy|cookie|terms|legal|gdpr|disclaimer|accessibility|modern-slavery/.test(p)) return 'legal';
  if (/blog|news|article|post|\/20\d\d\//.test(p)) return 'blog';
  const k = crawlPageKind(url);
  return k === 'other' ? 'other' : k;
}

export interface PageDigest {
  url: string;
  finalUrl: string;
  status: number;
  family: FullPageFamily;
  title: string;
  description: string;
  canonical: string;
  noindex: boolean;
  h1: string[];
  h2: string[];
  words: number;
  /** The first readable text on the page, for reading, never publishing. */
  excerpt: string;
  internalLinks: number;
  schemaTypes: string[];
}

const EXCERPT_CHARS = 700;

export function digestPage(p: { url: string; finalUrl: string; status: number; xRobotsTag: string | null; html: string }, homeUrl: string, servedUrl: string): PageDigest {
  const html = p.html || '';
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? html.slice(0, 60_000);
  const robots = [metaContent(head, 'name', 'robots'), p.xRobotsTag ?? ''].join(',').toLowerCase();
  const text = visibleText(html);
  const canonical = linkHref(head, /(^|\s)canonical(\s|$)/i);
  return {
    url: p.url, finalUrl: p.finalUrl || p.url, status: p.status,
    family: fullPageFamily(p.finalUrl || p.url, homeUrl),
    title: clip(tagText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? ''), 200),
    description: clip(metaContent(head, 'name', 'description'), 320),
    canonical: canonical ? (() => { try { return new URL(canonical, p.finalUrl || p.url).href; } catch { return canonical; } })() : '',
    noindex: /noindex|\bnone\b/.test(robots),
    h1: headings(html, 1, 5), h2: headings(html, 2, 12),
    words: text ? text.split(/\s+/).filter(Boolean).length : 0,
    excerpt: clip(decode(text), EXCERPT_CHARS),
    internalLinks: internalPageLinks(html, p.finalUrl || p.url, servedUrl).length,
    schemaTypes: [...new Set(jsonLdNodes(html).flatMap(typesOf))].slice(0, 12),
  };
}

/* ── business evidence, across every page read ────────────────────────────────────────────────── */

/** One piece of evidence: what was seen, and where. */
export interface Seen { value: string; url: string }

/* Credentials and memberships a UK local business commonly states. Matched as whole words in the
   page TEXT; a match is "the site says so", never "they are". */
const CREDENTIALS: Array<{ name: string; re: RegExp }> = [
  { name: 'NICEIC', re: /\bNICEIC\b/i }, { name: 'NAPIT', re: /\bNAPIT\b/i }, { name: 'ELECSA', re: /\bELECSA\b/i },
  { name: 'Gas Safe', re: /\bGas\s*Safe\b/i }, { name: 'OFTEC', re: /\bOFTEC\b/i }, { name: 'HETAS', re: /\bHETAS\b/i },
  { name: 'TrustMark', re: /\bTrust\s*Mark\b/i }, { name: 'Checkatrade', re: /\bCheckatrade\b/i },
  { name: 'Which? Trusted Trader', re: /\bWhich\?\s*Trusted\s*Trader/i }, { name: 'TrustATrader', re: /\bTrust\s*A\s*Trader\b/i },
  { name: 'Master Locksmiths Association', re: /\bMaster\s+Locksmiths?\s+Association\b|\bMLA\b(?=[^.]{0,40}(?:member|approved|licens))/i },
  { name: 'FENSA', re: /\bFENSA\b/i }, { name: 'CERTASS', re: /\bCERTASS\b/i }, { name: 'Part P', re: /\bPart\s*P\b/i },
  { name: 'City & Guilds', re: /\bCity\s*(?:&|and)\s*Guilds\b/i }, { name: '18th Edition', re: /\b18th\s+Edition\b/i },
  { name: 'Federation of Master Builders', re: /\bFederation\s+of\s+Master\s+Builders\b|\bFMB\b/i },
  { name: 'SafeContractor', re: /\bSafe\s*Contractor\b/i }, { name: 'CHAS', re: /\bCHAS\b/ }, { name: 'Constructionline', re: /\bConstructionline\b/i },
  { name: 'ISO 9001', re: /\bISO\s*9001\b/i }, { name: 'DBS checked', re: /\bDBS[\s-]*(?:checked|check|cleared)\b/i },
  { name: 'Fully insured', re: /\bfully\s+insured\b|\bpublic\s+liability\b/i }, { name: 'Which? approved', re: /\bWhich\?\s*approved\b/i },
  { name: 'ACCA', re: /\bACCA\b/ }, { name: 'ICAEW', re: /\bICAEW\b/ }, { name: 'AAT', re: /\bAAT\b/ }, { name: 'CIPHE', re: /\bCIPHE\b/i },
  { name: 'Worcester Bosch Accredited', re: /\bWorcester\s+(?:Bosch\s+)?Accredited\b/i }, { name: 'Vaillant Advance', re: /\bVaillant\s+Advance\b/i },
  { name: 'OZEV approved', re: /\bOZEV\b|\bOLEV\b/i }, { name: 'MCS certified', re: /\bMCS\s+(?:certified|accredited)\b/i },
];

const THIRD_PARTY: Array<{ name: string; host: RegExp }> = [
  { name: 'Google Business Profile', host: /(^|\.)(g\.page|maps\.app\.goo\.gl|goo\.gl)$|(^|\.)google\.[a-z.]+$/ },
  { name: 'Facebook', host: /(^|\.)facebook\.com$|(^|\.)fb\.com$/ }, { name: 'Instagram', host: /(^|\.)instagram\.com$/ },
  { name: 'LinkedIn', host: /(^|\.)linkedin\.com$/ }, { name: 'X / Twitter', host: /(^|\.)(twitter|x)\.com$/ },
  { name: 'YouTube', host: /(^|\.)(youtube\.com|youtu\.be)$/ }, { name: 'TikTok', host: /(^|\.)tiktok\.com$/ },
  { name: 'Checkatrade', host: /(^|\.)checkatrade\.com$/ }, { name: 'Yell', host: /(^|\.)yell\.com$/ },
  { name: 'Trustpilot', host: /(^|\.)trustpilot\.com$/ }, { name: 'TrustATrader', host: /(^|\.)trustatrader\.com$/ },
  { name: 'MyBuilder', host: /(^|\.)mybuilder\.com$/ }, { name: 'Rated People', host: /(^|\.)ratedpeople\.com$/ },
  { name: 'Bark', host: /(^|\.)bark\.com$/ }, { name: 'Houzz', host: /(^|\.)houzz\.[a-z.]+$/ }, { name: 'Nextdoor', host: /(^|\.)nextdoor\.[a-z.]+$/ },
  { name: 'Which? Trusted Traders', host: /(^|\.)which\.co\.uk$/ }, { name: 'Companies House', host: /(^|\.)(company-information\.service\.gov\.uk|find-and-update\.company-information\.service\.gov\.uk)$/ },
  { name: 'NICEIC', host: /(^|\.)niceic\.com$/ }, { name: 'Gas Safe Register', host: /(^|\.)gassaferegister\.co\.uk$/ },
];

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\s{2,}|\s[•|]\s/).map((s) => s.trim()).filter((s) => s.length >= 12 && s.length <= 400);
}

/** Whether robots.txt's `User-agent: *` group says `Disallow: /`. Reported as evidence only. */
export function robotsDisallowsAll(body: string): boolean {
  let agents: string[] = [];
  let inRules = false;
  for (const raw of (body || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase(), value = m[2].trim();
    if (field === 'user-agent') { if (inRules) { agents = []; inRules = false; } agents.push(value); continue; }
    inRules = true;
    if (field === 'disallow' && value === '/' && agents.includes('*')) return true;
  }
  return false;
}

export interface FullCrawlInputPage { url: string; finalUrl: string; status: number; xRobotsTag: string | null; html: string; isHome?: boolean }

export interface FullCrawlEvidence {
  version: number;
  mode: 'full';
  limits: { maxPages: number; fetchBudget: number; deadlineMs: number; sitemapFetches: number };
  stats: {
    urlsDiscovered: number; pagesQueued: number; pagesFetched: number; pagesOk: number; fetchesUsed: number;
    hitPageLimit: boolean; hitFetchBudget: boolean; hitDeadline: boolean; ms: number;
  };
  completeness: 'complete' | 'partial' | 'failed';
  warnings: string[];
  servedUrl: string;
  requestedUrl: string;
  redirectedFrom: string | null;
  robots: { found: boolean; sitemaps: string[]; disallowsAll: boolean; excerpt: string };
  sitemaps: { read: string[]; urlCount: number; offSiteCount: number };
  /** Every page URL discovered (sitemap + links), fetched or not — capped at MAX_STORED_URLS. */
  discoveredUrls: string[];
  pages: PageDigest[];
  families: Array<{ family: FullPageFamily; count: number; examples: string[] }>;
  navigation: Array<{ label: string; url: string }>;
  footerExcerpt: string;
  business: {
    names: Seen[]; phones: Seen[]; emails: Seen[]; addresses: Seen[];
    people: Seen[]; credentials: Seen[]; guarantees: Seen[]; experience: Seen[]; prices: Seen[];
    reviews: Seen[]; profiles: Seen[]; logo: string; favicon: string; ogImage: string;
    images: Array<{ src: string; alt: string; url: string }>;
    schema: Array<{ types: string[]; name: string; telephone: string; address: string; areaServed: string[]; url: string }>;
  };
  technical: Array<{ kind: string; detail: string; urls: string[] }>;
}

const MAX_SEEN = 12;
function pushSeen(list: Seen[], value: string, url: string, max = MAX_SEEN) {
  const v = value.trim();
  if (!v || list.length >= max) return;
  if (list.some((s) => s.value.toLowerCase() === v.toLowerCase())) return;
  list.push({ value: clip(v, 240), url });
}

const PHONE_RE = /(?:\+44\s?\(?0?\)?\s?|\b0)(?:\d[\s-]?){9,10}\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

function addressLine(n: { address?: unknown }): string {
  const a = n?.address as Record<string, unknown> | string | undefined;
  if (!a) return '';
  if (typeof a === 'string') return a;
  return ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode'].map((k) => String(a[k] ?? '').trim()).filter(Boolean).join(', ');
}

/** Build the full crawl's evidence from the pages it read. Pure; no I/O. */
export function buildFullCrawlEvidence(input: {
  requestedUrl: string;
  servedUrl: string;
  pages: FullCrawlInputPage[];
  robotsTxt: string | null;
  sitemapDocs: string[];
  sitemapLocs: string[];
  discoveredUrls: string[];
  stats: FullCrawlEvidence['stats'];
  profile: CrawlProfile;
}): FullCrawlEvidence {
  const { servedUrl } = input;
  const homeUrl = servedUrl;
  const answered = input.pages.filter((p) => p.status > 0);
  const readable = answered.filter((p) => p.status < 400 && p.html);
  const pages = answered.map((p) => digestPage(p, homeUrl, servedUrl));
  const home = readable.find((p) => p.isHome) ?? null;

  /* robots.txt — read for what it says, never as proof a crawler is or is not blocked. */
  const robotsBody = input.robotsTxt ?? '';
  const robotSitemaps = [...robotsBody.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
  const disallowsAll = robotsDisallowsAll(robotsBody);

  /* Families. */
  const famMap = new Map<FullPageFamily, string[]>();
  for (const u of new Set([...pages.map((p) => p.finalUrl), ...input.discoveredUrls])) {
    const f = fullPageFamily(u, homeUrl);
    (famMap.get(f) ?? famMap.set(f, []).get(f)!).push(u);
  }
  const families = [...famMap.entries()].map(([family, urls]) => ({ family, count: urls.length, examples: urls.slice(0, 5) }))
    .sort((a, b) => b.count - a.count);

  /* Navigation + footer, from the homepage. */
  const navigation: Array<{ label: string; url: string }> = [];
  let footerExcerpt = '';
  if (home) {
    const navHtml = [...home.html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)].map((m) => m[1]).join(' ')
      || (/<header\b[^>]*>([\s\S]*?)<\/header>/i.exec(home.html)?.[1] ?? '');
    for (const m of navHtml.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = clip(tagText(m[2]), 80);
      let url = '';
      try { url = new URL(m[1], home.finalUrl || homeUrl).href; } catch { continue; }
      if (label && !navigation.some((n) => n.url === url) && navigation.length < 40) navigation.push({ label, url });
    }
    const footer = /<footer\b[^>]*>([\s\S]*?)<\/footer>/i.exec(home.html)?.[1] ?? '';
    footerExcerpt = clip(tagText(footer), 600);
  }

  /* Business evidence across every readable page. */
  const b: FullCrawlEvidence['business'] = {
    names: [], phones: [], emails: [], addresses: [], people: [], credentials: [], guarantees: [], experience: [],
    prices: [], reviews: [], profiles: [], logo: '', favicon: '', ogImage: '', images: [], schema: [],
  };
  const credentialSeen = new Set<string>();
  const profileSeen = new Set<string>();
  for (const p of readable) {
    const url = p.finalUrl || p.url;
    const text = decode(visibleText(p.html));
    const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(p.html)?.[1] ?? '';
    if (p.isHome) {
      pushSeen(b.names, metaContent(head, 'property', 'og:site_name'), url);
      const icon = linkHref(head, /icon/i);
      try { b.favicon = icon ? new URL(icon, url).href : ''; } catch { b.favicon = icon; }
      const og = metaContent(head, 'property', 'og:image');
      b.ogImage = og ? (() => { try { return new URL(og, url).href; } catch { return og; } })() : '';
    }
    for (const n of jsonLdNodes(p.html)) {
      const types = typesOf(n);
      if (!types.length) continue;
      const name = typeof n.name === 'string' ? n.name.trim() : '';
      const tel = typeof n.telephone === 'string' ? n.telephone.trim() : '';
      const addr = addressLine(n);
      const area = (Array.isArray(n.areaServed) ? n.areaServed : n.areaServed ? [n.areaServed] : [])
        // deno-lint-ignore no-explicit-any
        .map((a: any) => (typeof a === 'string' ? a : String(a?.name ?? ''))).map((s: string) => s.trim()).filter(Boolean).slice(0, 30);
      if (/business|organi[sz]ation|contractor|service|plumber|electrician|locksmith|store|dentist|accounting/i.test(types.join(' '))) {
        if (name) pushSeen(b.names, name, url);
        if (tel) pushSeen(b.phones, tel, url);
        if (addr) pushSeen(b.addresses, addr, url);
        if (b.schema.length < 10 && (name || tel || addr || area.length)) b.schema.push({ types, name, telephone: tel, address: addr, areaServed: area, url });
        if (typeof n.logo === 'string' && !b.logo) b.logo = n.logo;
        else if (n.logo && typeof n.logo === 'object' && typeof n.logo.url === 'string' && !b.logo) b.logo = n.logo.url;
      }
      if (types.some((t) => /^(Review|AggregateRating)$/i.test(t))) {
        const rating = n.ratingValue ?? n.reviewRating?.ratingValue;
        const count = n.reviewCount ?? n.ratingCount;
        const body = typeof n.reviewBody === 'string' ? n.reviewBody : '';
        pushSeen(b.reviews, [rating ? `Rating ${rating}` : '', count ? `${count} reviews` : '', body ? `"${clip(body, 160)}"` : ''].filter(Boolean).join(' · '), url);
      }
    }
    for (const m of text.match(PHONE_RE) ?? []) pushSeen(b.phones, m.replace(/\s+/g, ' '), url);
    for (const m of p.html.match(/href=["']tel:([^"']+)["']/gi) ?? []) pushSeen(b.phones, decode(m.replace(/^href=["']tel:/i, '').replace(/["']$/, '')), url);
    for (const m of (p.html.match(/mailto:([^"'?]+)/gi) ?? []).map((x) => x.replace(/^mailto:/i, ''))) pushSeen(b.emails, m, url);
    for (const m of text.match(EMAIL_RE) ?? []) if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(m) && !/wixpress|sentry|example\./i.test(m)) pushSeen(b.emails, m, url);
    for (const s of sentences(text)) {
      if (UK_POSTCODE.test(s) && s.length < 160 && /\d/.test(s)) pushSeen(b.addresses, s, url, 6);
      if (/\b(?:owner|founder|director|proprietor|my name is|i'?m [A-Z][a-z]+|run by|family[- ]run)\b/i.test(s)) pushSeen(b.people, s, url, 8);
      if (/\bguarantee[ds]?\b|\bwarrant(?:y|ies|ied)\b|\bno fix,? no fee\b|\bmoney[- ]back\b/i.test(s)) pushSeen(b.guarantees, s, url, 8);
      if (/\b\d{1,2}\+?\s*(?:years?|yrs)\b[^.]{0,40}\b(?:experience|trading|established|in business|serving)\b|\b(?:established|est\.?|since|founded)\s+(?:in\s+)?(?:19|20)\d{2}\b/i.test(s)) pushSeen(b.experience, s, url, 8);
      if (/£\s?\d/.test(s)) pushSeen(b.prices, s, url, 12);
      if (/\b(?:testimonial|review|stars?|★|would highly recommend|highly recommended)\b/i.test(s) && b.reviews.length < MAX_SEEN) pushSeen(b.reviews, s, url, MAX_SEEN);
    }
    for (const c of CREDENTIALS) {
      if (credentialSeen.has(c.name)) continue;
      const m = c.re.exec(text);
      if (m) {
        credentialSeen.add(c.name);
        const around = text.slice(Math.max(0, m.index - 80), m.index + 120).replace(/\s+/g, ' ').trim();
        b.credentials.push({ value: `${c.name} — "${clip(around, 200)}"`, url });
      }
    }
    for (const m of p.html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)) {
      let host = '';
      try { host = new URL(m[1]).hostname.toLowerCase(); } catch { continue; }
      if (sameSiteUrl(m[1], servedUrl)) continue;
      const hit = THIRD_PARTY.find((t) => t.host.test(host));
      if (hit && !profileSeen.has(m[1]) && b.profiles.length < 20) { profileSeen.add(m[1]); b.profiles.push({ value: `${hit.name}: ${m[1]}`, url }); }
    }
    for (const m of p.html.matchAll(/<img\b[^>]*>/gi)) {
      if (b.images.length >= 40) break;
      const src = /\s(?:data-)?src=["']([^"']+)["']/i.exec(m[0])?.[1] ?? '';
      if (!src || src.startsWith('data:')) continue;
      const alt = decode(/\salt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? '').trim();
      let abs = '';
      try { abs = new URL(src, url).href; } catch { continue; }
      if (!b.logo && /logo/i.test(src + ' ' + alt + ' ' + m[0])) b.logo = abs;
      if (!b.images.some((i) => i.src === abs)) b.images.push({ src: abs, alt: clip(alt, 120), url });
    }
  }

  /* Technical findings — every one names the URLs it was seen on. */
  const technical: FullCrawlEvidence['technical'] = [];
  const add = (kind: string, detail: string, urls: string[]) => { if (urls.length) technical.push({ kind, detail, urls: urls.slice(0, 20) }); };
  const ok = pages.filter((p) => p.status > 0 && p.status < 400);
  add('noindex', 'Page asks search engines and AI not to list it (noindex).', ok.filter((p) => p.noindex).map((p) => p.finalUrl));
  add('missing_title', 'Page has no <title>.', ok.filter((p) => !p.title).map((p) => p.finalUrl));
  add('missing_description', 'Page has no meta description.', ok.filter((p) => !p.description).map((p) => p.finalUrl));
  add('missing_h1', 'Page has no H1 heading.', ok.filter((p) => p.h1.length === 0).map((p) => p.finalUrl));
  add('multiple_h1', 'Page has more than one H1 heading.', ok.filter((p) => p.h1.length > 1).map((p) => p.finalUrl));
  add('thin', `Page has under ${THIN_WORDS} words of readable text.`, ok.filter((p) => p.words < THIN_WORDS).map((p) => p.finalUrl));
  const byTitle = new Map<string, string[]>();
  for (const p of ok) if (p.title) (byTitle.get(p.title.toLowerCase()) ?? byTitle.set(p.title.toLowerCase(), []).get(p.title.toLowerCase())!).push(p.finalUrl);
  add('duplicate_title', 'Pages share the same <title>.', [...byTitle.values()].filter((u) => u.length > 1).flat());
  add('canonical_off_site', 'Page names a different website as its main (canonical) version.', ok.filter((p) => p.canonical && !sameSiteUrl(p.canonical, servedUrl)).map((p) => `${p.finalUrl} → ${p.canonical}`));
  add('broken', 'Page answered with an error status.', pages.filter((p) => p.status >= 400).map((p) => `${p.url} (${p.status})`));
  add('redirected', 'Page redirects to a different address.', pages.filter((p) => p.finalUrl && pathKeyOf(p.finalUrl) !== pathKeyOf(p.url)).map((p) => `${p.url} → ${p.finalUrl}`));
  const offSite = input.sitemapLocs.filter((u) => !sameSiteUrl(u, servedUrl));
  add('sitemap_off_site', 'Sitemap lists addresses on a different website.', offSite);
  if (!input.sitemapDocs.length) technical.push({ kind: 'no_sitemap', detail: 'No XML sitemap was found (robots.txt and /sitemap.xml checked).', urls: [] });
  if (!robotsBody) technical.push({ kind: 'no_robots', detail: 'No robots.txt was found.', urls: [] });
  const noSchema = ok.filter((p) => p.family === 'homepage' && p.schemaTypes.length === 0).map((p) => p.finalUrl);
  add('no_schema_home', 'The homepage carries no structured data (JSON-LD).', noSchema);

  /* Completeness — said plainly, never "full" for a crawl that stopped. */
  const warnings: string[] = [];
  const s = input.stats;
  if (s.hitPageLimit) warnings.push(`Page limit reached: ${s.pagesFetched} of ${s.urlsDiscovered} discovered pages were read (limit ${input.profile.maxPages}).`);
  if (s.hitFetchBudget) warnings.push(`Request budget reached (${input.profile.fetchBudget} requests).`);
  if (s.hitDeadline) warnings.push(`Time limit reached (${Math.round(input.profile.deadlineMs / 1000)} s) — the rest of the site was not read.`);
  const failedPages = pages.filter((p) => p.status === 0 || p.status >= 400).length;
  if (failedPages) warnings.push(`${failedPages} page(s) could not be read.`);
  const completeness: FullCrawlEvidence['completeness'] = !home ? 'failed'
    : (s.hitPageLimit || s.hitFetchBudget || s.hitDeadline || failedPages > 0) ? 'partial' : 'complete';
  if (!home) warnings.unshift('The homepage could not be read, so nothing else was.');

  const redirectedFrom = (() => {
    try { return new URL(input.requestedUrl).host !== new URL(servedUrl).host ? input.requestedUrl : null; } catch { return null; }
  })();

  return {
    version: FULL_CRAWL_EVIDENCE_VERSION, mode: 'full',
    limits: { maxPages: input.profile.maxPages, fetchBudget: input.profile.fetchBudget, deadlineMs: input.profile.deadlineMs, sitemapFetches: input.profile.sitemapFetches },
    stats: input.stats, completeness, warnings,
    servedUrl, requestedUrl: input.requestedUrl, redirectedFrom,
    robots: { found: !!robotsBody, sitemaps: robotSitemaps.slice(0, 10), disallowsAll, excerpt: clip(robotsBody.trim(), 800) },
    sitemaps: { read: input.sitemapDocs.slice(0, 20), urlCount: input.sitemapLocs.length, offSiteCount: offSite.length },
    discoveredUrls: input.discoveredUrls.slice(0, MAX_STORED_URLS),
    pages, families, navigation, footerExcerpt, business: b, technical,
  };
}

/* ── the canonical row: may this crawl replace the one stored? ────────────────────────────────── */

/** ⛔ AN AUTOMATED STANDARD CRAWL NEVER OVERWRITES A FRESH FULL ONE. The lead row is the one latest
 *  crawl every screen reads; a background audit finalising a day after Paul pressed Re-crawl must
 *  not replace 60 pages of evidence with 12. A full crawl always replaces; a standard one replaces
 *  anything except a full crawl younger than freshMs. */
export function mayReplaceLeadCrawl(existing: { mode?: string | null; created_at?: string | null } | null | undefined, incoming: CrawlMode, nowMs: number, freshMs: number): boolean {
  if (incoming === 'full') return true;
  if (!existing || existing.mode !== 'full') return true;
  const t = Date.parse(String(existing.created_at ?? ''));
  return !Number.isFinite(t) || nowMs - t >= freshMs;
}
