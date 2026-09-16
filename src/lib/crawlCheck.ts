/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE CRAWLABILITY CHECK — the pure, deterministic analysis (Paul, 2026-09-16).

   The point: name a prospect's ACTUAL crawlability fault in the outreach message, for the price of a
   fetch — never the Apify SEO scanner (5.6p, off for outreach). The edge function `crawl-check` does
   the fetching (homepage as GPTBot, robots.txt, sitemap, a bounded sample of templated pages); THIS
   file turns those raw strings into signals and a paste-ready verdict.

   ⛔ PURE. No fetch, no DOM, no platform globals — it runs in the edge function (Deno) AND in the
   test (Node/tsx), and is imported by the edge with a relative `.ts` path (CLAUDE.md §3). Every
   threshold is a named const so a tuning change is one line, not a scattered magic number.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

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
/** AI crawlers worth naming when robots.txt blocks them. Lowercased for case-insensitive match. */
export const AI_CRAWLERS: Readonly<Record<string, string>> = {
  gptbot: 'GPTBot (ChatGPT)',
  'chatgpt-user': 'ChatGPT-User',
  'oai-searchbot': 'OAI-SearchBot',
  'google-extended': 'Google-Extended (Gemini)',
  claudebot: 'ClaudeBot',
  'anthropic-ai': 'anthropic-ai',
  ccbot: 'CCBot',
  perplexitybot: 'PerplexityBot',
};

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

/* ── robots.txt ───────────────────────────────────────────────────────────────────────────────── */

/** AI crawlers that robots.txt blocks from the whole site. Parses user-agent groups; a bot is
 *  "blocked" when its own group — or a wildcard `*` group — carries `Disallow: /` (the whole site).
 *  A partial Disallow (e.g. /admin) is NOT a block. Returns display names, deduped, in list order. */
export function parseRobotsAIBlocks(robotsTxt: string): string[] {
  const lines = (robotsTxt || '').split(/\r?\n/);
  // group agents (lowercased) → set of disallow paths (trimmed)
  const groups: Array<{ agents: string[]; disallows: string[] }> = [];
  let cur: { agents: string[]; disallows: string[] } | null = null;
  let lastWasAgent = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) { lastWasAgent = false; continue; }
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const field = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], disallows: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (field === 'disallow' && cur) cur.disallows.push(value);
    }
  }
  const blocksAll = (g: { disallows: string[] }) => g.disallows.some((d) => d === '/' || d === '/*');
  const blocked = new Set<string>();
  const out: string[] = [];
  for (const key of Object.keys(AI_CRAWLERS)) {
    const named = groups.some((g) => g.agents.includes(key) && blocksAll(g));
    const wildcard = groups.some((g) => g.agents.includes('*') && blocksAll(g));
    if ((named || wildcard) && !blocked.has(key)) { blocked.add(key); out.push(AI_CRAWLERS[key]); }
  }
  return out;
}

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
  fetchFailed: boolean;              // couldn't fetch the homepage at all
  blockedByBot: boolean;            // 403/challenge — a real site we can't read as a crawler
  clientRendered: ClientRenderResult | null;
  missingH1: boolean;
  noJsonLd: boolean;
  aiBlocked: string[];
  duplicates: { clusterSize: number; sampleSize: number; similarityPct: number } | null;
  thinPages: number;                // count of sampled service pages under THIN_WORDS
}

export interface CrawlVerdict {
  ok: boolean;                       // false when we couldn't read the site at all
  headline: string;                  // the ONE problem to lead the message with
  problems: string[];                // every problem found, each a paste-ready sentence
}

/** Build the paste-ready verdict from the signals — the single worst problem as the headline, in a
 *  fixed priority (a site AI can't read at all beats a cosmetic gap), plus the full list. Names the
 *  specific problem, never a grade. */
export function buildVerdict(s: CrawlSignals): CrawlVerdict {
  if (s.fetchFailed) {
    return { ok: false, headline: `Couldn't fetch ${s.homeUrl} to check it — the site may be down or blocking automated requests.`, problems: [] };
  }
  const problems: string[] = [];

  if (s.blockedByBot) {
    problems.push(`Your site returns a block to automated visitors, so AI crawlers like GPTBot may not be able to read it at all.`);
  }
  if (s.clientRendered?.flagged) {
    problems.push(`AI crawlers see only about ${s.clientRendered.visibleChars} characters of your homepage — the rest loads with JavaScript, which ChatGPT and Gemini don't run, so they can't read what you do or where you work.`);
  }
  if (s.aiBlocked.length) {
    problems.push(`Your robots.txt blocks ${s.aiBlocked.join(', ')}, so ${s.aiBlocked.length === 1 ? 'that AI crawler is' : 'those AI crawlers are'} told not to read your site.`);
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
