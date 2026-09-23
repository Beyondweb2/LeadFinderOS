/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE EXHAUSTIVE MANUAL CRAWL — profiles, per-page evidence and the crawl-wide summary.

   ONE CRAWLER, TWO PROFILES (Paul, 2026-09-23):
     · every USER-TRIGGERED Crawl site / Re-crawl site / Crawl check → FULL = EXHAUSTIVE: a background
       job (crawl_jobs + crawl_urls, drained by crawl-worker) that runs until the frontier is empty.
       No page cap, no request cap, no sitemap-count cap, no stored-URL cap.
     · every AUTOMATED crawl (audit finalise, report background populate) → STANDARD, inline in
       crawl-check, the bounded budget it always had.
   ⛔ FULL IS OPT-IN AND OPERATOR-ONLY (resolveCrawlMode). An internal caller cannot ask for it; an
   absent or unknown mode is STANDARD.

   🔴 THE PREVIOUS "FULL" CRAWL (earlier on 2026-09-23) STOPPED AT 60 PAGES because it ran inside ONE
   edge request: 60 pages / 90 requests / 95 s / 12 sitemaps / 1,000 stored URLs were all consequences
   of having to finish before the request died. The fix is the job, not bigger numbers.

   What remains is crawler SAFETY, not sampling: 1 MB per response (memory), 6 concurrent requests
   (politeness to a small host), a per-request timeout, three attempts per URL, and a runaway ceiling
   (RUNAWAY_URL_CEILING) that only an infinite URL space can reach — reaching it is reported as such,
   never as "complete".

   ⛔ EVIDENCE, NEVER TRUTH. Everything here is "what the public website currently says" — DETECTED,
   never an approved client fact. Every item carries the URL it was read on.
   ⛔ NO MODEL CALLS. Extraction is deterministic; the crawl costs fetches only.

   IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts extension only (CLAUDE.md §4).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { crawlPageKind, visibleText, THIN_WORDS, MAX_CRAWL_PAGES } from './crawlCheck.ts';
import { sameSite } from './crawlUrl.ts';

export type CrawlMode = 'standard' | 'full';

/** The inline (standard) crawl's budget. */
export interface CrawlProfile {
  mode: CrawlMode;
  maxPages: number;
  fetchBudget: number;
  deadlineMs: number;
  sitemapFetches: number;
  concurrency: number;
  fetchTimeoutMs: number;
}

/* ⛔ THE STANDARD PROFILE IS THE BUDGET crawl-check HAS ALWAYS HAD. It runs across the whole outreach
   book and inside the audit-finalise wall clock; nothing in the exhaustive work raises it. */
export const STANDARD_CRAWL: CrawlProfile = {
  mode: 'standard', maxPages: MAX_CRAWL_PAGES, fetchBudget: 22, deadlineMs: 35_000,
  sitemapFetches: 4, concurrency: 6, fetchTimeoutMs: 6_000,
};

/* THE EXHAUSTIVE JOB'S WORKER SETTINGS. None of these limits how much of the site is crawled — they
   govern how each worker tick behaves; the job runs as many ticks as the site needs. */
export const FULL_CRAWL = {
  mode: 'full' as const,
  /** Simultaneous requests to the client's host. Politeness, not a cap. */
  concurrency: 6,
  /** URLs claimed per batch inside a tick. */
  batchSize: 24,
  fetchTimeoutMs: 10_000,
  maxBodyBytes: 1_000_000,
  /** A tick stops claiming new batches after this and hands over to the next tick (platform: an
   *  edge request dies at ~150 s, so a tick leaves room to write its last batch). */
  tickBudgetMs: 100_000,
  /** Batches per tick. Edge functions also meter CPU time, and HTML parsing is the CPU cost; ~60 pages
   *  per request is proven on production (the earlier inline crawl), so a tick stops at this many
   *  batches and hands over. It bounds a TICK, never the crawl. */
  batchesPerTick: 3,
  /** A tick's lease; an expired lease means the worker died and the next tick resumes. */
  leaseMs: 150_000,
  /** Attempts per URL before a network failure / timeout is terminal. */
  maxAttempts: 3,
};
/** ⛔ NOT A PAGE CAP. The number of distinct URLs only an infinite URL space (a trap the classifier
 *  did not recognise) can reach on a small-business site. URLs past it are recorded as skipped with
 *  reason safety_ceiling and the job finishes as complete_with_failures — never "complete". */
export const RUNAWAY_URL_CEILING = 50_000;

export const FULL_CRAWL_EVIDENCE_VERSION = 2;

/** Which profile a request gets. Positive match: only an OPERATOR saying exactly 'full' gets FULL. */
export function resolveCrawlMode(requested: unknown, isOperator: boolean): CrawlMode {
  return isOperator && requested === 'full' ? 'full' : 'standard';
}

/** Where the manual crawl was started — recorded, never used to decide anything. */
export const CRAWL_REQUEST_SOURCES = ['outreach', 'inbox', 'lead_detail', 'paid_client', 'website_build'] as const;
export type CrawlRequestSource = (typeof CRAWL_REQUEST_SOURCES)[number];
export function cleanRequestSource(v: unknown): CrawlRequestSource | null {
  return (CRAWL_REQUEST_SOURCES as readonly string[]).includes(String(v)) ? (v as CrawlRequestSource) : null;
}

/* ── standard-profile helpers (served origin, links, sitemap order) ───────────────────────────── */

export const sameSiteUrl = sameSite;

/** Rewrite a same-site URL onto the SERVED origin (so apex/www twins collapse), hash/query dropped. */
export function toServedUrl(url: string, servedUrl: string): string | null {
  try {
    const u = new URL(url, servedUrl);
    if (!sameSite(u.href, servedUrl)) return null;
    const served = new URL(servedUrl);
    u.protocol = served.protocol; u.host = served.host; u.hash = ''; u.search = '';
    return u.href;
  } catch { return null; }
}

const ASSET = /\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|xml|ico|mp4|mp3|woff2?|ttf|eot|txt|json|rss)$/i;
const NON_PAGE = /\/(?:wp-admin|wp-login\.php|admin|login|logout|cart|basket|checkout|account|my-account|wp-json|feed|xmlrpc\.php|cdn-cgi|_api|_partials)(?:\/|$)/i;
export function isPageUrl(url: string): boolean {
  try { const p = new URL(url).pathname; return !ASSET.test(p) && !NON_PAGE.test(p); } catch { return false; }
}

/** Same-site absolute page URLs from <a href>, on the served origin (standard profile). */
export function internalPageLinks(html: string, pageUrl: string, servedUrl: string): string[] {
  const out = new Set<string>();
  for (const href of rawLinks(html)) {
    let abs = '';
    try { abs = new URL(href, pageUrl).href; } catch { continue; }
    const s = toServedUrl(abs, servedUrl);
    if (s && isPageUrl(s)) out.add(s);
  }
  return [...out];
}

/** Every href on the page, raw (the exhaustive crawl classifies each one itself). */
export function rawLinks(html: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html || '')) !== null) out.push(decode(m[1]));
  return out;
}

/** Sitemap children to read first: a site's own PAGES sitemap before its generated collections. */
export function orderSitemapChildren(children: string[]): string[] {
  const pages = /(?:^|[/_-])pages?[-_]?sitemap|sitemap[-_]pages?|wp-sitemap-posts-page|page-sitemap/i;
  const posts = /post|blog|news|article/i;
  const rank = (u: string) => (pages.test(u) ? 0 : posts.test(u) ? 2 : 1);
  return children.map((u, i) => ({ u, i })).sort((a, b) => rank(a.u) - rank(b.u) || a.i - b.i).map((x) => x.u);
}

/** The page with executable noise removed — scripts (except JSON-LD), styles, SVG, comments. */
export function leanHtml(html: string): string {
  return (html || '')
    .replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/* ── text helpers ─────────────────────────────────────────────────────────────────────────────── */

function decode(s: string): string {
  return s
    .replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"').replace(/&ndash;|&mdash;/gi, '-').replace(/&pound;/gi, '£')
    .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(Number(d)); } catch { return m; } })
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}
const tagText = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const pathKeyOf = (u: string) => { try { return new URL(u).pathname.replace(/\/+$/, '') || '/'; } catch { return u; } };

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
const abs = (href: string, base: string) => { try { return new URL(href, base).href; } catch { return href; } };

/** Raw JSON-LD blocks, as text. */
export function jsonLdBlocks(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html || '')) !== null) out.push(m[1].trim());
  return out;
}
// deno-lint-ignore no-explicit-any
export function jsonLdNodes(html: string): any[] {
  const out: unknown[] = [];
  for (const block of jsonLdBlocks(html)) {
    try {
      const stack = [JSON.parse(block)];
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

/** Whether robots.txt's `User-agent: *` group says `Disallow: /`. */
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

/* ── page families ────────────────────────────────────────────────────────────────────────────── */

export type FullPageFamily = 'homepage' | 'service' | 'location' | 'about' | 'contact' | 'faq' | 'pricing' | 'reviews' | 'gallery' | 'blog' | 'legal' | 'other';

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
  if (/location|areas?-(we-)?(cover|serve)|near-me/.test(p)) return 'location';
  const k = crawlPageKind(url);
  return k === 'other' ? 'other' : k;
}

/* ── ONE PAGE → its stored evidence ───────────────────────────────────────────────────────────── */

export interface PageDigest {
  url: string;
  finalUrl: string;
  status: number;
  family: FullPageFamily;
  title: string;
  description: string;
  canonical: string;
  noindex: boolean;
  robots: string;
  h1: string[];
  h2: string[];
  words: number;
  excerpt: string;
  internalLinks: number;
  schemaTypes: string[];
}

/** One piece of evidence: what was seen, and where. */
export interface Seen { value: string; url: string }

export interface PageBusiness {
  names: string[]; phones: string[]; emails: string[]; addresses: string[]; people: string[];
  credentials: string[]; guarantees: string[]; experience: string[]; prices: string[]; reviews: string[];
  profiles: string[];
  schema: Array<{ types: string[]; name: string; telephone: string; address: string; areaServed: string[] }>;
  logo: string; favicon: string; ogImage: string; siteName: string;
}

/** What one page's crawl_urls row stores. */
export interface PageEvidence {
  d: PageDigest;
  b: PageBusiness;
  /** Readable text (for duplicate detection and reading; capped per page). */
  t: string;
  /** JSON-LD blocks as text (for the domain-conflict analysis), capped. */
  j: string[];
  img: Array<{ src: string; alt: string }>;
  /** Navigation labels + footer text: the homepage only. */
  nav?: Array<{ label: string; url: string }>;
  footer?: string;
}

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
  { name: 'Fully insured', re: /\bfully\s+insured\b|\bpublic\s+liability\b/i },
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
  { name: 'Which? Trusted Traders', host: /(^|\.)which\.co\.uk$/ },
  { name: 'Companies House', host: /(^|\.)(company-information\.service\.gov\.uk|find-and-update\.company-information\.service\.gov\.uk)$/ },
  { name: 'NICEIC', host: /(^|\.)niceic\.com$/ }, { name: 'Gas Safe Register', host: /(^|\.)gassaferegister\.co\.uk$/ },
];

const PHONE_RE = /(?:\+44\s?\(?0?\)?\s?|\b0)(?:\d[\s-]?){9,10}\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const PER_PAGE = 6;
const TEXT_CHARS = 5_000;
const JSONLD_CHARS = 8_000;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\s{2,}|\s[•|]\s/).map((s) => s.trim()).filter((s) => s.length >= 12 && s.length <= 400);
}
const uniq = (xs: string[], n = PER_PAGE) => {
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of xs) { const v = clip(x.replace(/\s+/g, ' ').trim(), 240); const k = v.toLowerCase(); if (v && !seen.has(k)) { seen.add(k); out.push(v); } if (out.length >= n) break; }
  return out;
};
function addressLine(n: { address?: unknown }): string {
  const a = n?.address as Record<string, unknown> | string | undefined;
  if (!a) return '';
  if (typeof a === 'string') return a;
  return ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode'].map((k) => String(a[k] ?? '').trim()).filter(Boolean).join(', ');
}

/** Everything the crawl keeps about ONE page it read. Pure; no I/O. */
export function processPage(p: { url: string; finalUrl: string; status: number; xRobotsTag: string | null; html: string; isHome?: boolean }, homeUrl: string): PageEvidence {
  const html = p.html || '';
  const url = p.finalUrl || p.url;
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? html.slice(0, 60_000);
  const robots = [metaContent(head, 'name', 'robots'), p.xRobotsTag ?? ''].filter(Boolean).join(', ').toLowerCase();
  const text = decode(visibleText(html));
  const canonical = linkHref(head, /(^|\s)canonical(\s|$)/i);
  const nodes = jsonLdNodes(html);
  const links = rawLinks(html);
  const internal = links.filter((h) => sameSite(abs(h, url), homeUrl)).length;
  const d: PageDigest = {
    url: p.url, finalUrl: url, status: p.status, family: fullPageFamily(url, homeUrl),
    title: clip(tagText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? ''), 200),
    description: clip(metaContent(head, 'name', 'description'), 320),
    canonical: canonical ? abs(canonical, url) : '',
    noindex: /noindex|\bnone\b/.test(robots), robots,
    h1: headings(html, 1, 5), h2: headings(html, 2, 12),
    words: text ? text.split(/\s+/).filter(Boolean).length : 0,
    excerpt: clip(text, 700), internalLinks: internal,
    schemaTypes: [...new Set(nodes.flatMap(typesOf))].slice(0, 12),
  };

  const b: PageBusiness = { names: [], phones: [], emails: [], addresses: [], people: [], credentials: [], guarantees: [], experience: [], prices: [], reviews: [], profiles: [], schema: [], logo: '', favicon: '', ogImage: '', siteName: '' };
  if (p.isHome) {
    b.siteName = metaContent(head, 'property', 'og:site_name');
    const icon = linkHref(head, /icon/i);
    b.favicon = icon ? abs(icon, url) : '';
    const og = metaContent(head, 'property', 'og:image');
    b.ogImage = og ? abs(og, url) : '';
  }
  const names: string[] = [], phones: string[] = [], addresses: string[] = [], reviews: string[] = [];
  for (const n of nodes) {
    const types = typesOf(n);
    if (!types.length) continue;
    const name = typeof n.name === 'string' ? n.name.trim() : '';
    const tel = typeof n.telephone === 'string' ? n.telephone.trim() : '';
    const addr = addressLine(n);
    // deno-lint-ignore no-explicit-any
    const area = (Array.isArray(n.areaServed) ? n.areaServed : n.areaServed ? [n.areaServed] : []).map((a: any) => (typeof a === 'string' ? a : String(a?.name ?? ''))).map((s: string) => s.trim()).filter(Boolean).slice(0, 40);
    if (/business|organi[sz]ation|contractor|service|plumber|electrician|locksmith|store|dentist|accounting/i.test(types.join(' '))) {
      if (name) names.push(name);
      if (tel) phones.push(tel);
      if (addr) addresses.push(addr);
      if (b.schema.length < 4 && (name || tel || addr || area.length)) b.schema.push({ types, name, telephone: tel, address: addr, areaServed: area });
      if (!b.logo) b.logo = typeof n.logo === 'string' ? n.logo : (n.logo && typeof n.logo.url === 'string' ? n.logo.url : '');
    }
    if (types.some((t) => /^(Review|AggregateRating)$/i.test(t))) {
      const rating = n.ratingValue ?? n.reviewRating?.ratingValue;
      const count = n.reviewCount ?? n.ratingCount;
      const body = typeof n.reviewBody === 'string' ? n.reviewBody : '';
      reviews.push([rating ? `Rating ${rating}` : '', count ? `${count} reviews` : '', body ? `"${clip(body, 160)}"` : ''].filter(Boolean).join(' · '));
    }
  }
  for (const m of text.match(PHONE_RE) ?? []) phones.push(m.replace(/\s+/g, ' '));
  for (const m of html.match(/href=["']tel:([^"']+)["']/gi) ?? []) phones.push(decode(m.replace(/^href=["']tel:/i, '').replace(/["']$/, '')));
  const emails = [
    ...(html.match(/mailto:([^"'?]+)/gi) ?? []).map((x) => x.replace(/^mailto:/i, '')),
    ...(text.match(EMAIL_RE) ?? []).filter((m) => !/\.(png|jpe?g|gif|webp|svg)$/i.test(m) && !/wixpress|sentry|example\./i.test(m)),
  ];
  const people: string[] = [], guarantees: string[] = [], experience: string[] = [], prices: string[] = [];
  for (const s of sentences(text)) {
    if (UK_POSTCODE.test(s) && s.length < 160 && /\d/.test(s)) addresses.push(s);
    if (/\b(?:owner|founder|director|proprietor|my name is|run by|family[- ]run)\b/i.test(s)) people.push(s);
    if (/\bguarantee[ds]?\b|\bwarrant(?:y|ies|ied)\b|\bno fix,? no fee\b|\bmoney[- ]back\b/i.test(s)) guarantees.push(s);
    if (/\b\d{1,2}\+?\s*(?:years?|yrs)\b[^.]{0,40}\b(?:experience|trading|established|in business|serving)\b|\b(?:established|est\.?|since|founded)\s+(?:in\s+)?(?:19|20)\d{2}\b/i.test(s)) experience.push(s);
    if (/£\s?\d/.test(s)) prices.push(s);
    if (/\b(?:testimonial|would highly recommend|highly recommended|5 stars?|five stars?)\b|★/i.test(s)) reviews.push(s);
  }
  const creds: string[] = [];
  for (const c of CREDENTIALS) {
    const m = c.re.exec(text);
    if (m) creds.push(`${c.name} — "${clip(text.slice(Math.max(0, m.index - 80), m.index + 120).replace(/\s+/g, ' ').trim(), 200)}"`);
  }
  const profiles: string[] = [];
  for (const h of links) {
    if (!/^https?:\/\//i.test(h) || sameSite(h, homeUrl)) continue;
    let host = '';
    try { host = new URL(h).hostname.toLowerCase(); } catch { continue; }
    const hit = THIRD_PARTY.find((t) => t.host.test(host));
    if (hit) profiles.push(`${hit.name}: ${h}`);
  }
  const img: Array<{ src: string; alt: string }> = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (img.length >= 20) break;
    const src = /\s(?:data-)?src=["']([^"']+)["']/i.exec(m[0])?.[1] ?? '';
    if (!src || src.startsWith('data:')) continue;
    const alt = decode(/\salt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? '').trim();
    const a = abs(src, url);
    if (!b.logo && /logo/i.test(src + ' ' + alt + ' ' + m[0])) b.logo = a;
    if (!img.some((i) => i.src === a)) img.push({ src: a, alt: clip(alt, 120) });
  }
  if (b.logo) b.logo = abs(b.logo, url);
  Object.assign(b, {
    names: uniq(names), phones: uniq(phones), emails: uniq(emails), addresses: uniq(addresses), people: uniq(people),
    credentials: uniq(creds, 12), guarantees: uniq(guarantees), experience: uniq(experience), prices: uniq(prices, 10),
    reviews: uniq(reviews), profiles: uniq(profiles, 12),
  });

  const ev: PageEvidence = { d, b, t: text.slice(0, TEXT_CHARS), j: [], img };
  let jsonBudget = JSONLD_CHARS;
  for (const block of jsonLdBlocks(html)) { if (block.length > jsonBudget) break; ev.j.push(block); jsonBudget -= block.length; }
  if (p.isHome) {
    const navHtml = [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)].map((m) => m[1]).join(' ') || (/<header\b[^>]*>([\s\S]*?)<\/header>/i.exec(html)?.[1] ?? '');
    const nav: Array<{ label: string; url: string }> = [];
    for (const m of navHtml.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = clip(tagText(m[2]), 80);
      const u = abs(m[1], url);
      if (label && !nav.some((n) => n.url === u) && nav.length < 60) nav.push({ label, url: u });
    }
    ev.nav = nav;
    ev.footer = clip(tagText(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i.exec(html)?.[1] ?? ''), 800);
  }
  return ev;
}

/** A tiny HTML stand-in rebuilt from stored evidence, for the analysers that read markup
 *  (siteEvidence, siteInfo). It carries only what was stored: title, canonical, robots, JSON-LD. */
export function syntheticHtml(ev: Pick<PageEvidence, 'd' | 'j'> | null | undefined): string {
  if (!ev?.d) return '';
  const esc = (s: string) => s.replace(/"/g, '&quot;');
  return `<html><head><title>${ev.d.title}</title>`
    + (ev.d.canonical ? `<link rel="canonical" href="${esc(ev.d.canonical)}">` : '')
    + (ev.d.robots ? `<meta name="robots" content="${esc(ev.d.robots)}">` : '')
    + (ev.j ?? []).map((j) => `<script type="application/ld+json">${j}</script>`).join('')
    + `</head><body>${(ev.d.h1 ?? []).map((h) => `<h1>${h}</h1>`).join('')}</body></html>`;
}

/* ── the crawl-wide summary ───────────────────────────────────────────────────────────────────── */

export type CrawlCompleteness = 'complete' | 'complete_with_failures' | 'failed';

export interface FullCrawlEvidence {
  version: number;
  mode: 'full';
  job_id?: string | null;
  limits: { concurrency: number; fetchTimeoutMs: number; maxBodyBytes: number; maxAttempts: number; runawayCeiling: number };
  stats: {
    urlsDiscovered: number;
    /** Pages that reached a terminal state by being requested (done + failed). */
    pagesFetched: number;
    pagesOk: number;
    failed: number;
    skipped: number;
    skippedByReason: Record<string, number>;
    failedByStatus: Record<string, number>;
    sitemapsRead: number;
    ms: number;
    ticks: number;
    hitRunawayCeiling: boolean;
  };
  completeness: CrawlCompleteness;
  warnings: string[];
  servedUrl: string;
  requestedUrl: string;
  redirectedFrom: string | null;
  robots: { found: boolean; sitemaps: string[]; disallowsAll: boolean; excerpt: string };
  sitemaps: { read: number; urlCount: number; offSiteCount: number; offSiteSamples: string[] };
  families: Array<{ family: FullPageFamily; count: number; examples: string[] }>;
  navigation: Array<{ label: string; url: string }>;
  footerExcerpt: string;
  business: {
    names: Seen[]; phones: Seen[]; emails: Seen[]; addresses: Seen[]; people: Seen[]; credentials: Seen[];
    guarantees: Seen[]; experience: Seen[]; prices: Seen[]; reviews: Seen[]; profiles: Seen[];
    logo: string; favicon: string; ogImage: string;
    schema: Array<{ types: string[]; name: string; telephone: string; address: string; areaServed: string[]; url: string }>;
    /** How many pages each kind of evidence was seen on — the summary lists examples, the inventory
     *  holds every page's own list. */
    pagesWith: Record<string, number>;
  };
  /** Each finding with its full page count; `urls` lists examples, the inventory holds all. */
  technical: Array<{ kind: string; detail: string; count: number; urls: string[] }>;
}

export interface StoredCrawlRow {
  url: string;
  status: string;
  skip_reason?: string | null;
  http_status?: number | null;
  final_url?: string | null;
  source?: string | null;
  evidence?: Pick<PageEvidence, 'd' | 'b' | 'nav' | 'footer'> | null;
}

const SUMMARY_SEEN = 40;
const TECH_EXAMPLES = 40;

/** The summary of a finished job, from its page rows (paged in by the caller). Pure. */
export function summariseCrawlRows(input: {
  rows: StoredCrawlRow[];
  requestedUrl: string;
  servedUrl: string;
  robotsTxt: string | null;
  sitemapsRead: number;
  offSiteSitemapLocs: { count: number; samples: string[] };
  sitemapUrlCount: number;
  ms: number;
  ticks: number;
  jobId?: string | null;
}): FullCrawlEvidence {
  const { rows, servedUrl } = input;
  const done = rows.filter((r) => r.status === 'done');
  const failed = rows.filter((r) => r.status === 'failed');
  const skipped = rows.filter((r) => r.status === 'skipped');
  const skippedByReason: Record<string, number> = {};
  for (const r of skipped) skippedByReason[r.skip_reason || 'unknown'] = (skippedByReason[r.skip_reason || 'unknown'] ?? 0) + 1;
  const failedByStatus: Record<string, number> = {};
  for (const r of failed) { const k = r.http_status ? String(r.http_status) : 'no response'; failedByStatus[k] = (failedByStatus[k] ?? 0) + 1; }
  const pages = done.map((r) => r.evidence?.d).filter((d): d is PageDigest => !!d);
  const home = done.find((r) => r.evidence?.nav) ?? null;

  const famMap = new Map<FullPageFamily, string[]>();
  for (const r of rows) {
    if (r.status === 'skipped') continue;
    const u = r.final_url || r.url;
    const f = r.evidence?.d?.family ?? fullPageFamily(u, servedUrl);
    (famMap.get(f) ?? famMap.set(f, []).get(f)!).push(u);
  }
  const families = [...famMap.entries()].map(([family, urls]) => ({ family, count: urls.length, examples: urls.slice(0, 5) })).sort((a, b) => b.count - a.count);

  const keys = ['names', 'phones', 'emails', 'addresses', 'people', 'credentials', 'guarantees', 'experience', 'prices', 'reviews', 'profiles'] as const;
  const business = {
    names: [], phones: [], emails: [], addresses: [], people: [], credentials: [], guarantees: [], experience: [], prices: [], reviews: [], profiles: [],
    logo: '', favicon: '', ogImage: '', schema: [], pagesWith: {},
  } as FullCrawlEvidence['business'];
  const seen: Record<string, Set<string>> = {};
  for (const r of done) {
    const b = r.evidence?.b;
    if (!b) continue;
    const url = r.final_url || r.url;
    for (const k of keys) {
      const list = b[k] ?? [];
      if (list.length) business.pagesWith[k] = (business.pagesWith[k] ?? 0) + 1;
      const s = (seen[k] ??= new Set());
      // Credentials are keyed by the body's name, so one NICEIC mention is not forty.
      for (const v of list) {
        const key = k === 'credentials' ? v.split(' — ')[0].toLowerCase() : v.toLowerCase();
        if (s.has(key) || business[k].length >= SUMMARY_SEEN) continue;
        s.add(key); business[k].push({ value: v, url });
      }
    }
    if (b.siteName && !business.names.some((n) => n.value.toLowerCase() === b.siteName.toLowerCase())) business.names.unshift({ value: b.siteName, url });
    business.logo ||= b.logo; business.favicon ||= b.favicon; business.ogImage ||= b.ogImage;
    for (const sc of b.schema ?? []) if (business.schema.length < 10) business.schema.push({ ...sc, url });
  }

  const technical: FullCrawlEvidence['technical'] = [];
  const add = (kind: string, detail: string, urls: string[]) => { if (urls.length) technical.push({ kind, detail, count: urls.length, urls: urls.slice(0, TECH_EXAMPLES) }); };
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
  add('canonical_off_site', 'Page names a different website as its main (canonical) version.', ok.filter((p) => p.canonical && !sameSite(p.canonical, servedUrl)).map((p) => `${p.finalUrl} → ${p.canonical}`));
  add('broken', 'Page answered with an error status.', failed.filter((r) => r.http_status).map((r) => `${r.url} (${r.http_status})`));
  add('unreachable', 'Page did not answer (timeout / connection failure) after retries.', failed.filter((r) => !r.http_status).map((r) => r.url));
  add('redirected', 'Address redirects to a different page.', rows.filter((r) => r.status === 'done' && r.final_url && pathKeyOf(r.final_url) !== pathKeyOf(r.url)).map((r) => `${r.url} → ${r.final_url}`));
  add('removed', 'Was on the previous crawl, no longer exists.', skipped.filter((r) => r.skip_reason === 'removed_since_last_crawl').map((r) => r.url));
  if (input.offSiteSitemapLocs.count) technical.push({ kind: 'sitemap_off_site', detail: 'Sitemap lists addresses on a different website.', count: input.offSiteSitemapLocs.count, urls: input.offSiteSitemapLocs.samples.slice(0, TECH_EXAMPLES) });
  if (!input.sitemapsRead) technical.push({ kind: 'no_sitemap', detail: 'No XML sitemap was found (robots.txt and /sitemap.xml checked).', count: 0, urls: [] });
  if (!input.robotsTxt) technical.push({ kind: 'no_robots', detail: 'No robots.txt was found.', count: 0, urls: [] });
  add('no_schema_home', 'The homepage carries no structured data (JSON-LD).', ok.filter((p) => p.family === 'homepage' && p.schemaTypes.length === 0).map((p) => p.finalUrl));

  const hitRunawayCeiling = (skippedByReason.safety_ceiling ?? 0) > 0;
  const warnings: string[] = [];
  if (failed.length) warnings.push(`${failed.length} page(s) could not be read (${Object.entries(failedByStatus).map(([k, v]) => `${v} × ${k}`).join(', ')}).`);
  if (hitRunawayCeiling) warnings.push(`The site produced more than ${RUNAWAY_URL_CEILING.toLocaleString('en-GB')} distinct addresses — an endless URL space. ${skippedByReason.safety_ceiling} were recorded but not crawled.`);
  const homeOk = !!home;
  const completeness: CrawlCompleteness = !homeOk && done.length === 0 ? 'failed'
    : (failed.length > 0 || hitRunawayCeiling) ? 'complete_with_failures' : 'complete';
  if (!homeOk) warnings.unshift('The homepage could not be read.');

  const robotsBody = input.robotsTxt ?? '';
  const redirectedFrom = (() => { try { return new URL(input.requestedUrl).host !== new URL(servedUrl).host ? input.requestedUrl : null; } catch { return null; } })();
  return {
    version: FULL_CRAWL_EVIDENCE_VERSION, mode: 'full', job_id: input.jobId ?? null,
    limits: { concurrency: FULL_CRAWL.concurrency, fetchTimeoutMs: FULL_CRAWL.fetchTimeoutMs, maxBodyBytes: FULL_CRAWL.maxBodyBytes, maxAttempts: FULL_CRAWL.maxAttempts, runawayCeiling: RUNAWAY_URL_CEILING },
    stats: {
      urlsDiscovered: rows.length, pagesFetched: done.length + failed.length, pagesOk: done.length,
      failed: failed.length, skipped: skipped.length, skippedByReason, failedByStatus,
      sitemapsRead: input.sitemapsRead, ms: input.ms, ticks: input.ticks, hitRunawayCeiling,
    },
    completeness, warnings, servedUrl, requestedUrl: input.requestedUrl, redirectedFrom,
    robots: { found: !!robotsBody, sitemaps: [...robotsBody.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]).slice(0, 20), disallowsAll: robotsDisallowsAll(robotsBody), excerpt: clip(robotsBody.trim(), 800) },
    sitemaps: { read: input.sitemapsRead, urlCount: input.sitemapUrlCount, offSiteCount: input.offSiteSitemapLocs.count, offSiteSamples: input.offSiteSitemapLocs.samples.slice(0, 20) },
    families, navigation: home?.evidence?.nav ?? [], footerExcerpt: home?.evidence?.footer ?? '', business, technical,
  };
}

/* ── the canonical row: may this crawl replace the one stored? ────────────────────────────────── */

/** ⛔ AN AUTOMATED STANDARD CRAWL NEVER OVERWRITES A FRESH FULL ONE. A full crawl always replaces; a
 *  standard one replaces anything except a full crawl younger than freshMs. */
export function mayReplaceLeadCrawl(existing: { mode?: string | null; created_at?: string | null } | null | undefined, incoming: CrawlMode, nowMs: number, freshMs: number): boolean {
  if (incoming === 'full') return true;
  if (!existing || existing.mode !== 'full') return true;
  const t = Date.parse(String(existing.created_at ?? ''));
  return !Number.isFinite(t) || nowMs - t >= freshMs;
}
