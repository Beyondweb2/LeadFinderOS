/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ROOM TO IMPROVE THE WEBSITE — the site score (v1 2026-10-23 feat/site-score; v2 2026-10-30 feat/site-score-v2;
   docs/site-score.md). A number out of 100 on each lead's Outreach and Inbox row, so the team can see how much a website
   has to gain without opening it. It is NOT a prediction of AI visibility and is never worded as one.

   ⛔ FOR THE TEAM ONLY. Never shown to a prospect or a client, never in a message, template, report or
      pitch. scripts/site-score.test.ts walks every sender / report / client-facing renderer and fails
      if one reaches this file.
   ⛔ ONE JUDGE OF THE SITE. The score is read off THE ONE WEBSITE CHECK (websiteCheck.ts) — the same
      issues the call script, the Inbox popup and the report say. It does not look at the site again
      and adds no rule of its own about what is wrong; it only weighs what the check already found.
   ⛔ ONLY WHAT THE CRAWL VERIFIED LOSES POINTS, AND EVERY POINT LOST CARRIES ITS EVIDENCE (the page URL and the quote the
      crawl read). A "not found" on a crawl that stopped at its page cap is not verified (the page may not have been read):
      it takes nothing and is listed under "not judged".
   ⛔ SAME SITE, SAME NUMBER. Pure arithmetic on the stored check: no clock, no randomness, no model,
      fixed weights. The same stored check always gives the same score and the same evidence.
   ⛔ A SITE WE COULD NOT JUDGE GETS A STATE, NEVER A NUMBER OR A ZERO: social / directory only, JavaScript-only,
      blocked by robots.txt, couldn't reach, quick check only. (No website and "not checked" have no crawl row; the
      screens say them from the lead — siteScoreViewFor.)
   ⛔ VERSIONED. SITE_SCORE_VERSION is stored with every score. v1 numbers are kept in site_score_v1 (migration
      20261130150000); changing a weight, a check or a mapping is a new version.

   v2 (Paul, 2026-10-30, the approved Phase 1 method): 100 points in seven categories — Reachable 20, Identity 15,
   Services 20, Content 15, Structured data 10, Consistency 10, Basics 10 — each split into checks. A check loses a share
   of its points for each verified issue the check found in it (by severity); it never goes below zero. A one-page site, or
   one with no real service pages, is capped in the "big gains" band. Bands: under 60 big gains, 60–79 some gains,
   80+ little to gain.

   Pure; no I/O. IMPORTED BY EDGE FUNCTIONS (crawl-check, crawl-job): relative imports with .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { placeholderPagesOnce, summariseWebsiteCheck, usableWebsiteCheck, type WebsiteCheckSummary, type WebsiteIssue, type WebsiteIssueSeverity } from './websiteCheck.ts';
import { storedCrawlUnread, type StoredCrawlForAudit } from './siteAudit.ts';
import { classifyLeadWebsite } from './leadWebsiteKind.ts';

export const SITE_SCORE_VERSION = 2;
/** Reasons kept on the list row: the biggest losses first. The full evidence is in site_score_evidence. */
export const SITE_SCORE_MAX_DOWN_REASONS = 3;

export type SiteScoreCategory = 'reachable' | 'identity' | 'services' | 'content' | 'structured' | 'consistency' | 'basics';

/** Points per category. Sums to 100 (tested). */
export const SITE_SCORE_CATEGORY_POINTS: Record<SiteScoreCategory, number> = {
  reachable: 20, identity: 15, services: 20, content: 15, structured: 10, consistency: 10, basics: 10,
};

export const SITE_SCORE_CATEGORY_LABELS: Record<SiteScoreCategory, string> = {
  reachable: 'Reachable', identity: 'Identity', services: 'Services', content: 'Content', structured: 'Structured data',
  consistency: 'Consistency', basics: 'Basics',
};

export interface SiteScoreCheck {
  id: string;
  category: SiteScoreCategory;
  label: string;
  points: number;
  /** The website check's issue ids that count against this check. */
  issues: readonly string[];
}

/** The checks. Each category's checks sum to its points (tested); every issue id belongs to ONE check (tested). */
export const SITE_SCORE_CHECKS: readonly SiteScoreCheck[] = [
  // Reachable 20
  { id: 'https', category: 'reachable', label: 'Served over HTTPS', points: 4, issues: ['no_https', 'ct_no_https'] },
  { id: 'html', category: 'reachable', label: 'Key information readable in the page HTML', points: 3, issues: ['thin_key_pages', 'vs_raw_link_markup'] },
  { id: 'robots', category: 'reachable', label: 'robots.txt lets search and AI crawlers in', points: 4,
    issues: ['ct_robots_blocks_ai', 'robots_blocks_ai_search', 'robots_disallowed_pages', 'no_robots'] },
  { id: 'sitemap', category: 'reachable', label: 'A sitemap that lists the site\'s own pages', points: 3,
    issues: ['no_sitemap', 'ct_no_sitemap', 'sitemap_off_site', 'sitemap_wrong_domain', 'sitemap_only_pages'] },
  { id: 'canonical', category: 'reachable', label: 'Pages name themselves as the main version', points: 3,
    issues: ['canonical_mismatch', 'canonical_off_site', 'canonical_off_domain', 'vs_duplicate_homepage', 'redirects_to_other_domain'] },
  { id: 'noindex', category: 'reachable', label: 'No page accidentally asks not to be listed', points: 3, issues: ['noindex_home', 'noindex_pages', 'noindex_important_page'] },
  // Identity 15
  { id: 'name', category: 'identity', label: 'Business name stated clearly', points: 4, issues: ['name_unclear'] },
  { id: 'contact', category: 'identity', label: 'Phone and a way to get in touch', points: 5, issues: ['no_contact_route', 'no_phone', 'no_contact_details', 'no_contact_page'] },
  { id: 'place', category: 'identity', label: 'Town and address stated', points: 4, issues: ['town_missing', 'location_unclear', 'no_address', 'vs_address_not_on_key_pages'] },
  { id: 'who', category: 'identity', label: 'Who runs it and company facts', points: 2, issues: ['no_about_page', 'ct_no_people', 'ct_missing_entity_facts'] },
  // Services 20
  { id: 'service_pages', category: 'services', label: 'A page for each main service', points: 10, issues: ['no_service_pages', 'one_page_site', 'services_on_one_page'] },
  { id: 'service_gaps', category: 'services', label: 'Every service named has its page', points: 5, issues: ['service_page_gaps'] },
  { id: 'service_substance', category: 'services', label: 'Service and area pages have real, distinct text', points: 5,
    issues: ['thin_pages', 'near_duplicate_pages', 'vs_town_swapped_pages'] },
  // Content 15
  { id: 'answers', category: 'content', label: 'Answers customer questions', points: 4, issues: ['no_questions_answered', 'vs_duplicate_faq_pages'] },
  { id: 'areas', category: 'content', label: 'Says which areas it covers', points: 4, issues: ['ct_areas_not_stated', 'ct_area_coverage'] },
  { id: 'specifics', category: 'content', label: 'Specific copy and clear headings', points: 4, issues: ['ct_generic_copy', 'ct_vague_headings', 'ct_mixed_audience'] },
  { id: 'proof', category: 'content', label: 'Proof: reviews, work, accreditations', points: 3, issues: ['ct_no_proof', 'no_reviews', 'ct_no_accreditations', 'ct_accreditations_unnamed'] },
  // Structured data 10
  { id: 'business_markup', category: 'structured', label: 'Business details in the page code', points: 5, issues: ['no_business_schema', 'vs_business_schema', 'schema_malformed'] },
  { id: 'markup_right', category: 'structured', label: 'Page code matches the site', points: 3,
    issues: ['schema_wrong_domain', 'ct_schema_mismatch', 'ct_schema_unverified', 'ct_schema_incomplete'] },
  { id: 'markup_extras', category: 'structured', label: 'Breadcrumb and FAQ markup', points: 2, issues: ['no_breadcrumbs', 'vs_faq_no_schema'] },
  // Consistency 10
  { id: 'facts_agree', category: 'consistency', label: 'Name, phone and facts agree everywhere', points: 4, issues: ['ct_conflicting_facts', 'vs_name_inconsistent', 'schema_phone_mismatch'] },
  { id: 'links_right', category: 'consistency', label: 'Links go where they say', points: 3, issues: ['ct_link_mismatch'] },
  { id: 'real_content', category: 'consistency', label: 'No placeholder or made-up content', points: 3,
    issues: ['ct_placeholder_content', 'ct_identical_dates', 'ct_ai_images', 'ct_logo_alt_mismatch', 'ct_unsourced_claims'] },
  // Basics 10
  { id: 'titles', category: 'basics', label: 'Titles, headings and descriptions', points: 3,
    issues: ['missing_title', 'missing_h1', 'multiple_h1', 'long_titles', 'duplicate_titles', 'missing_description', 'vs_key_page_basics', 'ct_image_alt'] },
  { id: 'phones', category: 'basics', label: 'Set up for phones', points: 2, issues: ['no_viewport', 'ct_no_viewport'] },
  { id: 'speed', category: 'basics', label: 'Pages load quickly', points: 2, issues: ['slow_pages', 'some_slow_pages'] },
  { id: 'links_work', category: 'basics', label: 'Links and pages work', points: 3,
    issues: ['broken_pages', 'ct_broken_links', 'ct_dead_links', 'unreachable_pages', 'internal_redirects', 'deep_pages', 'ct_orphan_pages', 'internal_linking'] },
];

/** Share of a check's points each issue in it takes, by the severity the website check gave it (a check stops at zero). */
export const SITE_SCORE_SEVERITY_SHARE: Record<WebsiteIssueSeverity, number> = { high: 1, medium: 1, low: 0.4 };

/** The checks a one-page site or a site with no real service pages fails: its score is capped below the "some gains" band. */
export const SITE_SCORE_CAP_ISSUES: ReadonlySet<string> = new Set(['one_page_site', 'no_service_pages', 'services_on_one_page']);
/** Issues that, on their own, mean the site has no Services at all: the whole category is lost (said as such by the check). */
const WHOLE_CATEGORY_ISSUES: ReadonlySet<string> = new Set(['one_page_site', 'no_service_pages']);
/** The cap: the top of the "big gains" band. */
export const SITE_SCORE_CAP = 59;

/** Issue ids that are a STATE, never points: the site could not be judged. */
const STATE_ISSUES: ReadonlySet<string> = new Set(['client_rendered', 'robots_blocks_all']);

const CHECK_BY_ISSUE: ReadonlyMap<string, SiteScoreCheck> = new Map(SITE_SCORE_CHECKS.flatMap((c) => c.issues.map((id) => [id, c] as const)));

/** The check an issue id counts against. robots_blocks_<crawler> and robots_blocks_pages_<crawler> name a real crawler's
 *  robots.txt rule (OAI-SearchBot, Googlebot, PerplexityBot …), so they count against robots. Null = takes nothing. */
export function siteScoreCheckOf(id: string): SiteScoreCheck | null {
  const c = CHECK_BY_ISSUE.get(id);
  if (c) return c;
  if (id.startsWith('robots_blocks_') && !STATE_ISSUES.has(id)) return CHECK_BY_ISSUE.get('robots_blocks_ai_search') ?? null;
  return null;
}

/** scored = a number. Every other state is a site we could not judge — never a number, never a zero. */
export type SiteScoreState = 'scored' | 'partial' | 'js_only' | 'robots_blocked' | 'unreachable' | 'profile_only';
export const SITE_SCORE_STATES: readonly SiteScoreState[] = ['scored', 'partial', 'js_only', 'robots_blocked', 'unreachable', 'profile_only'];

export interface SiteScoreReason {
  /** 'down' = took points off; 'up' = something the site does well. */
  kind: 'down' | 'up';
  text: string;
  /** Points out of 100 this took off (down only). */
  points?: number;
}

/** One point lost, with what the crawl read. */
export interface SiteScoreLoss {
  check: string;
  category: SiteScoreCategory;
  label: string;
  /** Points out of 100 this check lost. */
  points: number;
  issueId: string;
  severity: WebsiteIssueSeverity;
  title: string;
  /** The page it was read on (null = a site-wide fact, e.g. robots.txt said nothing). */
  url: string | null;
  /** What the crawl read, as close to the page's own words as the check kept. */
  quote: string;
}

export interface SiteScoreEvidence {
  version: number;
  losses: SiteScoreLoss[];
  /** Why the score was capped, with its evidence (null = not capped). */
  cap: { reason: string; url: string | null; quote: string; uncapped: number } | null;
  /** What was not judged and why (absences on a capped crawl, things the crawl does not record). */
  notJudged: string[];
}

export interface SiteScore {
  version: number;
  state: SiteScoreState;
  /** 0–100; null unless scored. */
  score: number | null;
  reasons: SiteScoreReason[];
  detail: {
    /** 'deep' = the full / capped crawl; 'quick' = the 12-page check; 'failed' = the site could not be read. */
    basis: 'deep' | 'quick' | 'failed';
    pagesRead: number | null;
    checkedAt: string | null;
    /** Points kept per category (scored only). */
    categories?: Record<SiteScoreCategory, number>;
    /** Capped into the big gains band (scored only). */
    capped?: boolean;
  };
  /** Every point lost with its evidence (scored), or the reason for the state. Not read by the lists. */
  evidence: SiteScoreEvidence | null;
}

export const PARTIAL_LINE = 'Only a quick check so far. The score comes with the deep check (Crawl site runs it).';
const JS_LINE = 'The homepage builds its text in the browser, so our check read almost nothing.';
const NONE_READ_LINE = 'No page of the site could be read.';
const ROBOTS_LINE = 'The site\'s robots.txt blocks every crawler, so search and AI crawlers are told to stay out.';
const ACCESS_NOT_RECORDED = 'Real visits by OAI-SearchBot, Googlebot and PerplexityBot are not recorded by the crawl (it reads as one honest crawler), so only their robots.txt rules are judged.';

/** Stored result fields the quotes are read from (all optional — older rows lack them). */
interface QuoteSources {
  url?: string;
  contentTrust?: { issues?: Array<{ kind?: string; evidence?: unknown; urls?: string[] }> } | null;
  evidence?: { findings?: Array<{ kind?: string; pageUrl?: string; evidence?: { observed?: unknown; source?: string } }> } | null;
  visibility?: { findings?: Array<{ id?: string; saw?: string; urls?: string[] }> } | null;
}

function firstString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v)) for (const x of v) { const s = firstString(x); if (s) return s; }
  return null;
}
const clip = (s: string, n = 240) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The page and the words for one issue: the crawl's verbatim evidence where it kept one, else what the check saw. */
function evidenceFor(issue: WebsiteIssue, src: QuoteSources | null): { url: string | null; quote: string } {
  const ct = issue.id.startsWith('ct_') ? src?.contentTrust?.issues?.find((i) => `ct_${i.kind}` === issue.id) : undefined;
  const ev = src?.evidence?.findings?.find((f) => f.kind === issue.id);
  const vs = issue.id.startsWith('vs_') ? src?.visibility?.findings?.find((f) => f.id === issue.id) : undefined;
  const quote = firstString(ct?.evidence) ?? firstString(ev?.evidence?.observed) ?? firstString(issue.examples) ?? (issue.saw || vs?.saw || issue.title);
  const url = issue.pages[0] ?? ev?.pageUrl ?? ct?.urls?.[0] ?? vs?.urls?.[0] ?? null;
  return { url, quote: clip(quote) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Site files the crawl fetches directly: their absence is verified whatever the page cap. */
const SITE_FILE_ISSUES: ReadonlySet<string> = new Set(['no_sitemap', 'ct_no_sitemap', 'no_robots']);
/** A "not found" counts only when the crawl verified it: on the pages it names, on a file it fetched, or across a crawl
 *  that read every page it found. A site-wide absence on a crawl that stopped at its page cap is not verified. */
function verifiedOn(issue: WebsiteIssue, s: WebsiteCheckSummary): boolean {
  if (!issue.absence || !s.capped) return true;
  return issue.pages.length > 0 || SITE_FILE_ISSUES.has(issue.id);
}
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The score for ONE website-check summary (+ the stored result it came from, for the quotes). Pure. */
export function siteScoreFromSummary(s: WebsiteCheckSummary, src: QuoteSources | null = null): SiteScore {
  const base = { basis: s.depth, pagesRead: s.pagesRead ?? null, checkedAt: s.checkedAt ?? null };
  const state = (st: SiteScoreState, text: string): SiteScore => ({
    version: SITE_SCORE_VERSION, state: st, score: null, reasons: [{ kind: 'down', text }], detail: base,
    evidence: { version: SITE_SCORE_VERSION, losses: [], cap: null, notJudged: [text] },
  });
  const site = classifyLeadWebsite(src?.url ?? null);
  if (site.source === 'social_profile' || site.source === 'directory_profile') {
    return state('profile_only', `The website on file is a ${site.label ?? site.host} page, not the business's own site.`);
  }
  if (s.depth === 'failed') return state('unreachable', s.failure ?? 'The website could not be read.');
  if (s.issues.some((i) => i.id === 'client_rendered')) return state('js_only', JS_LINE);
  if (s.issues.some((i) => i.id === 'robots_blocks_all')) return state('robots_blocked', ROBOTS_LINE);
  if (s.pagesRead === 0) return state('unreachable', NONE_READ_LINE);
  if (s.depth !== 'deep') return state('partial', PARTIAL_LINE);

  /* Each verified issue takes its share of its check; a check never loses more than its points. Issues are taken in id
     order (worst first within a check), so the result never depends on the order the check stored them in. */
  const notJudged = new Set<string>([ACCESS_NOT_RECORDED]);
  const byCheck = new Map<string, WebsiteIssue[]>();
  for (const issue of [...s.issues].sort(byId)) {
    const check = siteScoreCheckOf(issue.id);
    if (!check) continue;
    if (!verifiedOn(issue, s)) { notJudged.add(`${issue.title}: not judged, the crawl stopped at its page limit so the page may exist unread.`); continue; }
    byCheck.set(check.id, [...(byCheck.get(check.id) ?? []), issue]);
  }
  const losses: SiteScoreLoss[] = [];
  /* A one-page site, or one with no service pages at all, has no Services to speak of: the whole category goes, said once. */
  const whole = [...(byCheck.get('service_pages') ?? [])].find((i) => WHOLE_CATEGORY_ISSUES.has(i.id));
  if (whole) {
    const { url, quote } = evidenceFor(whole, src);
    losses.push({ check: 'service_pages', category: 'services', label: 'No real service pages', points: SITE_SCORE_CATEGORY_POINTS.services,
      issueId: whole.id, severity: whole.severity, title: whole.title, url, quote });
  }
  for (const check of SITE_SCORE_CHECKS) {
    if (whole && check.category === 'services') continue;
    let left = check.points;
    const found = [...(byCheck.get(check.id) ?? [])].sort((x, y) => SITE_SCORE_SEVERITY_SHARE[y.severity] - SITE_SCORE_SEVERITY_SHARE[x.severity] || byId(x, y));
    for (const issue of found) {
      const pts = round1(Math.min(left, check.points * (SITE_SCORE_SEVERITY_SHARE[issue.severity] ?? 0)));
      if (pts <= 0) continue;
      left = round1(left - pts);
      const { url, quote } = evidenceFor(issue, src);
      losses.push({ check: check.id, category: check.category, label: check.label, points: pts, issueId: issue.id, severity: issue.severity, title: issue.title, url, quote });
    }
  }
  const categories = Object.fromEntries((Object.keys(SITE_SCORE_CATEGORY_POINTS) as SiteScoreCategory[]).map((c) => [c,
    round1(SITE_SCORE_CATEGORY_POINTS[c] - losses.filter((l) => l.category === c).reduce((t, l) => t + l.points, 0))])) as Record<SiteScoreCategory, number>;
  const uncapped = Math.max(0, Math.min(100, Math.round(100 - losses.reduce((t, l) => t + l.points, 0))));

  /* ⛔ THE CALIBRATION CAP: a one-page site, or one with no real service pages, has big gains to make whatever else it does well. */
  const capIssue = [...s.issues].sort(byId).find((i) => SITE_SCORE_CAP_ISSUES.has(i.id));
  const capEv = capIssue ? evidenceFor(capIssue, src) : null;
  const cap = capIssue && capEv && uncapped > SITE_SCORE_CAP
    ? { reason: `${capIssue.title} — capped at ${SITE_SCORE_CAP} (a one-page site, or one without real service pages, has big gains to make).`, url: capEv.url, quote: capEv.quote, uncapped }
    : null;
  const score = cap ? SITE_SCORE_CAP : uncapped;

  const downs = [...losses].sort((a, b) => b.points - a.points || (a.check < b.check ? -1 : 1)).slice(0, SITE_SCORE_MAX_DOWN_REASONS)
    .map((l) => ({ kind: 'down' as const, text: l.title, points: Math.round(l.points) }));
  const reasons: SiteScoreReason[] = cap ? [{ kind: 'down', text: capIssue!.title }, ...downs.filter((d) => d.text !== capIssue!.title).slice(0, SITE_SCORE_MAX_DOWN_REASONS - 1)] : downs;
  if (s.notChecked?.length) for (const n of s.notChecked) notJudged.add(n);
  return {
    version: SITE_SCORE_VERSION, state: 'scored', score, reasons,
    detail: { ...base, categories, capped: !!cap },
    evidence: { version: SITE_SCORE_VERSION, losses, cap, notJudged: [...notJudged] },
  };
}

/** The score for a stored crawl row, read the way every screen reads it: an unread homepage is summarised afresh
 *  (couldn't check), otherwise the stored summary, or for a row without one the summary built the same way.
 *  Null when there is nothing to score. */
export function siteScoreForRow(row: (StoredCrawlForAudit & { result?: (StoredCrawlForAudit['result'] & { websiteCheck?: unknown }) | null }) | null | undefined): SiteScore | null {
  if (!row) return null;
  const stored = storedCrawlUnread(row) ? null : usableWebsiteCheck(row.result?.websiteCheck);
  const summary = stored ? placeholderPagesOnce(stored) : summariseWebsiteCheck(row);
  return summary ? siteScoreFromSummary(summary, (row.result ?? null) as QuoteSources | null) : null;
}

/** The lead_crawl_checks columns for a score (written beside `result` by both crawls and the backfill). Null score →
 *  every column null, so a row is never left with an old score beside a new result. site_score_v1 is never written here. */
export function siteScoreColumns(score: SiteScore | null, atIso: string): Record<string, unknown> {
  return {
    site_score: score?.score ?? null,
    site_score_state: score?.state ?? null,
    site_score_version: score ? score.version : null,
    site_score_reasons: score?.reasons ?? null,
    site_score_detail: score?.detail ?? null,
    site_score_evidence: score?.evidence ?? null,
    site_score_at: score ? atIso : null,
  };
}

/* ── the display (both rows read these; nothing here is sent anywhere) ── */

export type SiteScoreBand = 'big' | 'some' | 'little';
export const SITE_SCORE_BAND_MIN = { little: 80, some: 60 } as const;
export function siteScoreBand(score: number): SiteScoreBand {
  return score >= SITE_SCORE_BAND_MIN.little ? 'little' : score >= SITE_SCORE_BAND_MIN.some ? 'some' : 'big';
}
export const SITE_SCORE_BAND_LABELS: Record<SiteScoreBand, string> = { big: 'Big gains', some: 'Some gains', little: 'Little to gain' };

/** Every non-number state the screens draw, each with its own words. no_website and not_checked come from the lead. */
export type SiteScoreUnjudged = Exclude<SiteScoreState, 'scored'> | 'no_website' | 'not_checked';
export const SITE_SCORE_STATE_LABELS: Record<SiteScoreUnjudged, string> = {
  no_website: 'No website',
  profile_only: 'Social / directory only',
  js_only: 'JavaScript-only site',
  robots_blocked: 'Blocked by robots.txt',
  unreachable: 'Couldn’t reach',
  partial: 'Quick check only',
  not_checked: 'Not checked',
};

/** What a list row reads (the small columns, never the result or the evidence). */
export interface StoredSiteScore {
  site_score: number | null;
  site_score_state: string | null;
  site_score_version: number | null;
  site_score_reasons: SiteScoreReason[] | null;
  site_score_detail: SiteScore['detail'] | null;
}

export type SiteScoreView =
  | { kind: 'scored'; score: number; band: SiteScoreBand; reasons: SiteScoreReason[]; basis: string; checkedAt: string | null; pagesRead: number | null; version: number; capped: boolean }
  | { kind: 'state'; state: SiteScoreUnjudged; reason: string | null; checkedAt: string | null; version: number | null };

/** v1 stored 'unreadable' for every site it could not read; read as "couldn't reach" until the row is re-scored. */
const V1_STATE: Record<string, SiteScoreUnjudged> = { unreadable: 'unreachable', partial: 'partial' };

/** The view for a lead: its website on file, then its stored score. ⛔ A state this code does not know, or a scored row
 *  with no number, is "not checked" (never a number made up, never a state guessed). */
export function siteScoreViewFor(website: string | null | undefined, s: StoredSiteScore | null | undefined): SiteScoreView {
  const kind = classifyLeadWebsite(website).source;
  if (kind === 'none') return { kind: 'state', state: 'no_website', reason: null, checkedAt: null, version: null };
  if (kind === 'social_profile' || kind === 'directory_profile') return { kind: 'state', state: 'profile_only', reason: null, checkedAt: s?.site_score_detail?.checkedAt ?? null, version: s?.site_score_version ?? null };
  if (!s || s.site_score_version == null) return { kind: 'state', state: 'not_checked', reason: null, checkedAt: null, version: null };
  const checkedAt = s.site_score_detail?.checkedAt ?? null;
  const reason = s.site_score_reasons?.[0]?.text ?? null;
  if (s.site_score_state === 'scored' && typeof s.site_score === 'number') {
    return {
      kind: 'scored', score: s.site_score, band: siteScoreBand(s.site_score), reasons: s.site_score_reasons ?? [],
      basis: s.site_score_detail?.basis ?? 'deep', checkedAt, pagesRead: s.site_score_detail?.pagesRead ?? null, version: s.site_score_version,
      capped: s.site_score_detail?.capped === true,
    };
  }
  const st = (SITE_SCORE_STATES as readonly string[]).includes(s.site_score_state ?? '') && s.site_score_state !== 'scored'
    ? s.site_score_state as SiteScoreUnjudged
    : V1_STATE[s.site_score_state ?? ''] ?? 'not_checked';
  return { kind: 'state', state: st, reason: st === 'not_checked' ? null : reason, checkedAt, version: s.site_score_version };
}

/** The filter / sort key every list uses: a band, or the state. One function, so the pill, the filter and the sort agree. */
export type SiteScoreGroup = SiteScoreBand | SiteScoreUnjudged;
export function siteScoreGroupOf(v: SiteScoreView): SiteScoreGroup { return v.kind === 'scored' ? v.band : v.state; }
export const SITE_SCORE_GROUP_LABELS: Record<SiteScoreGroup, string> = { ...SITE_SCORE_BAND_LABELS, ...SITE_SCORE_STATE_LABELS };
/** Sort order: most room to improve first — big gains (lowest number first), some, little, then the states. */
export function siteScoreSortKey(v: SiteScoreView): number {
  if (v.kind === 'scored') return v.score;
  const order: SiteScoreUnjudged[] = ['no_website', 'profile_only', 'js_only', 'robots_blocked', 'unreachable', 'partial', 'not_checked'];
  return 200 + order.indexOf(v.state);
}
