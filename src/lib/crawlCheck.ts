/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE CRAWLABILITY CHECK — the pure, deterministic analysis (Paul, 2026-09-16).

   The point: name a prospect's ACTUAL crawlability fault in the outreach message, for the price of a
   fetch — never the Apify SEO scanner (5.6p, off for outreach). The edge function `crawl-check` does
   the fetching (the homepage as each AI SEARCH crawler, robots.txt for sitemap discovery, the
   sitemap(s), and a bounded sample of pages); THIS file turns those raw strings into signals and a
   paste-ready verdict.

   ⚠️ THIS HEADER SAID "homepage as GPTBot" UNTIL 2026-09-22 AND IT WAS NEVER TRUE OF THE REWRITTEN
   FUNCTION. GPTBot is a TRAINING crawler; testing it was the bug the search/training split below
   exists to fix, and the edge deliberately does not send it. It also said robots.txt was fetched
   during the months it was not. Both corrected — a stale comment is a load-bearing bug (CLAUDE.md
   §4) and these two had already been read back as a description of what runs.

   ⚠️ AND UNTIL 2026-10-26 IT SAID THE HOMEPAGE WAS FETCHED "AS EACH AI SEARCH CRAWLER" — and that was
   the bug behind every false "AI can't reach your site": a firewall refuses an impostor using a known
   bot's name, so our fake OAI-SearchBot was refused where the real one gets in (drivewelluk.co.uk).
   Every page is now read once, under our own honest name (siteReadIdentity.ts). A crawler is called
   BLOCKED only when robots.txt names it and disallows the site (robotsSearchBlocked); a homepage we
   could not read is "couldn't check", never a finding (fix/crawl-one-standard).

   ⛔ PURE. No fetch, no DOM, no platform globals — it runs in the edge function (Deno) AND in the
   test (Node/tsx), and is imported by the edge with a relative `.ts` path (CLAUDE.md §3). Every
   threshold is a named const so a tuning change is one line, not a scattered magic number.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { robotsAllows, robotsRulesFor } from './crawlUrl.ts';

/** Below this many characters of crawler-visible text, a page says almost nothing to AI. The real
 *  case that motivated this: 69 characters served to GPTBot against 7,153 rendered in a browser. */
export const MIN_TEXT_CHARS = 500;
/** Under this, the page is effectively EMPTY to a crawler whatever else is true — flag outright. */
export const EMPTY_TEXT_CHARS = 200;
/** A cluster of at least this many same-pattern pages, this similar, is the duplicate-page fault. */
export const DUP_MIN_CLUSTER = 3;
export const DUP_SIMILARITY = 0.90;      // 0..1; reported as a percentage
/** A service/content page thinner than this (words of visible text) is "thin". */
export const THIN_WORDS = 120;
/** Homepage plus at most this many same-domain internal pages are fetched per crawl.
 *  ⚠️ 8 → 12 on 2026-09-22 for the deep sales crawl: the domain findings need a services index, a
 *  couple of service pages, a locations page and contact/about to have anything to read, and at 8
 *  the location cluster was crowding the rest out. Twelve is still a STRUCTURE crawl, not a forensic
 *  one — a 300-page site costs the same twelve as a twelve-page site. The edge function holds the
 *  outer ceilings (total fetches, wall clock, bytes per body); this is only the page count. */
export const MAX_CRAWL_PAGES = 12;

/** Bump only when a stored fault's meaning changes. v2 is the search-crawler rewrite; the bounded
 * page evidence added later is additive, so valid existing v2 findings remain usable. */
export const CRAWL_CHECK_VERSION = 2;

/* ⛔ TWO KINDS OF AI CRAWLER, AND ONLY ONE IS THE FAULT (Paul, 2026-09-16, tested on mc-locksmiths).
   SEARCH crawlers fetch a page when a person asks ChatGPT / Claude / Perplexity a question — these
   decide whether a business gets NAMED, and a block on them is the real problem. TRAINING crawlers
   (GPTBot, ClaudeBot, CCBot) scrape for model training; blocking them is a common, legitimate choice
   that does NOT stop a business being cited, so it is never a headline.
   These are the robots.txt tokens checked, and the names the report uses. We never fetch AS them
   (2026-10-26, see the header): only robots.txt can say one of them is shut out. */
export const SEARCH_CRAWLER_LABELS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot'] as const;

/** A Cloudflare / bot-challenge interstitial — the site refused OUR check even when it comes back
 *  200. The edge also checks the status and the cf-mitigated header; this is the body-marker half.
 *  ⛔ It says nothing about any AI crawler: it is the reason the check could not read the page. */
export function looksChallenged(body: string): boolean {
  return /__cf_chl_|cf_chl_opt|cf-browser-verification|just a moment|attention required|enable javascript and cookies/i.test((body || '').slice(0, 4000));
}

/** Did one read of a page give us the page? Not when the status is an error (4xx/5xx), the firewall
 *  flagged a challenge, the body is a challenge, or nothing came back. Pure, so the quick check and the
 *  deep crawl's homepage decide it the same way. */
export function pageReadable(r: { status: number; cfMitigated?: boolean; body: string }): boolean {
  return r.status >= 200 && r.status < 400 && !r.cfMitigated && !looksChallenged(r.body) && (r.body || '').trim().length > 0;
}

/** Where a stored `searchBlocked` came from. Only `'robots'` may be believed: rows written before
 *  2026-10-26 (no marker) filled it from our own refused impostor fetches. */
export const BLOCK_EVIDENCE_ROBOTS = 'robots' as const;

/** The AI search crawlers robots.txt shuts out of the WHOLE site (the homepage disallowed for that
 *  crawler, by its own group or by `User-agent: *`). ⛔ The only evidence a crawler is blocked: a
 *  refused fetch of ours is not (the header). Pages-only rules are the deep audit's own finding. */
export function robotsSearchBlocked(robotsTxt: string | null | undefined): string[] {
  if (!robotsTxt) return [];
  return SEARCH_CRAWLER_LABELS.filter((token) => !robotsAllows(robotsRulesFor(robotsTxt, token).rules, '/'));
}

/** The crawlers a stored signal may SAY are blocked: its list when it was read from robots.txt, else
 *  nothing (an older row's list came from our own refused fetches and is not evidence). Every reader
 *  goes through this. */
export function verifiedSearchBlocked(s: { searchBlocked?: string[] | null; blockEvidence?: string | null } | null | undefined): string[] {
  if (!s || s.blockEvidence !== BLOCK_EVIDENCE_ROBOTS) return [];
  return Array.isArray(s.searchBlocked) ? s.searchBlocked.filter((x): x is string => typeof x === 'string') : [];
}

/* ── visible text ─────────────────────────────────────────────────────────────────────────────── */

/** The text a crawler actually reads: raw HTML with scripts/styles/comments removed, tags stripped,
 *  a few common entities decoded, whitespace collapsed. Deliberately crude — we are measuring HOW
 *  MUCH readable text there is, not rendering it. */
export function visibleText(html: string): string {
  return (html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(?:lt|gt|quot|#39|apos);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** An empty framework mount point — the tell of a client-rendered app shell. Matches
 *  <div id="root"></div> / id="app" / id="__next" with only whitespace inside. */
const APP_SHELL = /<div\s+id=["'](?:root|app|__next|__nuxt|q-app)["'][^>]*>\s*<\/div>/i;

export interface ClientRenderResult {
  flagged: boolean;
  visibleChars: number;
  htmlBytes: number;
  appShell: boolean;
}

/** Is this page client-rendered — i.e. does a JS-less crawler see almost nothing? Two ways to be
 *  sure without running a browser: an empty app-shell div with little text, or so little text that
 *  the page is empty to a crawler regardless. We report the crawler-visible char count either way —
 *  that number IS the fault, and it is free. */
export function detectClientRendered(html: string): ClientRenderResult {
  const text = visibleText(html);
  const visibleChars = text.length;
  const htmlBytes = (html || '').length;
  const appShell = APP_SHELL.test(html || '');
  const flagged =
    (visibleChars < EMPTY_TEXT_CHARS && htmlBytes > 800) ||       // effectively empty to a crawler
    (appShell && visibleChars < MIN_TEXT_CHARS);                  // app shell + no real content
  return { flagged, visibleChars, htmlBytes, appShell };
}

export function hasH1(html: string): boolean {
  return /<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html || '');
}

export function hasJsonLd(html: string): boolean {
  return /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i.test(html || '');
}

export function wordCount(html: string): number {
  const t = visibleText(html);
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

/* ── robots.txt is NOT evidence ───────────────────────────────────────────────────────────────────
   Removed 2026-09-16. A site can say "ChatGPT-User: Allow" in robots.txt and still block it at the
   edge (Cloudflare, WAF). Only the ACTUAL FETCH counts — the edge function fetches the homepage as
   each SEARCH crawler and records which are blocked (searchBlocked). robots parsing is gone. */

/* ── sitemap + URL clustering (bounds the fetch count) ─────────────────────────────────────────── */

/** <loc> values from a sitemap or sitemap index. Also flags whether this WAS an index (so the
 *  caller can fetch one child sitemap). Pure regex — sitemaps are simple and we only need the URLs. */
export function extractSitemapLocs(xml: string): { locs: string[]; isIndex: boolean } {
  const isIndex = /<sitemapindex[\s>]/i.test(xml || '');
  const locs: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml || '')) !== null) locs.push(m[1].trim());
  return { locs, isIndex };
}

export type CrawlPageKind = 'service' | 'location' | 'about' | 'contact' | 'other';

/** Classify a URL only for operator display and bounded-crawl prioritisation. */
export function crawlPageKind(url: string): CrawlPageKind {
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); } catch { return 'other'; }
  if (/(?:service|services|what-we-do|solution|repair|installation)/.test(path)) return 'service';
  if (/(?:location|areas?|coverage|town|city|region)/.test(path)) return 'location';
  if (/(?:about|team|company|our-story)/.test(path)) return 'about';
  if (/(?:contact|enquir|quote|book)/.test(path)) return 'contact';
  return 'other';
}

/** A deterministic same-domain page set. Assets and transactional/admin paths are excluded;
 * service, location, about and contact pages are considered before other internal links. */
export function selectCrawlUrls(urls: string[], homeUrl: string, limit = MAX_CRAWL_PAGES): string[] {
  let origin = '';
  try { origin = new URL(homeUrl).origin; } catch { return []; }
  const ignore = /\/(?:wp-admin|admin|login|logout|cart|checkout|account|my-account|wp-json)(?:\/|$)|\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|xml|ico|mp4|mp3)$/i;
  const unique = new Map<string, { url: string; score: number; index: number }>();
  urls.forEach((raw, index) => {
    try {
      const u = new URL(raw, origin);
      if (u.origin !== origin || !/^https?:$/.test(u.protocol) || ignore.test(u.pathname)) return;
      u.hash = ''; u.search = '';
      const normal = u.href.replace(/\/$/, '') || u.origin;
      if (normal === homeUrl.replace(/\/$/, '')) return;
      const kind = crawlPageKind(normal);
      const score = kind === 'service' || kind === 'location' ? 3 : kind === 'about' || kind === 'contact' ? 2 : 1;
      if (!unique.has(normal)) unique.set(normal, { url: normal, score, index });
    } catch { /* skip malformed URLs */ }
  });
  const sorted = [...unique.values()].sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: typeof sorted = [];
  // Preserve breadth first: one of each meaningful page kind where the site exposes one.
  for (const kind of ['service', 'location', 'about', 'contact'] as CrawlPageKind[]) {
    const found = sorted.find((x) => crawlPageKind(x.url) === kind);
    if (found) selected.push(found);
  }
  for (const candidate of sorted) {
    if (selected.length >= Math.max(0, limit)) break;
    if (!selected.some((x) => x.url === candidate.url)) selected.push(candidate);
  }
  return selected.slice(0, Math.max(0, limit)).map((x) => x.url);
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Normalise a URL path into a PATTERN key that collapses templated location pages onto one key,
 *  so `/emergency-electrician-leeds` and `/emergency-electrician-york` cluster together.
 *
 *  ⛔ THE TOWN IS THE VARIABLE, AND WE DON'T KNOW EVERY TOWN — only the lead's. So beyond stripping
 *  the lead's own town, the LAST hyphen-token of the page slug is dropped as the variable part
 *  (location pages are "<service-stem>-<town>"). That can over-cluster two genuinely different
 *  services onto one stem ("boiler-repair" / "boiler-service" → "boiler"), but that is deliberately
 *  safe: clustering only SELECTS which pages to sample, and the 90% CONTENT-similarity gate is what
 *  actually declares a duplicate — distinct pages that happen to share a stem never pass it. */
export function patternKey(url: string, town?: string | null): string {
  let path = url;
  try { path = new URL(url).pathname; } catch { /* keep raw */ }
  const segs = path.toLowerCase().replace(/\/+$/, '').replace(/^\/+/, '').split('/').filter(Boolean);
  if (!segs.length) return '';
  const parent = segs.slice(0, -1).join('/');
  const rawSlug = segs[segs.length - 1].replace(/[^a-z0-9-]+/g, '-');
  let slug = rawSlug;
  const t = (town || '').trim().toLowerCase();
  if (t) for (const tok of t.split(/[^a-z0-9]+/).filter((x) => x.length > 2)) {
    slug = slug.replace(new RegExp(`\\b${reEsc(tok)}\\b`, 'g'), '');
  }
  const townWasStripped = slug !== rawSlug;
  slug = slug.replace(/\d+/g, '#').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const parts = slug.split('-').filter(Boolean);
  /* The lead's own town was already removed above. For pages of OTHER towns (which we can't name),
     drop the trailing slug token as the variable part — location slugs end in the town. Never both,
     or the lead's own page would lose an extra real token and miss its own cluster. */
  const stem = (!townWasStripped && parts.length >= 2) ? parts.slice(0, -1).join('-') : parts.join('-');
  return [parent, stem].filter(Boolean).join('/');
}

/** Cluster URLs by their pattern key, biggest cluster first. Single-page clusters are dropped —
 *  a duplicate problem needs a repeated template. */
export function clusterUrls(urls: string[], town?: string | null): Array<{ pattern: string; urls: string[] }> {
  const m = new Map<string, string[]>();
  for (const u of urls) {
    const k = patternKey(u, town);
    if (!k) continue;
    (m.get(k) ?? m.set(k, []).get(k)!).push(u);
  }
  return [...m.entries()]
    .map(([pattern, us]) => ({ pattern, urls: us }))
    .filter((c) => c.urls.length >= 2)
    .sort((a, b) => b.urls.length - a.urls.length);
}

/** Similarity of two pages' crawler-visible text after stripping the town and digits, as a 0..1
 *  ratio. Trigram (shingle) Jaccard: robust to reordering and to the town being swapped, which is
 *  exactly how templated location pages differ. */
export function pageSimilarity(htmlA: string, htmlB: string, town?: string | null): number {
  const norm = (html: string) => {
    let t = visibleText(html).toLowerCase();
    const tw = (town || '').trim().toLowerCase();
    if (tw) for (const tok of tw.split(/[^a-z0-9]+/).filter((x) => x.length > 2)) {
      t = t.replace(new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
    }
    return t.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
  };
  const shingles = (s: string): Set<string> => {
    const words = s.split(' ').filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i + 3 <= words.length; i++) set.add(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]);
    if (!set.size && words.length) set.add(words.join(' '));
    return set;
  };
  const a = shingles(norm(htmlA));
  const b = shingles(norm(htmlB));
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);   // Jaccard
}

/* ── the verdict ──────────────────────────────────────────────────────────────────────────────── */

export interface CrawlSignals {
  homeUrl: string;
  /* We could not read the homepage (no answer, an error status, a challenge page) → "couldn't check",
     the section hidden, nothing said about the site. Since 2026-10-26 a refusal counts too; an older
     row marked a refusal by readableAs null instead (crawlUnreadable reads both). */
  fetchFailed: boolean;
  /* SEARCH crawlers robots.txt shuts out of the whole site (robotsSearchBlocked) — the crawlers that
     fetch a page when someone asks an AI. Read it through verifiedSearchBlocked: before 2026-10-26 it
     was filled from our own refused fetches, which prove nothing (no blockEvidence marker). */
  searchBlocked: string[];
  /** 'robots' on every row written since 2026-10-26; absent = an older, unverified searchBlocked. */
  blockEvidence?: typeof BLOCK_EVIDENCE_ROBOTS;
  /* Who read the homepage (SITE_CHECK_READ_AS; older rows: a search crawler's name). Null = nobody
     could, so the content signals below are withheld — never "client-rendered" off a block page. */
  readableAs: string | null;
  clientRendered: ClientRenderResult | null;
  missingH1: boolean;
  noJsonLd: boolean;
  duplicates: { clusterSize: number; sampleSize: number; similarityPct: number } | null;
  thinPages: number;                // count of sampled service pages under THIN_WORDS
  /** Bounded page-level evidence for the operator; absent on pre-v3 stored checks. */
  pagesChecked?: number;
  checkedPages?: Array<{ url: string; kind: CrawlPageKind; words: number; hasH1: boolean; readable: boolean }>;
  thinPageUrls?: string[];
}

export interface CrawlVerdict {
  ok: boolean;                       // false when we couldn't read the site at all
  headline: string;                  // the ONE problem to lead the message with
  problems: string[];                // every problem found, each a paste-ready sentence
}

/** A fault line for the report's "What's stopping AI reading your site" section: a short title, a
 *  detail that CARRIES ITS SPECIFIC NUMBER, and `minor` (amber dot) for the structured-data gap —
 *  everything else is a real fault (red dot). Paul, 2026-09-16. */
export interface CrawlFault {
  title: string; detail: string; minor: boolean;
  /** WHICH check produced the line — a stable key, so a surface can include or exclude a finding by
   *  what it IS, never by its wording (2026-10-06). */
  kind: CrawlFaultKind;
}
export type CrawlFaultKind = 'search_blocked' | 'client_rendered' | 'duplicates' | 'thin_pages' | 'missing_h1' | 'no_structured_data';

/** The GENERIC structured-data gap: the site simply carries no schema. Kept for every surface that
 *  shows the crawl (the Crawl button, full and older reports, rebuild context), but it does NOT
 *  qualify for the six-answer prospect hook report (Paul, 2026-10-06): our own testing recorded that
 *  schema did not change the measured AI outcome (CLAUDE.md §5), so its absence alone is not a
 *  defensible reason AI did not name someone. A genuinely MISLEADING schema finding is a different
 *  thing and is not this kind — the deep-crawl evidence's `schema_wrong_domain` ("Your business
 *  details point at a different website") still qualifies. One rule, read by the quick report only. */
export function isGenericSchemaGap(f: Pick<CrawlFault, 'kind'>): boolean {
  return f.kind === 'no_structured_data';
}

/** Turn the signals into report fault lines, worst first, capped so the section stays short. Returns
 *  [] when the site couldn't be read — the caller then renders NO section (Paul's rule). Each detail
 *  is that lead's real number, never a generic phrase. */
export function buildFaultLines(s: CrawlSignals): CrawlFault[] {
  if (crawlUnreadable(s)) return [];   // couldn't check — nothing is said about the site (Paul's rule)
  const out: CrawlFault[] = [];
  /* ⛔ THE HEADLINE WHEN IT IS TRUE: robots.txt shuts an AI SEARCH crawler out of the site. These
     fetch a page when someone asks ChatGPT / Claude / Perplexity. A GPTBot-only (training) rule is
     never here. Only a robots.txt rule says this (verifiedSearchBlocked), never a refused fetch. */
  const blocked = verifiedSearchBlocked(s);
  if (blocked.length) out.push({
    title: "Your site tells AI search tools not to read it",
    detail: `Your robots.txt tells ${blocked.join(", ")} not to read your site — and ${blocked.length === 1 ? "that is a crawler" : "those are the crawlers"} AI search tools use to read a site when someone asks about you.`, minor: false, kind: 'search_blocked' });
  if (s.clientRendered?.flagged) out.push({
    title: "AI can’t read your homepage",
    detail: `Only about ${s.clientRendered.visibleChars} characters reach a crawler — the rest loads with JavaScript, which AI doesn’t run.`, minor: false, kind: 'client_rendered' });
  if (s.duplicates) out.push({
    title: "Your pages are too similar",
    detail: `${s.duplicates.clusterSize} near-identical pages, ${s.duplicates.similarityPct}% the same. AI reads them as one.`, minor: false, kind: 'duplicates' });
  if (s.thinPages > 0) out.push({
    title: "There isn’t enough on your pages",
    detail: `${s.thinPages} page${s.thinPages === 1 ? "" : "s"} under ${THIN_WORDS} words. Not enough for AI to quote you from.`, minor: false, kind: 'thin_pages' });
  if (s.missingH1) out.push({
    title: "Your pages have no clear heading",
    detail: `No H1 heading, so AI has no plain statement of what the page is about.`, minor: false, kind: 'missing_h1' });
  if (s.noJsonLd) out.push({
    title: "Your site doesn’t label the basics",
    detail: `No structured data — nothing tells AI what you do, where you are, or how to reach you.`, minor: true, kind: 'no_structured_data' });
  return out.slice(0, 4);
}

/** How long a stored crawl check counts as current. A stale check describes a site as it was, so the
 *  fault gate and the report both ignore it past this. */
export const CRAWL_FRESH_MS = 30 * 86_400_000;

/** The AI-visibility faults a STORED crawl row currently carries — the ONE rule the report's fault
 *  section, the audit_followup_fault gate and the Crawl-site button's fault dot all read, so they can
 *  never disagree. Applies the same fresh + v2 gate render-audit-report applies: a stale or pre-v2
 *  row (which can carry a false finding) yields no faults. Returns [] rather than throwing on a
 *  missing/old shape. */
export function crawlResultFaults(
  result: { version?: number; signals?: CrawlSignals } | null | undefined,
  createdAtMs: number,
): CrawlFault[] {
  const signals = usableCrawlSignals(result, createdAtMs);
  return signals ? buildFaultLines(signals) : [];
}

/** The fresh + current-version gate on a STORED crawl row, on its own: the signals if the row may be
 *  believed, null if it may not. Extracted 2026-09-22 so src/lib/siteFindings.ts (which needs the
 *  raw signals, not the built fault lines) applies the IDENTICAL gate rather than a second copy of
 *  the expression — a stale or pre-v2 row can carry a finding that is no longer true, and two gates
 *  that drift mean one surface says the site is broken while the other says it is fine.
 *  Behaviour is unchanged: crawlResultFaults above is now written in terms of this. */
export function usableCrawlSignals(
  result: { version?: number; signals?: CrawlSignals } | null | undefined,
  createdAtMs: number,
  nowMs: number = Date.now(),
): CrawlSignals | null {
  if (!result?.signals) return null;
  // nowMs: a caller that already holds "now" (a pass stamped with one time, a test's fixed clock)
  // judges freshness against it, so the answer never depends on the day the code happens to run.
  const fresh = (nowMs - createdAtMs) < CRAWL_FRESH_MS;
  const currentVer = (result.version ?? 1) >= CRAWL_CHECK_VERSION;
  return fresh && currentVer ? believableSignals(result.signals) : null;
}

/** Couldn't check: the homepage was not read. A row from before 2026-10-26 whose every impostor fetch
 *  was refused stored fetchFailed false with readableAs NULL (written explicitly) — that is unread too.
 *  A signal with no readableAs key at all predates the field and is judged on fetchFailed alone. */
export function crawlUnreadable(s: { fetchFailed?: boolean | null; readableAs?: string | null } | null | undefined): boolean {
  return !s || s.fetchFailed === true || s.readableAs === null;
}

/** A stored signal as it may be believed (2026-10-26): an unverified "blocked" list emptied, and an
 *  unread homepage marked fetchFailed, so every reader downstream of usableCrawlSignals agrees. */
export function believableSignals(s: CrawlSignals): CrawlSignals {
  return { ...s, searchBlocked: verifiedSearchBlocked(s), fetchFailed: crawlUnreadable(s) };
}

/** The ONE sentence naming the site's main fault — the first (highest-priority) fault line's detail,
 *  or null when there is nothing to name (site unreachable, or a clean site). It is what the
 *  `audit_followup_fault` WhatsApp template's {{6}} carries, and — because Meta rejects an empty
 *  parameter — the presence of a value is exactly the gate that decides whether that template may be
 *  offered at all. Single-sourced on buildFaultLines so the sentence in the message and the one in
 *  the report can never disagree. Callers apply their own freshness / version gate first. */
export function mainSiteFault(s: CrawlSignals): string | null {
  const faults = buildFaultLines(s);
  return faults.length ? faults[0].detail : null;
}

/** The {{6}} line for a lead with NO WEBSITE AT ALL, where a crawl-fault line makes no sense — there
 *  is nothing of theirs to crawl. It is deliberately truthful about third-party listings still
 *  existing while naming the missing first-party evidence (2026-09-18). */
export const NO_WEBSITE_FAULT_LINE =
  "You don't currently have a website, which means Google and other AI tools have very little first-party information to use when deciding whether to recommend your business.";

/** Used only when a website was successfully crawled and the completed AI audit still shows a
 *  visibility gap. A clean crawl is not itself a fault, so this is never used for a pending,
 *  failed, unavailable, stale or pre-v2 crawl. */
export const CLEAN_SITE_FAULT_LINE =
  "Right now, AI has stronger reasons to recommend other local businesses ahead of you.";

/** THE ONE RULE for audit_followup_fault's {{6}} AND for whether the template may be offered, so the
 *  sender's value and the picker's gate can never disagree (Paul, 2026-09-17):
 *   · no website          → the no-website line (always non-empty → the template IS available);
 *   · a website + a fault → the main crawl fault (fresh + v2 gate, via crawlResultFaults);
 *   · a website + successful clean crawl + measured visibility gap → CLEAN_SITE_FAULT_LINE;
 *   · a website, no usable crawl → null (the template is NOT offered / not sendable).
 *  A caller treats a non-null return as "offer it, and this is {{6}}"; null as "not this lead". */
export function siteFaultLine(
  hasWebsite: boolean,
  result: { version?: number; signals?: CrawlSignals } | null | undefined,
  createdAtMs: number,
): string | null {
  if (!hasWebsite) return NO_WEBSITE_FAULT_LINE;
  const faults = crawlResultFaults(result, createdAtMs);
  return faults.length ? faults[0].detail : null;
}

/** True when a completed run has measured the business as missing from at least one AI answer. */
export function auditShowsVisibilityGap(
  runs: Array<{ status?: string | null; mention_rate?: number | null; audit_summary?: { mention_rate?: number | null } | null; results?: unknown }> = [],
): boolean {
  return runs.some((run) => {
    if (run.status !== "complete" && run.status !== "capped") return false;
    const summary = run.results && typeof run.results === "object"
      ? (run.results as { summary?: { mention_rate?: number | null } }).summary
      : undefined;
    const rate = typeof run.mention_rate === "number" ? run.mention_rate : run.audit_summary?.mention_rate ?? summary?.mention_rate;
    return typeof rate === "number" && Number.isFinite(rate) && rate < 1;
  });
}

/** True when the stored result is a current, successful crawl, including a clean one. */
function isSuccessfulCurrentCrawl(
  result: { version?: number; status?: string; signals?: CrawlSignals } | null | undefined,
  createdAtMs: number,
): boolean {
  if (!result?.signals || crawlUnreadable(result.signals) || result.status === "unavailable") return false;
  return (Date.now() - createdAtMs) < CRAWL_FRESH_MS && (result.version ?? 1) >= CRAWL_CHECK_VERSION;
}

/** A checked crawl result from either the completed audit run or the lead-level cache. */
export interface SiteFaultSource {
  result: { version?: number; status?: string; signals?: CrawlSignals } | null | undefined;
  createdAtMs: number;
  /** An explicit crawl failure is never usable as a message fault. */
  complete?: boolean;
}

/** Prefer the current audit's crawl, then a valid lead-level cache fallback. */
export function resolveSiteFault(
  hasWebsite: boolean,
  auditRunCrawls: SiteFaultSource[] = [],
  leadCrawl?: SiteFaultSource | null,
  auditVisibilityGap = false,
): string | null {
  if (!hasWebsite) return NO_WEBSITE_FAULT_LINE;
  let successfulCleanCrawl = false;
  for (const source of [...auditRunCrawls, ...(leadCrawl ? [leadCrawl] : [])]) {
    if (source.complete === false) continue;
    const fault = siteFaultLine(true, source.result, source.createdAtMs);
    if (fault) return fault;
    if (isSuccessfulCurrentCrawl(source.result, source.createdAtMs)) successfulCleanCrawl = true;
  }
  return auditVisibilityGap && successfulCleanCrawl ? CLEAN_SITE_FAULT_LINE : null;
}

/** The verdict when the homepage was not read. Internal only: it says the CHECK failed, nothing about
 *  the site or AI (the reason, when known, is `result.homeFetch`). */
export const COULD_NOT_CHECK_HEADLINE = "Couldn't check this site: our check got no readable homepage. That is not a finding about the site.";

/** Build the paste-ready verdict from the signals — the single worst problem as the headline, in a
 *  fixed priority (a site AI can't read at all beats a cosmetic gap), plus the full list. Names the
 *  specific problem, never a grade. */
export function buildVerdict(s: CrawlSignals): CrawlVerdict {
  if (crawlUnreadable(s)) {
    /* ⛔ Couldn't check is not a finding (2026-10-26): never "blocking", never anything about AI. */
    return { ok: false, headline: COULD_NOT_CHECK_HEADLINE, problems: [] };
  }
  const problems: string[] = [];

  const blocked = verifiedSearchBlocked(s);
  if (blocked.length) {
    problems.push(`Your robots.txt tells ${blocked.join(', ')} not to read your site — and ${blocked.length === 1 ? 'that crawler is' : 'those crawlers are'} what AI search tools use to read a page when someone asks ChatGPT, Claude or Perplexity about you.`);
  }
  if (s.clientRendered?.flagged) {
    problems.push(`AI crawlers see only about ${s.clientRendered.visibleChars} characters of your homepage — the rest loads with JavaScript, which ChatGPT and Gemini don't run, so they can't read what you do or where you work.`);
  }
  if (s.duplicates) {
    problems.push(`You have about ${s.duplicates.clusterSize} near-identical pages (${s.duplicates.similarityPct}% the same text, with just the town swapped) — AI reads that as one thin page, not ${s.duplicates.clusterSize}.`);
  }
  if (s.missingH1) {
    problems.push(`Your homepage has no H1 heading, so AI has no clear statement of what the page is about.`);
  }
  if (s.noJsonLd) {
    problems.push(`Your site has no structured data (JSON-LD), so AI has to guess your business details instead of reading them.`);
  }
  if (s.thinPages > 0) {
    problems.push(`${s.thinPages} of your service pages have very little text — too thin for AI to draw on.`);
  }

  if (!problems.length) {
    return { ok: true, headline: `No obvious crawlability problems found — AI can read this site.`, problems: [] };
  }
  return { ok: true, headline: problems[0], problems };
}
