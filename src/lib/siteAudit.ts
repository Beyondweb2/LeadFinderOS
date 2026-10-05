/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PROSPECT SITE AUDIT — a crawl's evidence, grouped into findings a salesperson can read
   (2026-10-05, branch improve/prospect-full-crawl-audit-results;
   docs/pre-sales-certification/prospect-full-crawl-audit-results.md).

   buildSiteAudit       ← a finished crawl job's page rows (called by finalizeCrawlJob, stored at
                          lead_crawl_checks.full_evidence.audit so the detailed view reopens instantly)
   auditFromStoredCrawl ← any stored lead_crawl_checks row: the stored audit when there is one, else
                          the most an OLDER row can honestly support (a full crawl from before this
                          date, or a quick 12-page check) — examples only, labelled as such.

   ⛔ EVIDENCE ONLY. Every finding is something read on a page (or in robots.txt / a sitemap), with
   the pages it was read on. Nothing is inferred from absence on a page that was not read: a capped
   crawl's "not found" findings say "in the pages read" (`absence: true`).
   ⛔ GROUPED, NEVER REPEATED. One finding per issue with its full page count, a few examples and the
   complete list of affected addresses (up to AUDIT_URL_LIST_MAX; `urlsComplete` says when cut).
   ⛔ NO SCORES. Severity is HIGH / MEDIUM / LOW, and GOOD for verified strengths — never a number.
   ⛔ NEVER A PROMISE AND NEVER A CLAIM ABOUT HOW AN AI DECIDES (CLAUDE.md §6 WhatsApp): the words say
   what was seen and that it "may" make the business harder to find, read or verify. Schema markup and
   website quality were tested NEGATIVE as levers (CLAUDE.md §5) — they are LOW at most, never sold as
   the fix. llms.txt is never recommended. GPTBot (a training crawler) is never treated as required.
   ⛔ NO MODEL CALLS. Deterministic; pure; no I/O.

   IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { CrawlCoverage, PageBusiness, PageDigest, FullCrawlEvidence } from './fullCrawl.ts';
import { robotsAllows, robotsRulesFor, sameSite } from './crawlUrl.ts';

export const SITE_AUDIT_VERSION = 1;
/** Affected addresses kept per finding. Above it the list is cut and `urlsComplete` is false. */
export const AUDIT_URL_LIST_MAX = 500;
/** Examples shown before "show all". */
export const AUDIT_EXAMPLES = 5;
/** Under this many words of readable text a page is "thin" (matches crawlCheck THIN_WORDS). */
export const AUDIT_THIN_WORDS = 120;
/** Titles longer than this are usually cut off in search results. */
export const AUDIT_TITLE_MAX = 65;
/** Link-graph checks (click depth, sitemap-only pages) need links read on at least this share of the
 *  readable pages; older rows have none and are not judged. */
const LINK_GRAPH_MIN_SHARE = 0.9;
/** Clicks from the homepage beyond which a page is "buried". */
export const AUDIT_DEEP_CLICKS = 3;

export type AuditSeverity = 'high' | 'medium' | 'low' | 'good';
export type AuditCategory = 'discovery' | 'ai_access' | 'entity' | 'content' | 'structured_data' | 'technical' | 'local_evidence';

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  discovery: 'Discovery & crawlability',
  ai_access: 'AI & search crawler access',
  entity: 'Business clarity',
  content: 'Services & content',
  structured_data: 'Structured data',
  technical: 'Technical basics',
  local_evidence: 'Local & trust evidence',
};
export const AUDIT_CATEGORY_ORDER: AuditCategory[] = ['ai_access', 'discovery', 'entity', 'content', 'local_evidence', 'technical', 'structured_data'];
export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = { high: 'High', medium: 'Medium', low: 'Low', good: 'Verified' };
const SEVERITY_RANK: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2, good: 3 };

export interface AuditFinding {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  /** What was seen — a fact, with its number. */
  saw: string;
  /** Why it may matter — hedged, never a claim about how an AI decides. */
  meaning: string;
  /** Pages affected (0 for a site-wide fact). */
  count: number;
  /** Every affected address, up to AUDIT_URL_LIST_MAX. */
  urls: string[];
  /** False when `urls` holds fewer than `count` (cut at the limit, or an older row that kept examples only). */
  urlsComplete: boolean;
  /** Verbatim proof: a robots.txt line, a quoted credential, two disagreeing phone numbers. */
  evidence?: string[];
  /** A "not found" finding: on a capped crawl it is only true of the pages read. */
  absence?: boolean;
}

export type AuditBasis = 'full' | 'capped' | 'full_legacy' | 'quick';

export interface SiteAudit {
  version: number;
  basis: AuditBasis;
  servedUrl: string;
  coverage: CrawlCoverage | null;
  findings: AuditFinding[];
  /** Checks that could not be made on this evidence, said rather than skipped silently. */
  notChecked: string[];
}

export interface SiteAuditPage {
  url: string;
  finalUrl?: string | null;
  status: string;
  httpStatus?: number | null;
  skipReason?: string | null;
  source?: string | null;
  depth?: number | null;
  d?: PageDigest | null;
  b?: Partial<PageBusiness> | null;
  l?: string[] | null;
}

export interface SiteAuditInput {
  servedUrl: string;
  requestedUrl: string;
  robotsTxt: string | null;
  pages: SiteAuditPage[];
  sitemapsRead: number;
  sitemapUrlCount: number;
  offSiteSitemap: { count: number; samples: string[] };
  coverage: CrawlCoverage;
  /** The homepage probes crawl-check made as each AI search crawler (real fetches). */
  probe: { searchBlocked: string[]; readableAs: string | null; clientRendered: { flagged?: boolean } | null };
  /** The engine's near-duplicate check on the biggest templated cluster. */
  duplicates: { clusterSize: number; sampleSize: number; similarityPct: number } | null;
  /** The lead's own name and town (from the CRM), to check the site states them. Optional. */
  lead?: { name?: string | null; town?: string | null } | null;
  /** The homepage's readable text (for the name / town checks). */
  homeText?: string | null;
}

/* ── helpers ──────────────────────────────────────────────────────────────────────────────────── */

const fmt = (n: number) => n.toLocaleString('en-GB');
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const pathOf = (u: string) => { try { const x = new URL(u); return (x.pathname.replace(/\/+$/, '') || '/') + x.search; } catch { return u; } };
const sameAddress = (a: string, b: string) => { try { return sameSite(a, b) && pathOf(a) === pathOf(b); } catch { return false; } };
const digits = (s: string) => s.replace(/\D/g, '').replace(/^44/, '0');

function finding(f: Omit<AuditFinding, 'urls' | 'urlsComplete' | 'count'> & { urls?: string[]; count?: number }): AuditFinding {
  const all = [...new Set(f.urls ?? [])];
  const count = f.count ?? all.length;
  const urls = all.slice(0, AUDIT_URL_LIST_MAX);
  return { ...f, count, urls, urlsComplete: urls.length >= count };
}

/** Significant words of a business name or town, for a loose "is it stated" match. */
const STOP = new Set(['the', 'and', 'ltd', 'limited', 'llp', 'plc', 'co', 'company', 'services', 'service', 'uk', 'of', 'in', 'group', 'solutions', 'mr', 'mrs', 'amp']);
export function significantWords(s: string | null | undefined): string[] {
  return String(s ?? '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w.length >= 3 && !STOP.has(w));
}
/** Every significant word of `needle` appears in `hay` (whole words). */
export function statesAll(hay: string, needle: string | null | undefined): boolean {
  const words = significantWords(needle);
  if (!words.length) return false;
  const h = ` ${String(hay ?? '').toLowerCase().replace(/[^a-z0-9']+/g, ' ')} `;
  return words.every((w) => h.includes(` ${w} `) || h.includes(` ${w}s `) || h.includes(` ${w.replace(/s$/, '')} `));
}

const BUSINESS_TYPE = /business|organi[sz]ation|contractor|service|plumber|electrician|locksmith|store|dentist|accounting|roofing|hvac|attorney|legal|restaurant|salon|clinic|agent|repair|mover|garage/i;
const IMPORTANT_FAMILY = new Set(['homepage', 'service', 'location', 'about', 'contact']);

/** The crawlers whose robots.txt access is checked, and why each matters. ⛔ GPTBot is a TRAINING
 *  crawler: blocking it is common and does not stop ChatGPT search, so it is never a finding. */
export const AUDIT_CRAWLERS: ReadonlyArray<{ token: string; label: string; why: string; severity: AuditSeverity }> = [
  { token: 'OAI-SearchBot', label: 'OAI-SearchBot (ChatGPT search)', why: 'OpenAI uses OAI-SearchBot to find pages it can show in ChatGPT search answers.', severity: 'high' },
  { token: 'Googlebot', label: 'Googlebot (Google Search)', why: 'Google Search, and the Google AI answers built on it, rely on Googlebot reading the site.', severity: 'high' },
  { token: 'Bingbot', label: 'Bingbot (Bing)', why: 'Bing’s index is one of the sources AI assistants search.', severity: 'high' },
  { token: 'PerplexityBot', label: 'PerplexityBot (Perplexity)', why: 'Perplexity uses it to find pages for its answers.', severity: 'medium' },
];

/* ── the builder ──────────────────────────────────────────────────────────────────────────────── */

export function buildSiteAudit(input: SiteAuditInput): SiteAudit {
  const { servedUrl, coverage } = input;
  const out: AuditFinding[] = [];
  const notChecked: string[] = [];
  const capped = coverage.capped;
  const readScope = capped ? ` in the ${fmt(coverage.pagesCrawled)} pages read` : '';

  const done = input.pages.filter((p) => p.status === 'done' && p.d);
  const ok = done.filter((p) => (p.d!.status ?? 200) > 0 && (p.d!.status ?? 200) < 400);
  const failed = input.pages.filter((p) => p.status === 'failed');
  const urlOf = (p: SiteAuditPage) => p.d?.finalUrl || p.finalUrl || p.url;
  const fam = (p: SiteAuditPage) => p.d?.family ?? 'other';
  const home = ok.find((p) => fam(p) === 'homepage') ?? null;
  const biz = (k: keyof PageBusiness) => ok.flatMap((p) => ((p.b?.[k] as unknown[]) ?? []).map((v) => ({ v, url: urlOf(p) })));

  /* ── AI & search crawler access ─────────────────────────────────────────────────────────────── */
  const robots = input.robotsTxt;
  const star = robotsRulesFor(robots, '*');
  const starBlocksAll = !!robots && !robotsAllows(star.rules, '/');
  if (starBlocksAll) {
    out.push(finding({ id: 'robots_blocks_all', category: 'ai_access', severity: 'high',
      title: 'robots.txt tells every crawler to stay away',
      saw: 'The site’s robots.txt says “Disallow: /” for all crawlers (User-agent: *).',
      meaning: 'Search engines and AI search crawlers that respect robots.txt are asked not to read any page, which can stop the site being found or quoted.',
      evidence: ['User-agent: *', 'Disallow: /'], count: 0 }));
  }
  for (const c of AUDIT_CRAWLERS) {
    const r = robotsRulesFor(robots, c.token);
    const own = r.group !== '*' && r.group !== null;
    if (!robots) continue;
    if (starBlocksAll && !own) continue;                       // already said once, above
    const blocksHome = !robotsAllows(r.rules, '/');
    const blockedPages = ok.filter((p) => IMPORTANT_FAMILY.has(fam(p)) && !robotsAllows(r.rules, pathOf(urlOf(p)))).map(urlOf);
    if (blocksHome) {
      out.push(finding({ id: `robots_blocks_${c.token.toLowerCase()}`, category: 'ai_access', severity: c.severity,
        title: `robots.txt blocks ${c.label}`,
        saw: `robots.txt ${own ? `has its own rules for ${c.token}` : 'applies its general rules'} and they disallow the homepage.`,
        meaning: `${c.why} Blocking it can keep the site out of those results.`,
        evidence: [`User-agent: ${own ? c.token : '*'}`, ...r.rules.disallow.slice(0, 3).map((d) => `Disallow: ${d}`)], count: 0 }));
    } else if (blockedPages.length) {
      out.push(finding({ id: `robots_blocks_pages_${c.token.toLowerCase()}`, category: 'ai_access', severity: 'medium',
        title: `robots.txt blocks important pages for ${c.label}`,
        saw: `${plural(blockedPages.length, 'main page')} (service, area, about or contact) are disallowed for ${c.token}.`,
        meaning: `${c.why} Those pages cannot be read by it.`, urls: blockedPages,
        evidence: r.rules.disallow.slice(0, 5).map((d) => `Disallow: ${d}`) }));
    }
  }
  const blockedByFetch = input.probe.searchBlocked ?? [];
  if (blockedByFetch.length) {
    out.push(finding({ id: 'search_crawler_refused', category: 'ai_access', severity: 'high',
      title: 'The site refused AI search crawlers',
      saw: `When we requested the homepage as ${blockedByFetch.join(', ')}, the site answered with an error or a bot-check page.`,
      meaning: 'An AI assistant that fetches the page to answer a question may get nothing to read.', evidence: blockedByFetch, count: 0 }));
  }
  const oai = robotsRulesFor(robots, 'OAI-SearchBot');
  if (!blockedByFetch.includes('OAI-SearchBot') && robotsAllows(oai.rules, '/') && input.probe.readableAs) {
    out.push(finding({ id: 'oai_searchbot_ok', category: 'ai_access', severity: 'good',
      title: 'ChatGPT’s search crawler can read the homepage',
      saw: `robots.txt ${robots ? 'allows' : 'does not restrict'} OAI-SearchBot, and the homepage loaded when requested as ${input.probe.readableAs}.`,
      meaning: 'Nothing on the site stops ChatGPT search reading it.', count: 0 }));
  }
  if (input.probe.clientRendered?.flagged === true) {
    out.push(finding({ id: 'client_rendered', category: 'ai_access', severity: 'medium',
      title: 'Homepage text only appears after JavaScript runs',
      saw: 'The homepage HTML we received carries very little readable text; the content is built in the browser.',
      meaning: 'Crawlers that do not run JavaScript may see an almost empty page, which gives them less to work with.', urls: home ? [urlOf(home)] : [] }));
  }

  /* ── Discovery & crawlability ───────────────────────────────────────────────────────────────── */
  try {
    if (new URL(servedUrl).protocol === 'http:') {
      out.push(finding({ id: 'no_https', category: 'discovery', severity: 'high',
        title: 'The site is served without HTTPS',
        saw: `The homepage ended up at ${servedUrl} (http, not https).`,
        meaning: 'Browsers mark it “Not secure”, and search engines treat HTTPS as a basic trust signal.', urls: [servedUrl], count: 0 }));
    } else {
      out.push(finding({ id: 'https_ok', category: 'discovery', severity: 'good', title: 'Served securely over HTTPS', saw: `The site is served at ${new URL(servedUrl).origin}.`, meaning: 'No security warning for visitors.', count: 0 }));
    }
  } catch { /* unparseable served URL: no https finding */ }
  try {
    const a = new URL(input.requestedUrl), b = new URL(servedUrl);
    if (a.hostname.replace(/^www\./, '') !== b.hostname.replace(/^www\./, '')) {
      out.push(finding({ id: 'redirects_to_other_domain', category: 'discovery', severity: 'low',
        title: 'The address on file redirects to another domain',
        saw: `${a.origin} redirects to ${b.origin}.`,
        meaning: 'Worth checking which domain the business uses on its listings, so every profile points to the same site.', urls: [input.requestedUrl], count: 0 }));
    }
  } catch { /* ignore */ }
  if (!robots) {
    out.push(finding({ id: 'no_robots', category: 'discovery', severity: 'low', absence: true,
      title: 'No robots.txt file',
      saw: 'There is no robots.txt at the site’s root.',
      meaning: 'Not a problem on its own (crawlers are allowed by default), but there is nowhere telling them where the sitemap is.', count: 0 }));
  }
  if (input.sitemapsRead === 0) {
    out.push(finding({ id: 'no_sitemap', category: 'discovery', severity: 'medium', absence: true,
      title: 'No XML sitemap found',
      saw: 'No sitemap was declared in robots.txt, and none was found at /sitemap.xml, /sitemap_index.xml or /wp-sitemap.xml.',
      meaning: 'A sitemap is the simplest way to tell search engines every page that exists; without one they rely on following links.', count: 0 }));
  } else {
    out.push(finding({ id: 'sitemap_ok', category: 'discovery', severity: 'good',
      title: 'XML sitemap found', saw: `${plural(input.sitemapsRead, 'sitemap file')} listing ${plural(input.sitemapUrlCount, 'address', 'addresses')}.`,
      meaning: 'Search engines are told which pages exist.', count: 0 }));
  }
  if (input.offSiteSitemap.count > 0) {
    out.push(finding({ id: 'sitemap_off_site', category: 'discovery', severity: 'medium',
      title: 'The sitemap lists addresses on a different website',
      saw: `${plural(input.offSiteSitemap.count, 'sitemap entry', 'sitemap entries')} point to another domain.`,
      meaning: 'Search engines can be pointed at the wrong site, or ignore the sitemap.', urls: input.offSiteSitemap.samples, count: input.offSiteSitemap.count }));
  }
  const robotsSkipped = input.pages.filter((p) => p.status === 'skipped' && p.skipReason === 'robots_disallow').map((p) => p.url);
  if (robotsSkipped.length && !starBlocksAll) {
    out.push(finding({ id: 'robots_disallowed_pages', category: 'discovery', severity: 'low',
      title: 'Pages robots.txt asks crawlers not to read',
      saw: `${plural(robotsSkipped.length, 'linked address', 'linked addresses')} on the site are disallowed for all crawlers, so we did not read them either.`,
      meaning: 'Often deliberate (admin or utility pages). Worth checking none of them is a page customers should find.', urls: robotsSkipped }));
  }
  const noindex = ok.filter((p) => p.d!.noindex);
  const homeNoindex = noindex.find((p) => fam(p) === 'homepage');
  if (homeNoindex) {
    out.push(finding({ id: 'noindex_home', category: 'discovery', severity: 'high',
      title: 'The homepage asks not to be listed (noindex)',
      saw: `The homepage carries “${homeNoindex.d!.robots}”.`,
      meaning: 'Search engines that respect it will leave the homepage out of their results.', urls: [urlOf(homeNoindex)] }));
  }
  const otherNoindex = noindex.filter((p) => fam(p) !== 'homepage');
  if (otherNoindex.length) {
    const important = otherNoindex.some((p) => IMPORTANT_FAMILY.has(fam(p)));
    out.push(finding({ id: 'noindex_pages', category: 'discovery', severity: important ? 'medium' : 'low',
      title: 'Pages that ask not to be listed (noindex)',
      saw: `${plural(otherNoindex.length, 'page')} carry a noindex instruction${important ? ', including service, area, about or contact pages' : ''}.`,
      meaning: 'Those pages are kept out of search results by the site itself.', urls: otherNoindex.map(urlOf) }));
  }
  const canonOff = ok.filter((p) => p.d!.canonical && !sameSite(p.d!.canonical, servedUrl));
  if (canonOff.length) {
    out.push(finding({ id: 'canonical_off_site', category: 'discovery', severity: 'high',
      title: 'Pages name a different website as their main version',
      saw: `${plural(canonOff.length, 'page')} carry a canonical link to another domain (e.g. ${canonOff[0].d!.canonical}).`,
      meaning: 'Search engines may credit the other website instead of this one.', urls: canonOff.map(urlOf),
      evidence: canonOff.slice(0, 3).map((p) => `${urlOf(p)} → ${p.d!.canonical}`) }));
  }
  const canonOther = ok.filter((p) => p.d!.canonical && sameSite(p.d!.canonical, servedUrl) && !sameAddress(p.d!.canonical, urlOf(p)) && !/[?&](page|paged|pg)=/i.test(urlOf(p)));
  if (canonOther.length) {
    const homeHit = canonOther.some((p) => fam(p) === 'homepage');
    out.push(finding({ id: 'canonical_mismatch', category: 'discovery', severity: homeHit || canonOther.length >= 3 ? 'medium' : 'low',
      title: 'Pages point to a different page as their main version',
      saw: `${plural(canonOther.length, 'page')} carry a canonical link to another page on the site${canonOther.length >= 3 ? ' (often a template setting every page to the homepage)' : ''}.`,
      meaning: 'Search engines may treat those pages as copies and list only the page they point to.', urls: canonOther.map(urlOf),
      evidence: canonOther.slice(0, 3).map((p) => `${urlOf(p)} → ${p.d!.canonical}`) }));
  }
  const broken = failed.filter((p) => p.httpStatus && p.httpStatus >= 400);
  if (broken.length) {
    out.push(finding({ id: 'broken_pages', category: 'discovery', severity: 'medium',
      title: 'Linked pages that return an error',
      saw: `${plural(broken.length, 'address', 'addresses')} linked from the site or listed in its sitemap answered with an error (${[...new Set(broken.map((p) => p.httpStatus))].join(', ')}).`,
      meaning: 'Visitors and crawlers following those links reach a dead end.', urls: broken.map((p) => `${p.url} (${p.httpStatus})`) }));
  }
  const unreachable = failed.filter((p) => !p.httpStatus);
  if (unreachable.length) {
    out.push(finding({ id: 'unreachable_pages', category: 'discovery', severity: 'low',
      title: 'Pages that did not answer',
      saw: `${plural(unreachable.length, 'page')} timed out or refused the connection after three attempts.`,
      meaning: 'Could be a slow or overloaded host; crawlers that hit the same problem read nothing there.', urls: unreachable.map((p) => p.url) }));
  }
  const redirected = input.pages.filter((p) => p.status === 'done' && p.finalUrl && !sameAddress(p.finalUrl, p.url));
  if (redirected.length) {
    out.push(finding({ id: 'internal_redirects', category: 'discovery', severity: 'low',
      title: 'Internal addresses that redirect',
      saw: `${plural(redirected.length, 'address', 'addresses')} found on the site redirect to a different page.`,
      meaning: 'Usually harmless; links and sitemaps pointing straight at the final page are cleaner.', urls: redirected.map((p) => `${p.url} → ${p.finalUrl}`) }));
  }

  /* The link graph: click depth and sitemap-only pages. Only on a crawl that read every page and kept
     links for (nearly) all of them — a capped or older crawl did not see every link, so a page it
     never saw linked may well be linked from a page it never read. */
  const withLinks = ok.filter((p) => Array.isArray(p.l));
  const graphUsable = !capped && ok.length > 1 && withLinks.length >= ok.length * LINK_GRAPH_MIN_SHARE && !!home;
  if (graphUsable) {
    const absOn = (l: string) => { try { return new URL(l, servedUrl).href; } catch { return l; } };
    const byPath = new Map(ok.map((p) => [pathOf(urlOf(p)), p] as const));
    const inbound = new Set<string>();
    for (const p of withLinks) for (const l of p.l!) { const k = pathOf(absOn(l)); if (k !== pathOf(urlOf(p))) inbound.add(k); }
    const sitemapOnly = ok.filter((p) => p.source === 'sitemap' && fam(p) !== 'homepage' && !inbound.has(pathOf(urlOf(p))));
    if (sitemapOnly.length) {
      out.push(finding({ id: 'sitemap_only_pages', category: 'discovery', severity: sitemapOnly.some((p) => IMPORTANT_FAMILY.has(fam(p))) ? 'medium' : 'low',
        title: 'Pages in the sitemap that no page links to',
        saw: `${plural(sitemapOnly.length, 'page')} appear in the sitemap but are not linked from any page we read.`,
        meaning: 'Pages with no links pointing at them look less important to crawlers, and visitors cannot reach them by browsing.', urls: sitemapOnly.map(urlOf) }));
    }
    // Breadth-first click depth from the homepage.
    const depth = new Map<string, number>([[pathOf(urlOf(home!)), 0]]);
    const queue = [pathOf(urlOf(home!))];
    while (queue.length) {
      const cur = queue.shift()!;
      const page = byPath.get(cur);
      for (const l of page?.l ?? []) {
        const k = pathOf(absOn(l));
        if (!depth.has(k) && byPath.has(k)) { depth.set(k, depth.get(cur)! + 1); queue.push(k); }
      }
    }
    const deep = ok.filter((p) => (depth.get(pathOf(urlOf(p))) ?? -1) > AUDIT_DEEP_CLICKS);
    if (deep.length) {
      out.push(finding({ id: 'deep_pages', category: 'discovery', severity: deep.some((p) => IMPORTANT_FAMILY.has(fam(p))) ? 'medium' : 'low',
        title: `Pages more than ${AUDIT_DEEP_CLICKS} clicks from the homepage`,
        saw: `${plural(deep.length, 'page')} can only be reached after more than ${AUDIT_DEEP_CLICKS} clicks.`,
        meaning: 'Deeply buried pages tend to be crawled less often and treated as less important.', urls: deep.map(urlOf) }));
    }
  } else {
    notChecked.push(capped
      ? 'Click depth and pages nobody links to — not judged on a capped crawl (the pages that link to them may not have been read).'
      : 'Click depth and pages nobody links to — this crawl did not keep page links.');
  }

  /* ── Business clarity (entity) ──────────────────────────────────────────────────────────────── */
  const homeHay = home ? [home.d!.title, ...(home.d!.h1 ?? []), input.homeText ?? home.d!.excerpt ?? ''].join(' ') : '';
  const siteNames = biz('names').map((x) => String(x.v));
  const leadName = input.lead?.name?.trim() || '';
  if (home && leadName && significantWords(leadName).length) {
    const inHead = statesAll([home.d!.title, ...(home.d!.h1 ?? []), ...siteNames].join(' '), leadName);
    const inText = statesAll(homeHay, leadName);
    if (inHead) out.push(finding({ id: 'name_clear', category: 'entity', severity: 'good', title: 'Business name stated clearly', saw: `“${leadName}” appears in the homepage title, main heading or business markup.`, meaning: 'The site says plainly who the business is.', urls: [urlOf(home)] }));
    else out.push(finding({ id: 'name_unclear', category: 'entity', severity: inText ? 'low' : 'medium', absence: !inText,
      title: inText ? 'Business name is not in the homepage title or main heading' : 'Business name not found on the homepage',
      saw: inText ? `“${leadName}” appears in the homepage text, but not in its title, main heading or business markup.` : `We could not find “${leadName}” on the homepage (title: “${home.d!.title || 'none'}”).`,
      meaning: 'A clear, consistent business name helps search engines and AI tools connect the website to the business’s listings.', urls: [urlOf(home)] }));
  } else if (!leadName) notChecked.push('Business name on the homepage — no business name on the lead to compare with.');
  const town = input.lead?.town?.trim() || '';
  if (home && town && significantWords(town).length) {
    const townPages = ok.filter((p) => statesAll([p.d!.title, ...(p.d!.h1 ?? []), p.d!.excerpt ?? ''].join(' '), town));
    if (statesAll(homeHay, town)) out.push(finding({ id: 'town_stated', category: 'entity', severity: 'good', title: `Mentions ${town} on the homepage`, saw: `${town} appears on the homepage${townPages.length > 1 ? ` and on ${plural(townPages.length - 1, 'other page')}` : ''}.`, meaning: 'The site says where the business works.', urls: townPages.map(urlOf) }));
    else out.push(finding({ id: 'town_missing', category: 'entity', severity: 'medium', absence: true,
      title: `Homepage does not mention ${town}`,
      saw: `${town} is not in the homepage’s title, headings or opening text${townPages.length ? `; it appears on ${plural(townPages.length, 'other page')}` : readScope ? `, nor anywhere${readScope}` : ', nor on any page read'}.`,
      meaning: 'Saying clearly where the business works helps it be matched to local searches.', urls: townPages.length ? townPages.map(urlOf) : [urlOf(home)] }));
  } else if (!town) notChecked.push('Town on the homepage — no town on the lead to compare with.');
  const phones = biz('phones');
  if (phones.length) out.push(finding({ id: 'phone_shown', category: 'entity', severity: 'good', title: 'Phone number shown', saw: `${String(phones[0].v)} (on ${plural(new Set(phones.map((p) => p.url)).size, 'page')}).`, meaning: 'Customers and AI tools can find how to contact the business.', urls: [...new Set(phones.map((p) => p.url))] }));
  else if (ok.length) out.push(finding({ id: 'no_phone', category: 'entity', severity: 'medium', absence: true, title: 'No phone number found', saw: `No phone number was found${readScope || ' on any page read'}.`, meaning: 'Contact details are one of the ways a website is matched to the business’s listings.', count: 0 }));
  const contactPages = ok.filter((p) => fam(p) === 'contact');
  if (!contactPages.length && ok.length > 1) out.push(finding({ id: 'no_contact_page', category: 'entity', severity: 'low', absence: true, title: 'No contact page found', saw: `No page looks like a contact page${readScope}.`, meaning: 'A dedicated contact page is the usual place customers and crawlers look for contact details.', count: 0 }));
  const aboutPages = ok.filter((p) => fam(p) === 'about');
  if (aboutPages.length) out.push(finding({ id: 'about_page', category: 'entity', severity: 'good', title: 'About page found', saw: `${plural(aboutPages.length, 'about page')}.`, meaning: 'Tells customers who is behind the business.', urls: aboutPages.map(urlOf) }));
  else if (ok.length > 1) out.push(finding({ id: 'no_about_page', category: 'entity', severity: 'low', absence: true, title: 'No About page found', saw: `No page looks like an About page${readScope}.`, meaning: 'Who runs the business, how long it has traded and what it is qualified to do are what a customer checks before calling.', count: 0 }));
  const addresses = biz('addresses');
  if (!addresses.length && ok.length) out.push(finding({ id: 'no_address', category: 'entity', severity: 'low', absence: true, title: 'No address or postcode found', saw: `No street address or postcode was found${readScope || ' on any page read'}.`, meaning: 'Fine for a mobile trade that does not publish one; otherwise a stated address helps confirm where the business is.', count: 0 }));
  const people = biz('people');
  if (people.length) out.push(finding({ id: 'people', category: 'entity', severity: 'good', title: 'Says who runs the business', saw: `“${String(people[0].v).slice(0, 160)}”`, meaning: 'A named owner or team builds trust.', urls: [...new Set(people.map((p) => p.url))] }));

  /* ── Services & content ─────────────────────────────────────────────────────────────────────── */
  const servicePages = ok.filter((p) => fam(p) === 'service');
  const locationPages = ok.filter((p) => fam(p) === 'location');
  if (ok.length === 1) {
    out.push(finding({ id: 'one_page_site', category: 'content', severity: 'medium', title: 'A one-page website', saw: 'Only the homepage was found; there are no other pages.', meaning: 'With everything on one page there is no page dedicated to each service or area a customer searches for.', urls: home ? [urlOf(home)] : [] }));
  } else if (servicePages.length) {
    out.push(finding({ id: 'service_pages', category: 'content', severity: 'good', title: 'Service pages found', saw: `${plural(servicePages.length, 'page')} look like service pages.`, meaning: 'Each service has somewhere to be described.', urls: servicePages.map(urlOf) }));
  } else if (ok.length > 1) {
    out.push(finding({ id: 'no_service_pages', category: 'content', severity: 'medium', absence: true, title: 'No dedicated service pages found', saw: `None of the pages read look like a page about one service${readScope}.`, meaning: 'A clear page per main service gives search engines and AI tools a specific page to match to a specific need.', count: 0 }));
  }
  const thin = ok.filter((p) => (p.d!.words ?? 0) < AUDIT_THIN_WORDS && !['legal', 'contact', 'gallery'].includes(fam(p)));
  const thinKey = thin.filter((p) => ['service', 'location', 'homepage'].includes(fam(p)));
  if (thinKey.length) out.push(finding({ id: 'thin_key_pages', category: 'content', severity: 'medium', title: 'Thin service, area or home pages', saw: `${plural(thinKey.length, 'page')} have under ${AUDIT_THIN_WORDS} words of readable text.`, meaning: 'Very short pages give little to read about what the business does there.', urls: thinKey.map(urlOf) }));
  const thinOther = thin.filter((p) => !thinKey.includes(p));
  if (thinOther.length) out.push(finding({ id: 'thin_pages', category: 'content', severity: 'low', title: 'Other thin pages', saw: `${plural(thinOther.length, 'page')} have under ${AUDIT_THIN_WORDS} words of readable text.`, meaning: 'Short pages are fine for some purposes; worth checking none is meant to explain a service.', urls: thinOther.map(urlOf) }));
  if (input.duplicates) {
    out.push(finding({ id: 'near_duplicate_pages', category: 'content', severity: 'medium',
      title: 'Near-identical location or service pages',
      saw: `A set of ${plural(input.duplicates.clusterSize, 'page')} follows one template; the ${input.duplicates.sampleSize} we compared are about ${input.duplicates.similarityPct}% the same text.`,
      meaning: 'Pages that differ only by a town name add little that is specific to each place and may be treated as copies.', count: input.duplicates.clusterSize,
      urls: locationPages.length ? locationPages.map(urlOf) : [] }));
  }
  const byTitle = new Map<string, string[]>();
  for (const p of ok) { const t = (p.d!.title || '').trim().toLowerCase(); if (t) (byTitle.get(t) ?? byTitle.set(t, []).get(t)!).push(urlOf(p)); }
  const dupTitles = [...byTitle.values()].filter((u) => u.length > 1).flat();
  if (dupTitles.length) out.push(finding({ id: 'duplicate_titles', category: 'content', severity: dupTitles.length >= 5 ? 'medium' : 'low', title: 'Pages sharing the same title', saw: `${plural(dupTitles.length, 'page')} share a page title with another page.`, meaning: 'Identical titles make pages hard to tell apart in search results.', urls: dupTitles }));
  const noH1 = ok.filter((p) => (p.d!.h1?.length ?? 0) === 0);
  if (noH1.length) out.push(finding({ id: 'missing_h1', category: 'content', severity: noH1.some((p) => fam(p) === 'homepage') ? 'medium' : 'low', title: 'Pages without a main heading (H1)', saw: `${plural(noH1.length, 'page')} have no H1 heading${noH1.some((p) => fam(p) === 'homepage') ? ', including the homepage' : ''}.`, meaning: 'The main heading is the clearest statement of what a page is about.', urls: noH1.map(urlOf) }));
  const multiH1 = ok.filter((p) => (p.d!.h1?.length ?? 0) > 1);
  if (multiH1.length) out.push(finding({ id: 'multiple_h1', category: 'content', severity: 'low', title: 'Pages with more than one main heading', saw: `${plural(multiH1.length, 'page')} have several H1 headings.`, meaning: 'Minor; one main heading per page reads more clearly.', urls: multiH1.map(urlOf) }));
  const qPages = ok.filter((p) => [...(p.d!.h2 ?? []), ...(p.d!.h3 ?? [])].some((h) => /\?\s*$/.test(h)));
  const faqPages = ok.filter((p) => fam(p) === 'faq');
  if (qPages.length || faqPages.length) {
    out.push(finding({ id: 'answers_questions', category: 'content', severity: 'good', title: 'Answers customer questions directly', saw: `${plural(new Set([...qPages, ...faqPages].map(urlOf)).size, 'page')} carry question-style headings or an FAQ.`, meaning: 'Direct question-and-answer text is easy to quote.', urls: [...new Set([...faqPages, ...qPages].map(urlOf))] }));
  } else if (ok.length > 1 && ok.every((p) => Array.isArray(p.d!.h3))) {
    out.push(finding({ id: 'no_questions_answered', category: 'content', severity: 'low', absence: true, title: 'No pages answer customer questions directly', saw: `No FAQ page and no question-style headings (e.g. “How much does … cost?”)${readScope}.`, meaning: 'Clear answers to the questions customers actually ask give search engines and AI tools something specific to quote.', count: 0 }));
  }

  /* ── Local & trust evidence ─────────────────────────────────────────────────────────────────── */
  const reviews = biz('reviews');
  if (reviews.length) out.push(finding({ id: 'reviews_shown', category: 'local_evidence', severity: 'good', title: 'Reviews or testimonials on the site', saw: `Seen on ${plural(new Set(reviews.map((r) => r.url)).size, 'page')}, e.g. ${String(reviews[0].v).slice(0, 140)}`, meaning: 'Visible proof from real customers.', urls: [...new Set(reviews.map((r) => r.url))] }));
  else if (ok.length) out.push(finding({ id: 'no_reviews', category: 'local_evidence', severity: 'low', absence: true, title: 'No reviews or testimonials found on the site', saw: `No customer reviews or testimonials were found${readScope || ' on any page read'} (a reviews widget that loads by JavaScript would not be visible to us).`, meaning: 'Reviews shown on the site are visible proof a customer can check.', count: 0 }));
  const creds = biz('credentials');
  if (creds.length) {
    const names = [...new Set(creds.map((c) => String(c.v).split(' — ')[0]))];
    out.push(finding({ id: 'credentials', category: 'local_evidence', severity: 'good', title: 'Credentials or memberships stated', saw: names.join(', '), meaning: 'Stated qualifications a customer can verify.', urls: [...new Set(creds.map((c) => c.url))], evidence: creds.slice(0, 4).map((c) => String(c.v)) }));
  }
  const work = ok.filter((p) => fam(p) === 'gallery');
  if (work.length) out.push(finding({ id: 'work_shown', category: 'local_evidence', severity: 'good', title: 'Projects, gallery or case studies', saw: `${plural(work.length, 'page')} show past work.`, meaning: 'Real examples of work done.', urls: work.map(urlOf) }));
  const experience = biz('experience');
  if (experience.length) out.push(finding({ id: 'experience', category: 'local_evidence', severity: 'good', title: 'Years of experience stated', saw: `“${String(experience[0].v).slice(0, 160)}”`, meaning: 'A concrete, checkable claim.', urls: [...new Set(experience.map((e) => e.url))] }));
  const profiles = biz('profiles');
  if (profiles.length) {
    const names = [...new Set(profiles.map((p) => String(p.v).split(':')[0]))];
    out.push(finding({ id: 'profiles_linked', category: 'local_evidence', severity: 'good', title: 'Links to its profiles elsewhere', saw: names.join(', '), meaning: 'Linking the website to the business’s other profiles helps tie them together as one business.', urls: [...new Set(profiles.map((p) => String(p.v).replace(/^[^:]+:\s*/, '')))] }));
  }

  /* ── Technical basics ───────────────────────────────────────────────────────────────────────── */
  const noTitle = ok.filter((p) => !p.d!.title);
  if (noTitle.length) out.push(finding({ id: 'missing_title', category: 'technical', severity: 'medium', title: 'Pages without a title', saw: `${plural(noTitle.length, 'page')} have no <title>.`, meaning: 'The title is what search results show as the link.', urls: noTitle.map(urlOf) }));
  const noDesc = ok.filter((p) => !p.d!.description);
  if (noDesc.length) out.push(finding({ id: 'missing_description', category: 'technical', severity: 'low', title: 'Missing meta description', saw: `${plural(noDesc.length, 'page')} have no meta description.`, meaning: 'Search engines then write their own snippet from the page text.', urls: noDesc.map(urlOf) }));
  const longTitle = ok.filter((p) => (p.d!.title || '').length > AUDIT_TITLE_MAX);
  if (longTitle.length) out.push(finding({ id: 'long_titles', category: 'technical', severity: 'low', title: 'Long page titles', saw: `${plural(longTitle.length, 'page')} have titles over ${AUDIT_TITLE_MAX} characters.`, meaning: 'Long titles are usually cut off in search results.', urls: longTitle.map(urlOf) }));
  const viewportKnown = ok.filter((p) => typeof p.d!.viewport === 'boolean');
  const noViewport = viewportKnown.filter((p) => p.d!.viewport === false);
  if (noViewport.length) out.push(finding({ id: 'no_viewport', category: 'technical', severity: noViewport.some((p) => fam(p) === 'homepage') ? 'medium' : 'low', title: 'Pages not set up for phones', saw: `${plural(noViewport.length, 'page')} have no mobile viewport setting${noViewport.some((p) => fam(p) === 'homepage') ? ', including the homepage' : ''}.`, meaning: 'Without it, phones show a shrunken desktop page.', urls: noViewport.map(urlOf) }));
  if (!viewportKnown.length && ok.length) notChecked.push('Mobile viewport — this crawl predates the check.');
  notChecked.push('Page speed — not measured by this crawl.');

  /* ── Structured data ────────────────────────────────────────────────────────────────────────── */
  const invalidKnown = ok.filter((p) => typeof p.d!.jsonLdInvalid === 'number');
  const invalid = invalidKnown.filter((p) => (p.d!.jsonLdInvalid ?? 0) > 0);
  if (invalid.length) out.push(finding({ id: 'schema_malformed', category: 'structured_data', severity: 'medium', title: 'Broken structured data', saw: `${plural(invalid.length, 'page')} carry structured data (JSON-LD) that is not valid JSON.`, meaning: 'Broken markup cannot be read at all, so whatever it was meant to say is lost.', urls: invalid.map(urlOf) }));
  const bizSchemaPages = ok.filter((p) => (p.d!.schemaTypes ?? []).some((t) => BUSINESS_TYPE.test(t)));
  if (bizSchemaPages.length) out.push(finding({ id: 'business_schema', category: 'structured_data', severity: 'good', title: 'Business structured data present', saw: `Organization / LocalBusiness-type markup on ${plural(bizSchemaPages.length, 'page')}.`, meaning: 'The business’s details are also stated in machine-readable form.', urls: bizSchemaPages.map(urlOf) }));
  else if (ok.length) out.push(finding({ id: 'no_business_schema', category: 'structured_data', severity: 'low', absence: true, title: 'No business structured data', saw: `No Organization or LocalBusiness markup was found${readScope || ' on any page read'}.`, meaning: 'A small, accurate block stating the business name, address and phone is good housekeeping; on its own it is not a ranking fix.', count: 0 }));
  if (ok.length >= 10 && !ok.some((p) => (p.d!.schemaTypes ?? []).includes('BreadcrumbList'))) {
    out.push(finding({ id: 'no_breadcrumbs', category: 'structured_data', severity: 'low', absence: true, title: 'No breadcrumb markup', saw: `None of the ${fmt(ok.length)} pages read carries BreadcrumbList markup.`, meaning: 'Breadcrumbs describe how pages fit together; minor.', count: 0 }));
  }
  const schemaPhones = ok.flatMap((p) => (p.b?.schema ?? []).filter((s) => s.telephone).map((s) => ({ tel: s.telephone, url: urlOf(p) })));
  const shown = new Set(phones.map((p) => digits(String(p.v))).filter((d) => d.length >= 10));
  const clash = schemaPhones.filter((s) => digits(s.tel).length >= 10 && shown.size > 0 && ![...shown].some((d) => d === digits(s.tel)));
  if (clash.length) out.push(finding({ id: 'schema_phone_mismatch', category: 'structured_data', severity: 'medium', title: 'Structured data gives a different phone number', saw: `The markup says ${clash[0].tel}; the pages show ${String(phones[0].v)}.`, meaning: 'Conflicting details make it harder to be sure which is right.', urls: [...new Set(clash.map((c) => c.url))], evidence: [`markup: ${clash[0].tel}`, `page: ${String(phones[0].v)}`] }));

  out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);
  return { version: SITE_AUDIT_VERSION, basis: capped ? 'capped' : 'full', servedUrl, coverage, findings: out, notChecked };
}

/* ── stored rows (any age) → an audit ─────────────────────────────────────────────────────────── */

export interface StoredCrawlForAudit {
  url?: string | null;
  mode?: string | null;
  created_at?: string | null;
  result?: {
    url?: string | null;
    checked_at?: string | null;
    signals?: {
      fetchFailed?: boolean; searchBlocked?: string[]; readableAs?: string | null; clientRendered?: { flagged?: boolean } | null;
      missingH1?: boolean; noJsonLd?: boolean; duplicates?: { clusterSize: number; sampleSize: number; similarityPct: number } | null;
      pagesChecked?: number; thinPageUrls?: string[]; checkedPages?: Array<{ url: string; readable?: boolean }>;
    } | null;
    siteInfo?: { phone?: string | null; email?: string | null; address?: string | null; services?: string[] } | null;
    homeFetch?: HomeFetchIssue | null;
  } | null;
  full_evidence?: (Partial<FullCrawlEvidence> & { audit?: SiteAudit }) | null;
}

/** Why the homepage could not be read, classified from the fetch (crawl-check, 2026-10-05). */
export interface HomeFetchIssue {
  kind: 'timeout' | 'tls' | 'dns' | 'redirect_loop' | 'refused' | 'blocked' | 'http_error' | 'empty' | 'unknown';
  status?: number | null;
  detail?: string | null;
}

export const HOME_FETCH_LABELS: Record<HomeFetchIssue['kind'], string> = {
  timeout: 'The website did not respond in time.',
  tls: 'The website’s security certificate could not be verified (an HTTPS/TLS error).',
  dns: 'The web address does not resolve — the domain may have lapsed or be misspelt.',
  redirect_loop: 'The website redirects in a loop and never reaches a page.',
  refused: 'The website refused the connection.',
  blocked: 'The website answered every crawler we tried with an error or a bot-check page.',
  http_error: 'The website answered with an error instead of a page.',
  empty: 'The website answered, but with no readable page.',
  unknown: 'The website could not be reached.',
};

/** Classify a fetch error message / status into a HomeFetchIssue kind. Pure (edge + browser). */
export function classifyFetchError(input: { message?: string | null; status?: number | null; responded?: boolean; blocked?: boolean }): HomeFetchIssue['kind'] {
  const m = String(input.message ?? '').toLowerCase();
  if (input.blocked) return 'blocked';
  if (input.responded && input.status && input.status >= 400) return 'http_error';
  if (input.responded) return 'empty';
  if (/abort|timed? ?out|timeout/.test(m)) return 'timeout';
  if (/certificate|tls|ssl|handshake/.test(m)) return 'tls';
  if (/dns|lookup|name not resolved|enotfound|getaddrinfo|no such host/.test(m)) return 'dns';
  if (/redirect/.test(m)) return 'redirect_loop';
  if (/refused|reset|unreachable|econnrefused/.test(m)) return 'refused';
  return 'unknown';
}

/** The audit for a stored crawl row — the stored one when the crawl built it, else the most an older
 *  row honestly supports. Null when there is nothing to show (no row, or the site was not reachable —
 *  the caller shows the failure instead). Pure. */
export function auditFromStoredCrawl(row: StoredCrawlForAudit | null | undefined): SiteAudit | null {
  if (!row) return null;
  const full = row.mode === 'full' ? row.full_evidence ?? null : null;
  if (full?.audit && Number(full.audit.version) >= 1) return full.audit;
  const s = row.result?.signals ?? null;
  if (s?.fetchFailed) return null;
  const servedUrl = String(full?.servedUrl || row.result?.url || row.url || '');
  const findings: AuditFinding[] = [];
  const notChecked: string[] = [];

  if (full && Number(full.version ?? 0) >= 2) {
    // A full crawl from before the audit existed: its technical list kept up to 40 examples per issue.
    const KIND: Record<string, { id: string; category: AuditCategory; severity: AuditSeverity; title: string }> = {
      noindex: { id: 'noindex_pages', category: 'discovery', severity: 'medium', title: 'Pages that ask not to be listed (noindex)' },
      missing_title: { id: 'missing_title', category: 'technical', severity: 'medium', title: 'Pages without a title' },
      missing_description: { id: 'missing_description', category: 'technical', severity: 'low', title: 'Missing meta description' },
      missing_h1: { id: 'missing_h1', category: 'content', severity: 'low', title: 'Pages without a main heading (H1)' },
      multiple_h1: { id: 'multiple_h1', category: 'content', severity: 'low', title: 'Pages with more than one main heading' },
      thin: { id: 'thin_pages', category: 'content', severity: 'low', title: 'Thin pages' },
      duplicate_title: { id: 'duplicate_titles', category: 'content', severity: 'low', title: 'Pages sharing the same title' },
      canonical_off_site: { id: 'canonical_off_site', category: 'discovery', severity: 'high', title: 'Pages name a different website as their main version' },
      broken: { id: 'broken_pages', category: 'discovery', severity: 'medium', title: 'Linked pages that return an error' },
      unreachable: { id: 'unreachable_pages', category: 'discovery', severity: 'low', title: 'Pages that did not answer' },
      redirected: { id: 'internal_redirects', category: 'discovery', severity: 'low', title: 'Internal addresses that redirect' },
      sitemap_off_site: { id: 'sitemap_off_site', category: 'discovery', severity: 'medium', title: 'The sitemap lists addresses on a different website' },
      no_sitemap: { id: 'no_sitemap', category: 'discovery', severity: 'medium', title: 'No XML sitemap found' },
      no_robots: { id: 'no_robots', category: 'discovery', severity: 'low', title: 'No robots.txt file' },
      no_schema_home: { id: 'no_business_schema', category: 'structured_data', severity: 'low', title: 'Homepage has no structured data' },
    };
    for (const t of full.technical ?? []) {
      const k = KIND[t.kind];
      if (!k) continue;
      findings.push({ ...k, saw: t.count ? `${plural(t.count, 'page')}: ${t.detail}` : t.detail, meaning: '', count: t.count, urls: t.urls ?? [], urlsComplete: (t.urls ?? []).length >= t.count });
    }
    if (full.robots?.disallowsAll) findings.push(finding({ id: 'robots_blocks_all', category: 'ai_access', severity: 'high', title: 'robots.txt tells every crawler to stay away', saw: 'robots.txt says “Disallow: /” for all crawlers.', meaning: 'Crawlers that respect robots.txt are asked not to read any page.', count: 0 }));
    const b = full.business;
    if (b?.credentials?.length) findings.push(finding({ id: 'credentials', category: 'local_evidence', severity: 'good', title: 'Credentials or memberships stated', saw: [...new Set(b.credentials.map((c) => c.value.split(' — ')[0]))].join(', '), meaning: 'Stated qualifications a customer can verify.', urls: [...new Set(b.credentials.map((c) => c.url))] }));
    if (b?.reviews?.length) findings.push(finding({ id: 'reviews_shown', category: 'local_evidence', severity: 'good', title: 'Reviews or testimonials on the site', saw: b.reviews[0].value.slice(0, 140), meaning: 'Visible proof from real customers.', urls: [...new Set(b.reviews.map((c) => c.url))] }));
    if (b?.phones?.length) findings.push(finding({ id: 'phone_shown', category: 'entity', severity: 'good', title: 'Phone number shown', saw: b.phones[0].value, meaning: 'Customers can find how to contact the business.', urls: [b.phones[0].url] }));
    notChecked.push('This crawl ran before the detailed audit existed: AI crawler rules, business clarity, mobile and link-depth checks need a re-crawl. Lists show up to 40 examples per issue.');
  } else if (s) {
    if (s.searchBlocked?.length) findings.push(finding({ id: 'search_crawler_refused', category: 'ai_access', severity: 'high', title: 'The site refused AI search crawlers', saw: `Requested as ${s.searchBlocked.join(', ')}, the homepage answered with an error or a bot-check page.`, meaning: 'An AI assistant that fetches the page may get nothing to read.', evidence: s.searchBlocked, count: 0 }));
    if (s.clientRendered?.flagged) findings.push(finding({ id: 'client_rendered', category: 'ai_access', severity: 'medium', title: 'Homepage text only appears after JavaScript runs', saw: 'The homepage HTML carries very little readable text.', meaning: 'Crawlers that do not run JavaScript may see an almost empty page.', count: 0 }));
    if (s.duplicates) findings.push(finding({ id: 'near_duplicate_pages', category: 'content', severity: 'medium', title: 'Near-identical location or service pages', saw: `${plural(s.duplicates.clusterSize, 'page')} follow one template; those compared are about ${s.duplicates.similarityPct}% the same.`, meaning: 'Pages that differ only by a town name may be treated as copies.', count: s.duplicates.clusterSize }));
    if (s.thinPageUrls?.length) findings.push(finding({ id: 'thin_pages', category: 'content', severity: 'low', title: 'Thin pages', saw: `${plural(s.thinPageUrls.length, 'checked page')} have under ${AUDIT_THIN_WORDS} words.`, meaning: 'Very short pages say little about what the business does.', urls: s.thinPageUrls }));
    if (s.missingH1) findings.push(finding({ id: 'missing_h1', category: 'content', severity: 'medium', title: 'Homepage has no main heading (H1)', saw: 'The homepage has no H1 heading.', meaning: 'The main heading is the clearest statement of what a page is about.', count: 0 }));
    if (s.noJsonLd) findings.push(finding({ id: 'no_business_schema', category: 'structured_data', severity: 'low', title: 'Homepage has no structured data', saw: 'No JSON-LD on the homepage.', meaning: 'Good housekeeping; on its own not a ranking fix.', count: 0 }));
    if (row.result?.siteInfo?.phone) findings.push(finding({ id: 'phone_shown', category: 'entity', severity: 'good', title: 'Phone number shown', saw: row.result.siteInfo.phone, meaning: 'Customers can find how to contact the business.', count: 0 }));
    notChecked.push(`This was a quick check of up to ${s.pagesChecked ?? 12} pages, not a full crawl. Run "Crawl site" for the complete audit.`);
  } else {
    return null;
  }
  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);
  const basis: AuditBasis = full ? 'full_legacy' : 'quick';
  return { version: SITE_AUDIT_VERSION, basis, servedUrl, coverage: full?.coverage ?? null, findings, notChecked };
}

/** Findings grouped by category in display order, each group worst-first. */
export function groupFindings(findings: AuditFinding[]): Array<{ category: AuditCategory; label: string; findings: AuditFinding[] }> {
  return AUDIT_CATEGORY_ORDER.map((category) => ({ category, label: AUDIT_CATEGORY_LABELS[category], findings: findings.filter((f) => f.category === category) }))
    .filter((g) => g.findings.length > 0);
}

export function severityCounts(findings: AuditFinding[]): Record<AuditSeverity, number> {
  const c: Record<AuditSeverity, number> = { high: 0, medium: 0, low: 0, good: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}
