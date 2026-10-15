/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ONE WEBSITE CHECK (2026-10-15, feat/send-error-capture; docs/website-check.md).

   Before this, a lead's website was judged by several readers with different rules over different
   copies of the crawl: the Inbox's crawl icon read 6 signals off the lead row ("No AI-visibility faults
   found"), the call script merged three other pools and read an AUDIT RUN's copy first, the report read
   the run copy again with its own picks. The same lead could be "clean" in one place and "an issue was
   found" in another.

   NOW: ONE stored result per lead — lead_crawl_checks — and ONE summary of it, `result.websiteCheck`,
   written by BOTH crawls at the moment they store (crawl-check's quick check and crawl-job's deep
   check), from the ONE grouped, evidenced audit (siteAudit.ts: auditFromStoredCrawl, content & trust
   merged). Every screen that shows website findings reads it through `websiteCheckFor` — the Inbox
   icon and its popup, the call script and call card, the report, the lead's audit, the sales pre-call
   check. They cannot disagree because there is nothing else to read.

   ⛔ Every issue is something READ on a page (or in robots.txt / a sitemap), with the page(s) it was
      read on. Nothing is invented; an empty list is said plainly ("No serious website issues found").
   ⛔ SERIOUS = high or medium. Low findings are "minor points": listed, never the headline, never read
      out first. Schema and website polish were tested NEGATIVE as levers (CLAUDE.md §5) — they are low.
   ⛔ llms.txt is never checked and never an issue. GPTBot is never required.
   ⛔ A row written before this existed has no summary: it is computed from the row the same way
      (summariseWebsiteCheck), so an old row and a new one read alike.

   Pure; no I/O. IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { auditFromStoredCrawl, HOME_FETCH_LABELS, type AuditFinding, type StoredCrawlForAudit, type SiteAudit } from './siteAudit.ts';
import { isBrokenPageStatus } from './contentTrust.ts';
import { classifyLeadWebsite } from './leadWebsiteKind.ts';
import { usableSiteEvidence, type EvidenceKind, type SiteEvidence } from './siteEvidence.ts';
import { SPEAK_MIN_PRIORITY, usableInsights, type InsightKind } from './salesInsights.ts';

export const WEBSITE_CHECK_VERSION = 1;
/** A check older than this is shown with an "may be out of date" note (the same 30 days the call script used). */
export const WEBSITE_CHECK_FRESH_MS = 30 * 86_400_000;
/** Pages kept per issue in the stored summary (the full list is in the deep audit). */
export const WEBSITE_CHECK_PAGES_PER_ISSUE = 3;
/** Issues kept in the stored summary (serious first). */
export const WEBSITE_CHECK_MAX_ISSUES = 20;
/** Strengths kept in the stored summary. */
export const WEBSITE_CHECK_MAX_STRENGTHS = 8;
/** Automatic deep checks allowed to wait / run at once (crawl-check). Above it a quick check queues none; the next
 *  quick check of that lead tries again. Keeps a bulk audit of hundreds of leads from flooding the crawl worker. */
export const AUTO_DEEP_MAX_RUNNING = 60;

export type WebsiteIssueSeverity = 'high' | 'medium' | 'low';

export interface WebsiteIssue {
  id: string;
  severity: WebsiteIssueSeverity;
  /** The plain title — one line a caller can read out. */
  title: string;
  /** What was seen, with its number. */
  saw: string;
  /** Why it may matter — hedged, never a claim about how an AI decides (siteAudit.ts). */
  meaning: string;
  /** Pages affected (0 = a site-wide fact). */
  count: number;
  /** The first few pages it was read on (evidence). */
  pages: string[];
  /** A "not found" issue: true only of the pages read. */
  absence?: boolean;
  /** The specific things it names (e.g. the services crammed onto one page), said with the line. */
  examples?: string[];
}

export interface WebsiteCheckSummary {
  version: number;
  /** 'deep' = the full / capped crawl's audit; 'quick' = the 12-page check; 'failed' = the site could not be read. */
  depth: 'deep' | 'quick' | 'failed';
  checkedAt: string | null;
  /** Pages read (fetched). */
  pagesRead: number | null;
  /** Same-site pages found (deep only). */
  pagesFound: number | null;
  /** The deep crawl stopped at its page limit. */
  capped: boolean;
  issues: WebsiteIssue[];
  strengths: Array<{ id: string; title: string }>;
  notChecked: string[];
  /** Why the site could not be read (depth 'failed'). */
  failure: string | null;
}

export type WebsiteCheckState = 'no_website' | 'profile' | 'not_checked' | 'unreadable' | 'issues' | 'clean';

export interface WebsiteCheckView {
  state: WebsiteCheckState;
  summary: WebsiteCheckSummary | null;
  /** High + medium, worst first. */
  serious: WebsiteIssue[];
  /** Low. */
  minor: WebsiteIssue[];
  /** THE one sentence every screen says about this lead's website. */
  headline: string;
  /** "Checked 15 Oct · 42 pages read (deep check)" — when, and how much. Null when nothing was checked. */
  coverageLine: string | null;
  /** Older than WEBSITE_CHECK_FRESH_MS. */
  stale: boolean;
}

const SEV_RANK: Record<WebsiteIssueSeverity, number> = { high: 0, medium: 1, low: 2 };

/* THE DEEP-EVIDENCE FINDINGS (siteEvidence.ts) — a wrong-domain sitemap / canonical / business markup, a noindex on an
   important page — read by BOTH crawls into result.evidence, each with its verbatim proof. Tier A and B only (a Tier C
   noindex on a privacy page is not a problem). Said once: the audit's own finding of the same thing wins. */
const EVIDENCE_ISSUE: Record<EvidenceKind, { title: string; sameAs: string[] }> = {
  sitemap_wrong_domain: { title: 'The sitemap points at a different website', sameAs: ['sitemap_off_site'] },
  canonical_off_domain: { title: 'A page names a different website as its main version', sameAs: ['canonical_off_site'] },
  schema_wrong_domain: { title: 'The business details in the page markup point at a different website', sameAs: [] },
  noindex_important_page: { title: 'An important page asks search engines not to list it', sameAs: ['noindex_home', 'noindex_pages'] },
};

/* THE SALES INSIGHTS (salesInsights.ts) — read off the site's own pages by BOTH crawls (result.insights): the most specific
   evidence there is ("Boiler Repair, Leak Repair and Bathroom Fitting share one page"). Worth saying ones only
   (SPEAK_MIN_PRIORITY, high / medium confidence). An insight REPLACES the audit's vaguer finding of the same thing, unless
   that one is HIGH. */
const INSIGHT_SUPERSEDES: Record<InsightKind, string[]> = {
  services_on_one_page: ['no_service_pages', 'one_page_site'],
  no_service_pages: ['no_service_pages'],
  service_page_gaps: ['no_service_pages'],
  no_contact_details: ['no_phone', 'no_contact_route'],
  name_unclear: ['name_unclear'],
  location_unclear: ['town_missing'],
  internal_linking: ['deep_pages', 'sitemap_only_pages'],
  no_proof: ['no_reviews'],
} as Record<InsightKind, string[]>;

function insightIssues(raw: unknown): Array<WebsiteIssue & { supersedes: string[] }> {
  const ins = usableInsights(raw);
  if (!ins || ins.state === 'unreadable') return [];
  return ins.findings
    .filter((f) => (f.confidence === 'high' || f.confidence === 'medium') && f.priority >= SPEAK_MIN_PRIORITY)
    .map((f) => {
      const examples = f.evidence.quotes.map((q) => /“([^”]+)”/.exec(q)?.[1]).filter((x): x is string => !!x).slice(0, 4);
      return {
        id: f.kind, severity: 'medium' as const, title: f.title, saw: f.observed, meaning: f.why,
        count: 0, pages: f.evidence.urls.slice(0, WEBSITE_CHECK_PAGES_PER_ISSUE), ...(examples.length ? { examples } : {}),
        supersedes: INSIGHT_SUPERSEDES[f.kind] ?? [f.kind],
      };
    });
}

function evidenceIssues(result: { evidence?: SiteEvidence | null; evidenceVersion?: number } | null | undefined): WebsiteIssue[] {
  return usableSiteEvidence(result, 0, Number.POSITIVE_INFINITY)
    .filter((f) => (f.tier === 'A' || f.tier === 'B') && !!EVIDENCE_ISSUE[f.kind])
    .map((f) => {
      const c = f.evidence.counted && f.evidence.counted.of > 0 ? ` (${f.evidence.counted.matched} of ${f.evidence.counted.of} checked)` : '';
      const seen = f.evidence.observed[0] ? `: ${f.evidence.observed[0]}` : '';
      return {
        id: f.kind, severity: f.tier === 'A' ? 'high' as const : 'medium' as const, title: EVIDENCE_ISSUE[f.kind].title,
        saw: `Read in ${f.evidence.source}${seen}${c}.`,
        meaning: 'Conflicting addresses can make it harder for search engines and AI tools to be sure which website is the business’s own.',
        /* 0: the counted number is sitemap entries / checked pages, said in `saw` — never "(34 pages)". */
        count: 0, pages: [f.pageUrl ?? f.evidence.source].filter(Boolean) as string[],
      };
    });
}

/* The no-website words, said the same on every internal screen (the client report keeps its own build-one panel). */
export const NO_WEBSITE_LINE = 'No website on file, so there is nothing to crawl.';
export const NOT_CHECKED_LINE = 'Website not checked yet.';

function asSeverity(s: AuditFinding['severity']): WebsiteIssueSeverity | null {
  return s === 'high' || s === 'medium' || s === 'low' ? s : null;
}

/* A content & trust check (ct_<kind>) and the audit finding it repeats. */
const SAME_ISSUE: Record<string, string | RegExp> = {
  ct_no_https: 'no_https',
  ct_broken_links: 'broken_pages',
  ct_no_viewport: 'no_viewport',
  ct_no_sitemap: 'no_sitemap',
  ct_orphan_pages: 'sitemap_only_pages',
  ct_robots_blocks_ai: /^robots_blocks_/,
};

/** ⛔ A broken page is a 404 / 410 / 5xx (contentTrust.isBrokenPageStatus). An audit stored before 2026-10-15 counted
 *  401 / 403 / 429 (the site refusing or rate-limiting our crawler) as broken: those addresses are dropped here, and the
 *  finding goes when none is left. Reads the "(status)" each address was stored with. */
function trueBrokenOnly(f: AuditFinding): AuditFinding | null {
  const statusOf = (s: string) => Number(/\((\d{3})\)\s*$/.exec(s)?.[1] ?? NaN);
  if (f.id === 'broken_pages') {
    const urls = (f.urls ?? []).filter((u) => isBrokenPageStatus(statusOf(u)));
    if (!urls.length) return null;
    if (urls.length === (f.urls ?? []).length) return f;
    return { ...f, urls, count: urls.length, saw: `${plural(urls.length, 'address', 'addresses')} linked from the site or listed in its sitemap answered “not found” or a server error (${[...new Set(urls.map(statusOf))].join(', ')}).` };
  }
  if (f.id === 'ct_broken_links') {
    const ev = (f.evidence ?? []).filter((e) => isBrokenPageStatus(statusOf(e)));
    if (!ev.length) return null;
    if (ev.length === (f.evidence ?? []).length) return f;
    const bad = new Set(ev.map((e) => e.replace(/\s*\(\d{3}\)\s*$/, '')));
    const urls = (f.urls ?? []).filter((u) => bad.has(u));
    return { ...f, evidence: ev, urls, count: urls.length || ev.length };
  }
  return f;
}

/** The stored summary for a crawl row, built from the ONE audit (siteAudit.auditFromStoredCrawl). Written by the
 *  crawls at store time; computed the same way for a row from before. Pure. */
export function summariseWebsiteCheck(row: StoredCrawlForAudit | null | undefined): WebsiteCheckSummary | null {
  if (!row || (!row.result && !row.full_evidence)) return null;
  const checkedAt = row.result?.checked_at ?? row.created_at ?? null;
  const failed = row.result?.signals?.fetchFailed === true || (row.full_evidence as { completeness?: string } | null | undefined)?.completeness === 'failed';
  if (failed) {
    const kind = row.result?.homeFetch?.kind;
    return {
      version: WEBSITE_CHECK_VERSION, depth: 'failed', checkedAt, pagesRead: 0, pagesFound: null, capped: false,
      issues: [], strengths: [], notChecked: [], failure: kind ? HOME_FETCH_LABELS[kind] : 'The website could not be read.',
    };
  }
  const audit: SiteAudit | null = auditFromStoredCrawl(row);
  if (!audit) return null;
  const deep = audit.basis === 'full' || audit.basis === 'capped' || audit.basis === 'full_legacy';
  const issues: WebsiteIssue[] = [];
  const strengths: Array<{ id: string; title: string }> = [];
  const seen = new Set<string>();
  for (const raw of audit.findings) {
    if (raw.severity === 'good') { if (strengths.length < WEBSITE_CHECK_MAX_STRENGTHS) strengths.push({ id: raw.id, title: raw.title }); continue; }
    const f = trueBrokenOnly(raw);
    if (!f) continue;
    const sev = asSeverity(f.severity);
    if (!sev || seen.has(f.id)) continue;
    seen.add(f.id);
    issues.push({
      id: f.id, severity: sev, title: f.title, saw: f.saw, meaning: f.meaning ?? "", count: f.count,
      pages: (f.urls ?? []).slice(0, WEBSITE_CHECK_PAGES_PER_ISSUE),
      ...(f.absence ? { absence: true } : {}),
    });
  }
  /* SAID ONCE: a content & trust check that repeats an audit finding (no HTTPS, broken pages, phones, sitemap, robots)
     keeps only the stronger of the two — the audit's on a tie (it carries the full page list). */
  for (const [ct, twin] of Object.entries(SAME_ISSUE)) {
    const a = issues.find((x) => x.id === ct);
    const b = issues.find((x) => (typeof twin === 'string' ? x.id === twin : twin.test(x.id)));
    if (!a || !b) continue;
    const drop = SEV_RANK[a.severity] < SEV_RANK[b.severity] ? b : a;
    issues.splice(issues.indexOf(drop), 1);
  }
  for (const ins of insightIssues((row.result as { insights?: unknown } | null | undefined)?.insights ?? audit.insights)) {
    const clash = issues.filter((x) => ins.supersedes.includes(x.id) || x.id === ins.id);
    if (clash.some((x) => x.severity === 'high')) continue;
    for (const x of clash) { issues.splice(issues.indexOf(x), 1); seen.delete(x.id); }
    const { supersedes: _s, ...issue } = ins;
    void _s;
    seen.add(issue.id);
    issues.push(issue);
  }
  for (const e of evidenceIssues(row.result as never)) {
    if (seen.has(e.id) || EVIDENCE_ISSUE[e.id as EvidenceKind].sameAs.some((id) => seen.has(id))) continue;
    seen.add(e.id);
    issues.push(e);
  }
  issues.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.count - a.count);
  const signals = row.result?.signals;
  const pagesRead = audit.coverage?.pagesCrawled ?? (typeof signals?.pagesChecked === 'number' ? signals.pagesChecked : null);
  return {
    version: WEBSITE_CHECK_VERSION, depth: deep ? 'deep' : 'quick', checkedAt,
    pagesRead, pagesFound: audit.coverage?.urlsDiscovered ?? null, capped: audit.coverage?.capped === true,
    issues: issues.slice(0, WEBSITE_CHECK_MAX_ISSUES), strengths, notChecked: audit.notChecked.slice(0, 8), failure: null,
  };
}

/** A stored summary, when it is one this code reads. */
export function usableWebsiteCheck(v: unknown): WebsiteCheckSummary | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as WebsiteCheckSummary;
  return s.version === WEBSITE_CHECK_VERSION && Array.isArray(s.issues) ? s : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

function dayLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

/** "Checked 15 Oct · 42 pages read (deep check)". */
export function coverageLineFor(s: WebsiteCheckSummary, stale = false): string {
  const day = dayLabel(s.checkedAt);
  const parts = [day ? `Checked ${day}` : 'Checked'];
  if (s.depth === 'failed') parts.push('could not read the site');
  else if (s.depth === 'deep') {
    const read = s.pagesRead != null ? plural(s.pagesRead, 'page') + ' read' : 'pages read';
    parts.push(s.capped && s.pagesFound != null ? `${read} of ${s.pagesFound.toLocaleString('en-GB')} found (deep check, page limit reached)` : `${read} (deep check)`);
  } else parts.push(`${s.pagesRead != null ? plural(s.pagesRead, 'page') : 'a few pages'} (quick check — the deep check follows automatically)`);
  if (stale) parts.push('over 30 days ago, the site may have changed');
  return parts.join(' · ');
}

/** THE reader. `row` is the lead's ONE lead_crawl_checks row (result + created_at, and full_evidence when the caller
 *  has it); `website` is the lead's website (none → the no-website words; a directory / social profile → said as one). */
export function websiteCheckFor(
  row: (StoredCrawlForAudit & { result?: (StoredCrawlForAudit['result'] & { websiteCheck?: unknown }) | null }) | null | undefined,
  opts: { website: string | null | undefined; nowMs?: number },
): WebsiteCheckView {
  const empty = (state: WebsiteCheckState, headline: string): WebsiteCheckView =>
    ({ state, summary: null, serious: [], minor: [], headline, coverageLine: null, stale: false });
  const kind = classifyLeadWebsite(opts.website);
  if (kind.source === 'none') return empty('no_website', NO_WEBSITE_LINE);
  if (kind.source === 'directory_profile' || kind.source === 'social_profile') {
    return empty('profile', `No standalone business website found, only a ${kind.label} profile — nothing of their own to check.`);
  }
  const summary = usableWebsiteCheck(row?.result?.websiteCheck) ?? summariseWebsiteCheck(row);
  if (!summary) return empty('not_checked', NOT_CHECKED_LINE);
  const now = opts.nowMs ?? Date.now();
  const at = summary.checkedAt ? Date.parse(summary.checkedAt) : NaN;
  const stale = Number.isFinite(at) && !(now - at < WEBSITE_CHECK_FRESH_MS);
  const coverageLine = coverageLineFor(summary, stale);
  if (summary.depth === 'failed') {
    return { state: 'unreadable', summary, serious: [], minor: [], stale, coverageLine,
      headline: `We could not read the website: ${summary.failure ?? 'it did not answer.'}` };
  }
  const serious = summary.issues.filter((i) => i.severity !== 'low');
  const minor = summary.issues.filter((i) => i.severity === 'low');
  const pages = summary.pagesRead != null ? ` on the ${plural(summary.pagesRead, 'page')} checked` : '';
  const headline = serious.length
    ? `${plural(serious.length, 'website issue')} found${pages}.`
    : `No serious website issues found${pages}.${minor.length ? ` ${plural(minor.length, 'minor point')}.` : ''}`;
  return { state: serious.length ? 'issues' : 'clean', summary, serious, minor, headline, coverageLine, stale };
}

/* ONE ISSUE, ONE PLAIN LINE (Paul, 2026-10-15: "each line is one issue in plain English"). The technical title stays on the
   operator's screens; what a caller reads out — and what the client report says — has no robots.txt / noindex / H1 /
   canonical / schema words. An id without a line here keeps its title (those are plain already). */
const PLAIN_LINE: Record<string, string> = {
  robots_blocks_all: 'Your site tells every search and AI tool to stay away',
  search_crawler_refused: 'Your site turned away the AI search tools we tried',
  client_rendered: 'Your homepage text only appears after the page code runs, so some tools may see an almost empty page',
  no_https: 'Your site is not secure (no padlock)',
  no_sitemap: 'There is no page list for Google to follow',
  sitemap_off_site: 'The list of your pages that Google reads points at a different website',
  sitemap_wrong_domain: 'The list of your pages that Google reads points at a different website',
  noindex_home: 'Your homepage asks Google not to show it',
  noindex_pages: 'Some of your pages ask Google not to show them',
  noindex_important_page: 'An important page asks Google not to show it',
  canonical_off_site: 'Some pages tell Google a different website is the real one',
  canonical_off_domain: 'A page tells Google a different website is the real one',
  canonical_mismatch: 'Some pages point Google at a different page as the main one',
  broken_pages: 'Some links on your site lead to error pages',
  missing_h1: 'Some pages have no main heading',
  missing_title: 'Some pages have no page title',
  no_viewport: 'Some pages are not set up for phones',
  schema_malformed: 'The hidden business details on some pages are broken',
  schema_phone_mismatch: 'The hidden business details give a different phone number',
  schema_wrong_domain: 'The hidden business details point at a different website',
  near_duplicate_pages: 'Lots of your pages are near enough the same',
  duplicate_titles: 'Several pages have the same title',
  no_contact_route: 'There is no clear way to contact you on the site',
  no_phone: 'There is no phone number on the site',
  slow_pages: 'Your pages are slow to load',
  robots_disallowed_pages: 'Some pages are closed off to search tools',
};

/** The plain words for an issue (no technical terms). */
export function plainIssueTitle(i: WebsiteIssue): string {
  if (i.id === 'missing_h1' && /homepage/i.test(i.title)) return 'Your homepage has no main heading';
  if (i.id.startsWith('robots_blocks_pages_')) return 'Parts of your site are closed off to an AI or search tool';
  if (i.id.startsWith('robots_blocks_')) return 'Your site tells an AI or search tool not to read it';
  return PLAIN_LINE[i.id] ?? i.title;
}

/** One issue as one short plain line for a caller to read out: the plain words, what it names, and how many pages. */
export function issueLine(i: WebsiteIssue): string {
  const named = i.examples?.length ? `: ${i.examples.join(', ')}` : '';
  return plainIssueTitle(i) + named + (i.count > 1 ? ` (${plural(i.count, 'page')})` : '');
}

/** Where an issue was read, for a tooltip / proof line. */
export function issueWhere(i: WebsiteIssue): string | null {
  if (!i.pages.length) return i.absence ? 'Not found on any page read.' : null;
  return `Seen on ${i.pages.join(', ')}${i.count > i.pages.length ? ` and ${plural(i.count - i.pages.length, 'more page')}` : ''}.`;
}
