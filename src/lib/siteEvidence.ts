/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SITE EVIDENCE — the deep sales crawl's PHASE 1 findings (2026-09-22).

   WHAT THIS IS FOR. The crawl already proves four things (a blocked search crawler, a homepage that
   is empty when fetched, near-identical town pages, thin pages). The findings that actually SELL,
   measured on the ones Paul closed by hand, are the ones a prospect can verify in a minute on their
   own site: a sitemap listing a different web address, a page naming a different site as the real
   one, business markup pointing somewhere else, a main page marked not to be listed. All four are
   already inside bytes `crawl-check` fetches and throws away. This module is what stops throwing
   them away.

   ⛔ PURE. No fetch, no DOM, no platform globals, no React. It runs in the edge function (Deno) and
   in the tests (Node/tsx), and the edge imports it with a relative `.ts` path exactly as it imports
   crawlCheck.ts (CLAUDE.md §3). Every threshold is a named const.

   ⛔ NO CUSTOMER PROSE LIVES HERE, AND THAT IS STRUCTURAL RATHER THAN TIDY. `summary` is written for
   an operator reading a list. The words a prospect sees are written in exactly two places —
   src/lib/siteFindings.ts for WhatsApp and src/lib/aiAuditReportHtml.ts for the report — because
   those two are what scripts/site-findings.test.ts and scripts/client-copy-claims.test.ts read. A
   customer sentence written HERE would be a customer sentence nothing checks.

   ⛔ NO `whatsapp_eligible` BOOLEAN AND NO SCORE. `tier` plus the selection rule derives eligibility.
   A stored verdict freezes an old row at a stale rule (CLAUDE.md §6, "derived, never stored"), and a
   universal score is the thing this product exists not to be.

   🔴 EVERY FINDING CARRIES THE BYTES IT WAS READ FROM. `evidence.observed` is verbatim — the actual
   <loc>, the actual href, the actual URL out of the markup. That is what the report shows, what Paul
   quotes on a call, and the only reason a prospect believes any of it. A finding we cannot point at
   a string for does not get made.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { crawlPageKind } from './crawlCheck.ts';

/** Bump when the MEANING of a stored evidence finding changes.
 *  ⛔ SEPARATE FROM CRAWL_CHECK_VERSION, DELIBERATELY AND PERMANENTLY. That constant gates the
 *  report's fault section AND the audit_followup_fault template for every stored lead; bumping it to
 *  ship a new finding would blank both for the whole book until every lead was re-crawled. This is
 *  the same separation siteInfo.ts made for SITE_INFO_VERSION, for the same reason. */
export const SITE_EVIDENCE_VERSION = 1;

/* ── The kinds ────────────────────────────────────────────────────────────────────────────────── */

/** Phase 1 only. Everything else in the architecture report (identity contradictions, orphaning,
 *  service clarity, dead links, cannibalisation) is deliberately NOT here yet — each one needs
 *  either a wider crawl or a judgement call, and this phase is the set that is observed, bounded and
 *  verifiable by the prospect without us explaining anything. */
export type EvidenceKind =
  | 'sitemap_wrong_domain'
  | 'canonical_off_domain'
  | 'schema_wrong_domain'
  | 'noindex_important_page';

/** How much commercial weight a kind carries. Fixed per kind, never computed — a computed severity
 *  invites tuning, and tuning a sales message against a number nobody can interpret is how this
 *  becomes an SEO tool. */
export const EVIDENCE_SEVERITY: Record<EvidenceKind, 1 | 2 | 3 | 4 | 5> = {
  sitemap_wrong_domain: 5,
  canonical_off_domain: 5,
  schema_wrong_domain: 5,
  noindex_important_page: 4,
};

/** Ranking order for selection. Lower index wins. Matches EVIDENCE_SEVERITY and is stated separately
 *  so the tie between three severity-5 kinds is decided here rather than by object key order. */
export const EVIDENCE_PRIORITY: readonly EvidenceKind[] = [
  'sitemap_wrong_domain',
  'canonical_off_domain',
  'schema_wrong_domain',
  'noindex_important_page',
] as const;

/** 🔴 THE THEME, AND WHY IT EXISTS. sitemap / canonical / schema wrong-domain are three readings of
 *  ONE story: the site disagrees with itself about which web address it is. Saying two of them in a
 *  cold message is the same complaint twice, which reads as padding and undoes the specificity the
 *  whole message is for. The selector takes the strongest of a theme and drops the rest. */
export type EvidenceTheme = 'domain_conflict' | 'indexability';
export const EVIDENCE_THEME: Record<EvidenceKind, EvidenceTheme> = {
  sitemap_wrong_domain: 'domain_conflict',
  canonical_off_domain: 'domain_conflict',
  schema_wrong_domain: 'domain_conflict',
  noindex_important_page: 'indexability',
};

/** 'observed' = we hold the bytes this was read from. 'inferred' = a comparison across observations.
 *  Only 'observed' is ever eligible to lead a cold message. Every Phase 1 finding is observed; the
 *  field exists because Phase 2's identity contradictions will not be. */
export type EvidenceCertainty = 'observed' | 'inferred';

/** A — strong enough for a cold WhatsApp. B — supporting evidence for the report. C — internal only.
 *  Assigned per finding (not per kind): a noindex on a main service page is A, the same tag on a
 *  privacy page is not. */
export type EvidenceTier = 'A' | 'B' | 'C';

export interface SiteEvidenceFinding {
  kind: EvidenceKind;
  severity: 1 | 2 | 3 | 4 | 5;
  certainty: EvidenceCertainty;
  tier: EvidenceTier;
  /** The page the finding is ON, when it has one. Null for a whole-site finding (the sitemap). */
  pageUrl: string | null;
  evidence: {
    /** The proof, VERBATIM from the response — the offending <loc>, the href, the URL in the markup.
     *  Capped so one bad sitemap cannot write a megabyte into a jsonb column. */
    observed: string[];
    /** Where it was read from. A file or a document, never prose. */
    source: string;
    /** The thing the observed values disagree WITH — normally the domain the site is served from. */
    subject?: string;
    /** Counts behind a plural claim, so the report can be honest about the denominator. */
    counted?: { matched: number; of: number };
  };
  /** OPERATOR-facing one line. Never shown to a prospect. */
  summary: string;
}

export interface SiteEvidence {
  version: number;
  findings: SiteEvidenceFinding[];
}

/* ── Limits ───────────────────────────────────────────────────────────────────────────────────── */

/** Proof strings kept per finding. Three offending URLs is plenty for a report line and a phone call. */
export const MAX_OBSERVED = 3;
/** Sitemap <loc> values considered at all. A 300-page site's structure is legible long before this. */
export const MAX_SITEMAP_LOCS = 2_000;
/** Below this many usable sitemap URLs there is not enough to call a pattern a pattern. */
export const MIN_SITEMAP_LOCS_FOR_VERDICT = 5;
/** …and the off-domain group must be at least this many URLs. Two strays are two strays. */
export const MIN_OFFDOMAIN_LOCS = 3;
/** …and this share of the sitemap. Below it we say nothing rather than overstate a stray URL as
 *  "your sitemap points at the wrong site" — the exact overclaim the brief refuses. */
export const OFFDOMAIN_SHARE = 0.6;

/* ── Registrable domain ───────────────────────────────────────────────────────────────────────── */

/** Public-suffix tails that take a THIRD label to reach the registrable name. Not the full PSL — a
 *  1,700-entry list in an edge closure to serve UK trade businesses is not a trade worth making.
 *  The UK entries are the ones that matter here; the rest are the common ones a UK site might use. */
const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk', 'gov.uk',
  'nhs.uk', 'police.uk', 'mod.uk', 'com.au', 'net.au', 'org.au', 'gov.au', 'co.nz', 'net.nz',
  'co.za', 'com.br', 'co.jp', 'co.in', 'com.sg', 'co.il', 'com.mt', 'co.ie',
]);

/**
 * The registrable domain of a URL or bare hostname, lower-cased — or null when it is not one.
 *
 * 🔴 THIS COMPARISON IS THE WHOLE PHASE. www vs apex, http vs https, a trailing slash, a different
 * path and a port are all the SAME registrable domain and must never produce a finding; the brief
 * names each of them. mc-locksmiths.com vs mclocksmiths.co.uk are DIFFERENT and are the finding.
 */
export function registrableDomain(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  let host = '';
  try {
    host = new URL(raw).hostname;
  } catch {
    // A bare hostname is acceptable; anything with a slash or a space is not a hostname.
    if (/[\s/\\]/.test(raw)) return null;
    host = raw;
  }
  host = host.toLowerCase().replace(/\.+$/, '');
  if (!host || !host.includes('.')) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return host;   // an IP is its own "domain"
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length === 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

/** True when two URLs/hosts sit on the same registrable domain. Unknown on either side → SAME, so an
 *  unparseable value can never manufacture a finding (absence is never an answer, CLAUDE.md §6). */
export function sameRegistrableDomain(a: string, b: string): boolean {
  const ra = registrableDomain(a);
  const rb = registrableDomain(b);
  if (!ra || !rb) return true;
  return ra === rb;
}

/* ── Reading the markup ───────────────────────────────────────────────────────────────────────── */

const stripComments = (html: string) => (html || '').replace(/<!--[\s\S]*?-->/g, ' ');

/**
 * The `<link rel="canonical">` href, resolved against the page it was found on, or null.
 *
 * ⚠️ HTML COMMENTS ARE STRIPPED FIRST. Page builders leave commented-out canonical tags behind, and
 * a commented tag is not what the page says — reading one would be a finding about nothing.
 * ⚠️ `rel` is matched allowing other tokens ("canonical shortlink") and either attribute order,
 * because both appear in the wild and a regex that only handles one silently finds nothing.
 */
export function extractCanonical(html: string, pageUrl: string): string | null {
  const src = stripComments(html);
  const re = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const tag = m[0];
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1] ?? '';
    if (!/(^|\s)canonical(\s|$)/i.test(rel.trim())) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim();
    if (!href) continue;
    try { return new URL(href, pageUrl).href; } catch { return null; }
  }
  return null;
}

/** True when a robots directive string asks for noindex. Covers `noindex` and `none` (which means
 *  noindex,nofollow). Case- and whitespace-insensitive. */
export function directiveHasNoindex(value: string | null | undefined): boolean {
  const v = String(value ?? '').toLowerCase();
  if (!v) return false;
  return /(^|[\s,;])(noindex|none)([\s,;]|$)/.test(v);
}

/** The robots directives a PAGE declares in its markup: `<meta name="robots">` and the engine-
 *  specific variants that carry the same weight. Returns the raw contents for the evidence string. */
export function metaRobotsDirectives(html: string): string[] {
  const src = stripComments(html);
  const out: string[] = [];
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const tag = m[0];
    const name = /\bname\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    if (!/^(robots|googlebot|bingbot)$/.test(name)) continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.trim();
    if (content) out.push(`<meta name="${name}" content="${content}">`);
  }
  return out;
}

/**
 * JSON-LD nodes, flattened.
 *
 * ⚠️ NOT SHARED WITH siteInfo.ts's copy, on purpose. This module is imported by siteFindings.ts,
 * which the WhatsApp senders import; importing siteInfo.ts to borrow eleven lines would pull its
 * social/directory/platform tables into that edge closure for nothing. Parsing a script tag is a
 * primitive, not a rule (CLAUDE.md §4 is about RULES living in one place).
 */
// deno-lint-ignore no-explicit-any
function jsonLdNodes(html: string): any[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html || '')) !== null) {
    try {
      const stack: unknown[] = [JSON.parse(m[1].trim())];
      let guard = 0;
      while (stack.length && guard++ < 5_000) {
        const n = stack.pop();
        if (Array.isArray(n)) stack.push(...n);
        else if (n && typeof n === 'object') {
          out.push(n);
          for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v);
        }
      }
    } catch { /* a malformed block is skipped, never fatal */ }
  }
  // deno-lint-ignore no-explicit-any
  return out as any[];
}

/** Schema types whose `url` is a claim about WHICH WEBSITE THIS IS. Anything else (a Product, a
 *  Person, a BreadcrumbList) can legitimately carry an off-site url and is not read. */
const SITE_IDENTITY_TYPE = /(^|[^a-z])(website|organization|organisation|localbusiness|professionalservice|homeandconstructionbusiness|store|corporation|ngo|plumber|locksmith|electrician|roofingcontractor|generalcontractor|hvacbusiness|movingcompany|automotivebusiness|dentist|legalservice|accountingservice|realestateagent|healthandbeautybusiness|foodestablishment)([^a-z]|$)/i;

function nodeTypes(node: { '@type'?: unknown }): string[] {
  const t = node?.['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

/* ── Page importance ──────────────────────────────────────────────────────────────────────────── */

/** Paths where a noindex is NORMAL PRACTICE and flagging it would be wrong. Legal pages, archives,
 *  pagination, transactional and utility pages are all routinely and correctly excluded by their
 *  owners; a message telling a locksmith his privacy policy is "marked not to be listed" is the
 *  automated-scan tell this whole piece of work exists to avoid. */
const UTILITY_PATH =
  /(^|\/)(privacy|privacy-policy|terms|terms-and-conditions|terms-of-service|cookie|cookies|cookie-policy|legal|disclaimer|accessibility|sitemap|thank-you|thanks|thankyou|cart|basket|checkout|account|my-account|login|logout|register|search|feed|rss|wp-json|wp-admin|admin|tag|tags|category|categories|author|page)(\/|$)/i;
/** WordPress-style pagination and date archives — /page/2, /2024/05/. */
const ARCHIVE_PATH = /(^|\/)page\/\d+(\/|$)|(^|\/)(19|20)\d{2}(\/\d{1,2})?(\/|$)/;

export type PageImportance = 'home' | 'commercial' | 'supporting' | 'utility';

/**
 * How central a page is, from its URL alone.
 *
 * 🔴 ASSERT ON THE GRADE YOU WANT, NEVER THE ONE YOU EXCLUDE (CLAUDE.md §4, sixteen recorded
 * instances). The caller promotes to Tier A on `=== 'home' || === 'commercial'` — so a URL this
 * function cannot place falls to 'supporting' and is report-only, which is the safe direction. It
 * can never fall THROUGH into Tier A.
 */
export function pageImportance(url: string, homeUrl: string): PageImportance {
  let path = '';
  try { path = new URL(url).pathname; } catch { return 'supporting'; }
  const homePath = (() => { try { return new URL(homeUrl).pathname; } catch { return '/'; } })();
  const norm = (p: string) => p.replace(/\/+$/, '') || '/';
  if (norm(path) === norm(homePath) || norm(path) === '/') return 'home';
  if (UTILITY_PATH.test(path) || ARCHIVE_PATH.test(path)) return 'utility';
  const kind = crawlPageKind(url);
  if (kind === 'service' || kind === 'location') return 'commercial';
  return 'supporting';
}

/* ── The input ────────────────────────────────────────────────────────────────────────────────── */

/** One response the crawl actually made, with everything it is now asked to keep. */
export interface EvidencePage {
  /** The URL we asked for. */
  requestedUrl: string;
  /** Where we ended up after redirects. */
  finalUrl: string;
  status: number;
  /** The X-Robots-Tag response header verbatim, or null when absent. */
  xRobotsTag: string | null;
  html: string;
  /** True for the page the site is served from. */
  isHome?: boolean;
}

export interface SiteEvidenceInput {
  /** Where the homepage ACTUALLY resolved to after redirects — the site's own address, and the
   *  thing every domain comparison is made against. */
  servedUrl: string;
  /** Every page read, homepage included. */
  pages: EvidencePage[];
  /** Sitemap <loc> values RAW — BEFORE any same-origin filter. The filtered-out ones are the
   *  finding; discarding them is what made the MCL case invisible. */
  sitemapLocs: string[];
  /** Which sitemap files were read, for the evidence line. */
  sitemapUrls: string[];
}

/* ── The detectors ────────────────────────────────────────────────────────────────────────────── */

const cap = (xs: string[]) => xs.slice(0, MAX_OBSERVED);

/**
 * A. SITEMAP WRONG DOMAIN — the MCL finding.
 *
 * ⛔ ONLY WHEN IT IS THE SITEMAP'S PATTERN, NOT ONE STRAY URL. Three gates, all required: at least
 * MIN_SITEMAP_LOCS_FOR_VERDICT usable URLs to judge at all, the off-domain group at least
 * MIN_OFFDOMAIN_LOCS URLs, and at least OFFDOMAIN_SHARE of the file. A sitemap with one link to a
 * supplier is not "pointing at a different website", and saying so to a prospect who then opens the
 * file is worse than saying nothing.
 * ⚠️ The DOMINANT foreign domain is what is reported, so a sitemap with strays on five different
 * domains cannot add them together into a verdict about any one of them.
 */
function sitemapWrongDomain(input: SiteEvidenceInput): SiteEvidenceFinding | null {
  const served = registrableDomain(input.servedUrl);
  if (!served) return null;
  const usable: Array<{ url: string; domain: string }> = [];
  for (const loc of input.sitemapLocs.slice(0, MAX_SITEMAP_LOCS)) {
    if (!/^https?:\/\//i.test(loc)) continue;
    const d = registrableDomain(loc);
    if (d) usable.push({ url: loc, domain: d });
  }
  if (usable.length < MIN_SITEMAP_LOCS_FOR_VERDICT) return null;

  const byDomain = new Map<string, string[]>();
  for (const u of usable) {
    if (u.domain === served) continue;
    const list = byDomain.get(u.domain) ?? [];
    list.push(u.url);
    byDomain.set(u.domain, list);
  }
  if (!byDomain.size) return null;
  const [worstDomain, worstUrls] = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (worstUrls.length < MIN_OFFDOMAIN_LOCS) return null;
  if (worstUrls.length / usable.length < OFFDOMAIN_SHARE) return null;

  return {
    kind: 'sitemap_wrong_domain',
    severity: EVIDENCE_SEVERITY.sitemap_wrong_domain,
    certainty: 'observed',
    tier: 'A',
    pageUrl: input.sitemapUrls[0] ?? null,
    evidence: {
      observed: cap(worstUrls),
      source: input.sitemapUrls[0] ?? 'sitemap',
      subject: served,
      counted: { matched: worstUrls.length, of: usable.length },
    },
    summary: `Sitemap lists ${worstUrls.length} of ${usable.length} URLs on ${worstDomain}; the site is served from ${served}.`,
  };
}

/**
 * B. CANONICAL OFF DOMAIN.
 *
 * ⛔ REGISTRABLE DOMAIN ONLY. A canonical differing by www, by http/https, by a trailing slash or by
 * a path is a canonical doing its job — those are the four the brief names and all four are the same
 * registrable domain, so `sameRegistrableDomain` disposes of every one of them without a special
 * case per shape.
 */
function canonicalOffDomain(input: SiteEvidenceInput): SiteEvidenceFinding | null {
  const served = registrableDomain(input.servedUrl);
  if (!served) return null;
  const hits: Array<{ page: string; canonical: string; domain: string }> = [];
  for (const p of input.pages) {
    if (!p.html) continue;
    const href = extractCanonical(p.html, p.finalUrl || p.requestedUrl);
    if (!href) continue;
    const d = registrableDomain(href);
    if (!d || d === served) continue;
    hits.push({ page: p.finalUrl || p.requestedUrl, canonical: href, domain: d });
  }
  if (!hits.length) return null;
  const first = hits[0];
  return {
    kind: 'canonical_off_domain',
    severity: EVIDENCE_SEVERITY.canonical_off_domain,
    certainty: 'observed',
    tier: 'A',
    pageUrl: first.page,
    evidence: {
      observed: cap(hits.map((h) => h.canonical)),
      source: hits.length === 1 ? first.page : `${hits.length} pages, including ${first.page}`,
      subject: served,
      counted: { matched: hits.length, of: input.pages.length },
    },
    summary: `${hits.length} page(s) name ${first.domain} as the main version; the site is served from ${served}.`,
  };
}

/**
 * C. SCHEMA WRONG DOMAIN.
 *
 * ⛔ CONSERVATIVE BY CONSTRUCTION, THREE WAYS. Only `url`, only on a node whose type is a claim about
 * which WEBSITE or BUSINESS this is, and only when that url is absolute and on a different
 * registrable domain.
 * ⛔ `@id` IS NEVER READ. The brief says so and the wild agrees: plugins emit @id values with a
 * trailing slash, a #fragment, an http scheme or a bare path, none of which is a conflict, and a
 * check that read them would fire on half the WordPress sites in the book.
 * ⛔ `sameAs` IS NEVER READ EITHER. Pointing at Facebook is what it is FOR.
 */
function schemaWrongDomain(input: SiteEvidenceInput): SiteEvidenceFinding | null {
  const served = registrableDomain(input.servedUrl);
  if (!served) return null;
  const hits: Array<{ page: string; url: string; domain: string; type: string }> = [];
  for (const p of input.pages) {
    if (!p.html) continue;
    for (const node of jsonLdNodes(p.html)) {
      const types = nodeTypes(node);
      const type = types.find((t) => SITE_IDENTITY_TYPE.test(t));
      if (!type) continue;
      const raw = typeof node.url === 'string' ? node.url.trim() : '';
      if (!/^https?:\/\//i.test(raw)) continue;      // relative or absent → not a claim we can read
      const d = registrableDomain(raw);
      if (!d || d === served) continue;
      hits.push({ page: p.finalUrl || p.requestedUrl, url: raw, domain: d, type });
    }
  }
  if (!hits.length) return null;
  const first = hits[0];
  return {
    kind: 'schema_wrong_domain',
    severity: EVIDENCE_SEVERITY.schema_wrong_domain,
    certainty: 'observed',
    tier: 'A',
    pageUrl: first.page,
    evidence: {
      observed: cap([...new Set(hits.map((h) => h.url))]),
      source: `${first.type} markup on ${first.page}`,
      subject: served,
      counted: { matched: hits.length, of: input.pages.length },
    },
    summary: `Business markup gives ${first.domain} as the site address; the site is served from ${served}.`,
  };
}

/**
 * D. NOINDEX ON AN IMPORTANT PAGE.
 *
 * Two sources, both read: the page's own `<meta name="robots">` and the `X-Robots-Tag` response
 * header. Either one carries the instruction on its own.
 *
 * ⛔ THE TIER IS DECIDED BY THE PAGE, NOT BY THE TAG. Homepage or a service/location page → A. A
 * privacy page, an archive, a paginated URL, a thank-you page → the finding is still RECORDED (it is
 * true, and the report may want it) but at Tier C, so it can never reach a cold message. Anything
 * this codebase cannot place confidently lands at 'supporting' → Tier B. One finding, carrying the
 * most important page found, so a site with a noindexed homepage and forty noindexed tag archives
 * says the one thing that matters.
 */
function noindexImportantPage(input: SiteEvidenceInput): SiteEvidenceFinding | null {
  const home = input.pages.find((p) => p.isHome)?.finalUrl ?? input.servedUrl;
  const hits: Array<{ page: string; proof: string; importance: PageImportance }> = [];
  for (const p of input.pages) {
    const url = p.finalUrl || p.requestedUrl;
    const proofs: string[] = [];
    if (directiveHasNoindex(p.xRobotsTag)) proofs.push(`X-Robots-Tag: ${p.xRobotsTag}`);
    for (const tag of metaRobotsDirectives(p.html)) {
      const content = /content="([^"]*)"/i.exec(tag)?.[1] ?? '';
      if (directiveHasNoindex(content)) proofs.push(tag);
    }
    if (!proofs.length) continue;
    hits.push({ page: url, proof: proofs[0], importance: pageImportance(url, home) });
  }
  if (!hits.length) return null;
  const rank: Record<PageImportance, number> = { home: 0, commercial: 1, supporting: 2, utility: 3 };
  hits.sort((a, b) => rank[a.importance] - rank[b.importance]);
  const worst = hits[0];
  const tier: EvidenceTier =
    worst.importance === 'home' || worst.importance === 'commercial' ? 'A'
    : worst.importance === 'supporting' ? 'B'
    : 'C';
  const sameTier = hits.filter((h) => rank[h.importance] === rank[worst.importance]);
  return {
    kind: 'noindex_important_page',
    severity: EVIDENCE_SEVERITY.noindex_important_page,
    certainty: 'observed',
    tier,
    pageUrl: worst.page,
    evidence: {
      observed: cap(sameTier.map((h) => `${h.page} — ${h.proof}`)),
      source: worst.page,
      subject: worst.importance,
      counted: { matched: hits.length, of: input.pages.length },
    },
    summary: `${hits.length} page(s) ask not to be listed; the most important is a ${worst.importance} page (${worst.page}).`,
  };
}

/* ── The build ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Every Phase 1 finding the crawl's own bytes support, strongest first.
 *
 * Never throws: a detector that trips on a malformed page yields no finding rather than failing the
 * crawl the operator asked for. The crawl is the product here; the evidence is an addition to it.
 */
export function buildSiteEvidence(input: SiteEvidenceInput): SiteEvidence {
  const detectors = [sitemapWrongDomain, canonicalOffDomain, schemaWrongDomain, noindexImportantPage];
  const findings: SiteEvidenceFinding[] = [];
  for (const d of detectors) {
    try {
      const f = d(input);
      if (f) findings.push(f);
    } catch { /* one detector's bad day is not the crawl's */ }
  }
  findings.sort((a, b) => EVIDENCE_PRIORITY.indexOf(a.kind) - EVIDENCE_PRIORITY.indexOf(b.kind));
  return { version: SITE_EVIDENCE_VERSION, findings };
}

/* ── Reading it back ──────────────────────────────────────────────────────────────────────────── */

/**
 * The findings a STORED evidence block may be believed for, or [] when it may not.
 *
 * ⛔ AN OLD ROW WITH NO EVIDENCE RETURNS [], NEVER THROWS AND NEVER BLOCKS ANYTHING. Every crawl row
 * written before this shipped has no `evidence` key at all, and the whole rest of the system —
 * signals, siteInfo, the fault section, the audit_followup_fault gate — has to keep working on those
 * rows exactly as it did. This function is the only thing that reads the new key.
 */
export function usableSiteEvidence(
  result: { evidence?: SiteEvidence | null; evidenceVersion?: number } | null | undefined,
  createdAtMs: number,
  freshMs: number,
): SiteEvidenceFinding[] {
  const ev = result?.evidence;
  if (!ev || !Array.isArray(ev.findings) || !ev.findings.length) return [];
  const version = result?.evidenceVersion ?? ev.version ?? 0;
  if (version < SITE_EVIDENCE_VERSION) return [];
  if (!(Date.now() - createdAtMs < freshMs)) return [];
  return ev.findings.filter((f) => !!f && typeof f.kind === 'string');
}

/**
 * The findings eligible to lead a cold message: Tier A, observed, and at most ONE per theme.
 *
 * 🔴 THE THEME RULE IS NOT TIDINESS. sitemap / canonical / schema wrong-domain are one story told
 * three ways; two of them in a message is the same complaint twice, and a prospect reads repetition
 * as padding — which is exactly what makes a message sound generated rather than looked-at.
 */
export function selectableEvidence(findings: SiteEvidenceFinding[]): SiteEvidenceFinding[] {
  const seen = new Set<EvidenceTheme>();
  return findings
    .filter((f) => f.tier === 'A' && f.certainty === 'observed' && EVIDENCE_PRIORITY.includes(f.kind))
    .sort((a, b) => EVIDENCE_PRIORITY.indexOf(a.kind) - EVIDENCE_PRIORITY.indexOf(b.kind))
    .filter((f) => {
      const theme = EVIDENCE_THEME[f.kind];
      if (seen.has(theme)) return false;
      seen.add(theme);
      return true;
    });
}
