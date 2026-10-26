/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SITE SCORE (2026-10-23, feat/site-score; docs/site-score.md). A number out of 100 on each lead's
   Outreach and Inbox row, so the team can see how a website stands without opening it.

   ⛔ FOR THE TEAM ONLY. Never shown to a prospect or a client, never in a message, template, report or
      pitch. scripts/site-score.test.ts walks every sender / report / client-facing renderer and fails
      if one reaches this file.
   ⛔ ONE JUDGE OF THE SITE. The score is read off THE ONE WEBSITE CHECK (websiteCheck.ts) — the same
      issues the call script, the Inbox popup and the report say. It does not look at the site again
      and adds no rule of its own about what is wrong; it only weighs what the check already found.
   ⛔ SAME SITE, SAME NUMBER. Pure arithmetic on the stored check: no clock, no randomness, no model,
      fixed weights. The same stored check always gives the same score and the same reasons.
   ⛔ "COULD NOT READ" IS ITS OWN STATE, NEVER A ZERO. A site that did not answer, or whose homepage
      builds its text in the browser (client_rendered: the crawl saw an almost empty page), or where
      no page was read, gets state 'unreadable' and no number.
   ⛔ ONLY A DEEP CHECK GETS A NUMBER. The quick check reads up to ~12 pages and, before 2026-10-11, judged only
      a handful of technical signals: on the live rows (2026-10-23) its median score was 99 against 69 for the deep
      check of comparable sites, so a quick-check number would rank an unread site above a read one. A quick check is
      state 'partial' (no number, "Quick check only"); the deep check queued behind it for a prospect replaces it.
   ⛔ VERSIONED. SITE_SCORE_VERSION is stored with every score. Changing a weight, an area or a mapping
      is a new version, and old rows keep the number they were given until re-scored on purpose.

   v1: 90 points over nine areas, each area losing a share of its points for each issue the check
   found in it (by severity), shown rescaled to 100. No paid model call (Paul, 2026-10-23: model out).

   Pure; no I/O. IMPORTED BY EDGE FUNCTIONS (crawl-check, crawl-job): relative imports with .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { placeholderPagesOnce, summariseWebsiteCheck, usableWebsiteCheck, type WebsiteCheckSummary, type WebsiteIssue, type WebsiteIssueSeverity } from './websiteCheck.ts';
import type { StoredCrawlForAudit } from './siteAudit.ts';

export const SITE_SCORE_VERSION = 1;
/** v1 is scored out of this many points and shown rescaled to 100. */
export const SITE_SCORE_RAW_MAX = 90;
/** Reasons kept with a score: the biggest losses first, then one strength. */
export const SITE_SCORE_MAX_DOWN_REASONS = 3;

export type SiteScoreArea = 'services' | 'local' | 'answers' | 'contact' | 'trust' | 'headings' | 'markup' | 'reachable' | 'mobile';

/** Points per area. Sums to SITE_SCORE_RAW_MAX (tested). */
export const SITE_SCORE_AREA_POINTS: Record<SiteScoreArea, number> = {
  services: 15, local: 12, answers: 8, contact: 12, trust: 12, headings: 8, markup: 6, reachable: 10, mobile: 7,
};

export const SITE_SCORE_AREA_LABELS: Record<SiteScoreArea, string> = {
  services: 'Services', local: 'Town and areas', answers: 'Answers questions', contact: 'Contact',
  trust: 'Proof and trust', headings: 'Titles and headings', markup: 'Business details in the page code',
  reachable: 'Can be found and read', mobile: 'Phones and speed',
};

/** Share of an area's points one issue takes away, in percent, by the severity the check gave it. */
export const SITE_SCORE_SEVERITY_LOSS: Record<WebsiteIssueSeverity, number> = { high: 60, medium: 35, low: 12 };

/** Issues that, on their own, mean the whole area is missing (said as such by the check). */
const WHOLE_AREA: ReadonlySet<string> = new Set(['no_contact_route', 'one_page_site']);

/** Every issue id the website check makes → the area it counts against. An id not listed takes nothing off (and the
 *  test lists the ids seen live so a new one is noticed). */
export const SITE_SCORE_ISSUE_AREA: Record<string, SiteScoreArea> = {
  // services
  no_service_pages: 'services', service_page_gaps: 'services', services_on_one_page: 'services', one_page_site: 'services',
  thin_key_pages: 'services', thin_pages: 'services', near_duplicate_pages: 'services', internal_linking: 'services',
  ct_generic_copy: 'services', ct_mixed_audience: 'services',
  // town and areas
  ct_areas_not_stated: 'local', ct_area_coverage: 'local', location_unclear: 'local', town_missing: 'local', no_address: 'local',
  vs_address_not_on_key_pages: 'local', vs_town_swapped_pages: 'local',
  // answers
  no_questions_answered: 'answers', vs_duplicate_faq_pages: 'answers',
  // contact
  no_contact_route: 'contact', no_phone: 'contact', no_contact_details: 'contact', no_contact_page: 'contact', ct_link_mismatch: 'contact',
  // proof and trust
  ct_no_proof: 'trust', no_reviews: 'trust', ct_accreditations_unnamed: 'trust', ct_no_accreditations: 'trust', ct_no_people: 'trust',
  no_about_page: 'trust', ct_missing_entity_facts: 'trust', ct_conflicting_facts: 'trust', ct_unsourced_claims: 'trust',
  ct_placeholder_content: 'trust', ct_ai_images: 'trust', ct_logo_alt_mismatch: 'trust', ct_identical_dates: 'trust',
  name_unclear: 'trust', vs_name_inconsistent: 'trust',
  // titles and headings
  missing_title: 'headings', missing_h1: 'headings', multiple_h1: 'headings', long_titles: 'headings', duplicate_titles: 'headings',
  missing_description: 'headings', ct_vague_headings: 'headings', vs_key_page_basics: 'headings', ct_image_alt: 'headings',
  vs_raw_link_markup: 'headings',
  // business details in the page code
  no_business_schema: 'markup', schema_malformed: 'markup', schema_wrong_domain: 'markup', ct_schema_mismatch: 'markup',
  ct_schema_incomplete: 'markup', ct_schema_unverified: 'markup', vs_business_schema: 'markup', vs_faq_no_schema: 'markup',
  no_breadcrumbs: 'markup', schema_phone_mismatch: 'markup',
  // can be found and read
  no_https: 'reachable', ct_no_https: 'reachable', robots_blocks_all: 'reachable', ct_robots_blocks_ai: 'reachable',
  robots_blocks_ai_search: 'reachable', noindex_home: 'reachable', noindex_pages: 'reachable', noindex_important_page: 'reachable',
  no_sitemap: 'reachable', ct_no_sitemap: 'reachable', sitemap_off_site: 'reachable', sitemap_wrong_domain: 'reachable',
  sitemap_only_pages: 'reachable', ct_orphan_pages: 'reachable', canonical_mismatch: 'reachable', canonical_off_site: 'reachable',
  canonical_off_domain: 'reachable', broken_pages: 'reachable', ct_broken_links: 'reachable', ct_dead_links: 'reachable',
  deep_pages: 'reachable', internal_redirects: 'reachable', redirects_to_other_domain: 'reachable', robots_disallowed_pages: 'reachable',
  unreachable_pages: 'reachable', no_robots: 'reachable', vs_duplicate_homepage: 'reachable',
  // phones and speed
  no_viewport: 'mobile', ct_no_viewport: 'mobile', slow_pages: 'mobile', some_slow_pages: 'mobile',
};

/** robots_blocks_<crawler> and robots_blocks_pages_<crawler> carry the crawler in the id. */
export function siteScoreAreaOf(id: string): SiteScoreArea | null {
  if (SITE_SCORE_ISSUE_AREA[id]) return SITE_SCORE_ISSUE_AREA[id];
  if (id.startsWith('robots_blocks_')) return 'reachable';
  return null;
}

/** The strength said beside the losses: the first, in this order, whose area lost nothing (so the hover never says
 *  "Service pages found" under "Some services have no page of their own"). */
const STRENGTH_AREA: ReadonlyArray<[string, SiteScoreArea]> = [
  ['service_pages', 'services'], ['reviews_shown', 'trust'], ['answers_questions', 'answers'], ['town_stated', 'local'],
  ['enquiry_form', 'contact'], ['phone_shown', 'contact'], ['work_shown', 'trust'], ['credentials', 'trust'], ['people', 'trust'],
  ['business_schema', 'markup'], ['name_clear', 'trust'], ['https_ok', 'reachable'], ['sitemap_ok', 'reachable'],
  ['about_page', 'trust'], ['experience', 'trust'], ['oai_searchbot_ok', 'reachable'], ['profiles_linked', 'trust'],
];

/** scored = a number; unreadable = the site could not be read; partial = only a quick check so far. None is ever a zero. */
export type SiteScoreState = 'scored' | 'unreadable' | 'partial';

export interface SiteScoreReason {
  /** 'down' = took points off; 'up' = something the site does well. */
  kind: 'down' | 'up';
  text: string;
  /** Points out of 100 this issue took off (down only). */
  points?: number;
}

export interface SiteScore {
  version: number;
  state: SiteScoreState;
  /** 0–100; null when the site could not be read. */
  score: number | null;
  reasons: SiteScoreReason[];
  detail: {
    /** 'deep' = the full / capped crawl; 'quick' = the 12-page check (the deep one follows for a prospect). */
    basis: 'deep' | 'quick' | 'failed';
    pagesRead: number | null;
    checkedAt: string | null;
    /** Points kept per area, out of SITE_SCORE_AREA_POINTS (scored only). */
    areas?: Record<SiteScoreArea, number>;
    /** Points out of SITE_SCORE_RAW_MAX before rescaling (scored only). */
    raw?: number;
  };
}

const UNREADABLE_JS = 'The homepage builds its text in the browser, so our check read almost nothing.';
const UNREADABLE_NONE = 'No page of the site could be read.';
export const PARTIAL_LINE = 'Only a quick check so far. The score comes with the deep check (Crawl site runs it).';

/** The score for ONE stored website-check summary. Pure. */
export function siteScoreFromSummary(s: WebsiteCheckSummary): SiteScore {
  const base = { basis: s.depth, pagesRead: s.pagesRead ?? null, checkedAt: s.checkedAt ?? null };
  if (s.depth === 'failed') {
    return { version: SITE_SCORE_VERSION, state: 'unreadable', score: null, reasons: [{ kind: 'down', text: s.failure ?? 'The website could not be read.' }], detail: base };
  }
  if (s.issues.some((i) => i.id === 'client_rendered')) {
    return { version: SITE_SCORE_VERSION, state: 'unreadable', score: null, reasons: [{ kind: 'down', text: UNREADABLE_JS }], detail: base };
  }
  if (s.pagesRead === 0) {
    return { version: SITE_SCORE_VERSION, state: 'unreadable', score: null, reasons: [{ kind: 'down', text: UNREADABLE_NONE }], detail: base };
  }
  if (s.depth !== 'deep') {
    return { version: SITE_SCORE_VERSION, state: 'partial', score: null, reasons: [{ kind: 'down', text: PARTIAL_LINE }], detail: base };
  }

  /* Loss per area in percent of the area, capped at 100. Issues are taken in a fixed order (id), so ties and the reasons
     never depend on the order the check stored them in. */
  const lossPct = Object.fromEntries(Object.keys(SITE_SCORE_AREA_POINTS).map((a) => [a, 0])) as Record<SiteScoreArea, number>;
  const charged: Array<{ issue: WebsiteIssue; area: SiteScoreArea; pct: number }> = [];
  const issues = [...s.issues].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const issue of issues) {
    const area = siteScoreAreaOf(issue.id);
    if (!area) continue;
    const want = WHOLE_AREA.has(issue.id) ? 100 : SITE_SCORE_SEVERITY_LOSS[issue.severity];
    const pct = Math.min(want, 100 - lossPct[area]);
    lossPct[area] += pct;
    if (pct > 0) charged.push({ issue, area, pct });
  }
  const areas = Object.fromEntries((Object.keys(SITE_SCORE_AREA_POINTS) as SiteScoreArea[])
    .map((a) => [a, round1(SITE_SCORE_AREA_POINTS[a] * (100 - lossPct[a]) / 100)])) as Record<SiteScoreArea, number>;
  const raw = round1((Object.keys(areas) as SiteScoreArea[]).reduce((t, a) => t + SITE_SCORE_AREA_POINTS[a] * (100 - lossPct[a]), 0) / 100);
  const score = Math.max(0, Math.min(100, Math.round(raw * 100 / SITE_SCORE_RAW_MAX)));

  /* The reasons: the biggest losses (points out of 100), then one thing the site does well. */
  const toHundred = (area: SiteScoreArea, pct: number) => Math.round(SITE_SCORE_AREA_POINTS[area] * pct / SITE_SCORE_RAW_MAX);
  const downs = charged
    .map((c) => ({ c, pts: SITE_SCORE_AREA_POINTS[c.area] * c.pct }))
    .sort((a, b) => b.pts - a.pts || (a.c.issue.id < b.c.issue.id ? -1 : 1))
    .slice(0, SITE_SCORE_MAX_DOWN_REASONS)
    .map(({ c }) => ({ kind: 'down' as const, text: c.issue.title, points: toHundred(c.area, c.pct) }));
  const strengthIds = new Set(s.strengths.map((x) => x.id));
  const upId = STRENGTH_AREA.find(([id, area]) => strengthIds.has(id) && lossPct[area] === 0)?.[0];
  const up = upId ? s.strengths.find((x) => x.id === upId) : null;
  const reasons: SiteScoreReason[] = [...downs, ...(up ? [{ kind: 'up' as const, text: up.title }] : [])];
  return { version: SITE_SCORE_VERSION, state: 'scored', score, reasons, detail: { ...base, areas, raw } };
}

/** The score for a stored crawl row: the stored summary (as every screen reads it) or, for a row without one, the summary
 *  built the same way. Null when there is nothing to score. */
export function siteScoreForRow(row: (StoredCrawlForAudit & { result?: (StoredCrawlForAudit['result'] & { websiteCheck?: unknown }) | null }) | null | undefined): SiteScore | null {
  if (!row) return null;
  const stored = usableWebsiteCheck(row.result?.websiteCheck);
  const summary = stored ? placeholderPagesOnce(stored) : summariseWebsiteCheck(row);
  return summary ? siteScoreFromSummary(summary) : null;
}

/** The lead_crawl_checks columns for a score (written beside `result` by both crawls and the backfill). Null score →
 *  every column null, so a row is never left with an old score beside a new result. */
export function siteScoreColumns(score: SiteScore | null, atIso: string): Record<string, unknown> {
  return {
    site_score: score?.score ?? null,
    site_score_state: score?.state ?? null,
    site_score_version: score ? score.version : null,
    site_score_reasons: score?.reasons ?? null,
    site_score_detail: score?.detail ?? null,
    site_score_at: score ? atIso : null,
  };
}

/* ── the display (both rows read these; nothing here is sent anywhere) ── */

export type SiteScoreBand = 'strong' | 'fair' | 'weak';
export const SITE_SCORE_BAND_MIN = { strong: 75, fair: 50 } as const;
export function siteScoreBand(score: number): SiteScoreBand {
  return score >= SITE_SCORE_BAND_MIN.strong ? 'strong' : score >= SITE_SCORE_BAND_MIN.fair ? 'fair' : 'weak';
}
export const SITE_SCORE_BAND_LABELS: Record<SiteScoreBand, string> = { strong: 'Strong', fair: 'Fair', weak: 'Weak' };

/** What a list row reads (the small columns, never the result). */
export interface StoredSiteScore {
  site_score: number | null;
  site_score_state: string | null;
  site_score_version: number | null;
  site_score_reasons: SiteScoreReason[] | null;
  site_score_detail: SiteScore['detail'] | null;
}

export type SiteScoreView =
  | { kind: 'scored'; score: number; band: SiteScoreBand; reasons: SiteScoreReason[]; basis: string; checkedAt: string | null; pagesRead: number | null; version: number }
  | { kind: 'unreadable'; reason: string; checkedAt: string | null; version: number }
  | { kind: 'partial'; reason: string; checkedAt: string | null; version: number }
  | { kind: 'none' };

/** The view for a stored score. ⛔ A state this code does not know, or a scored row with no number, is 'none' (never a
 *  number made up, never "unreadable" guessed). */
export function siteScoreView(s: StoredSiteScore | null | undefined): SiteScoreView {
  if (!s || s.site_score_version == null) return { kind: 'none' };
  const checkedAt = s.site_score_detail?.checkedAt ?? null;
  if (s.site_score_state === 'unreadable') {
    return { kind: 'unreadable', reason: s.site_score_reasons?.[0]?.text ?? 'The website could not be read.', checkedAt, version: s.site_score_version };
  }
  if (s.site_score_state === 'partial') {
    return { kind: 'partial', reason: s.site_score_reasons?.[0]?.text ?? PARTIAL_LINE, checkedAt, version: s.site_score_version };
  }
  if (s.site_score_state === 'scored' && typeof s.site_score === 'number') {
    return {
      kind: 'scored', score: s.site_score, band: siteScoreBand(s.site_score), reasons: s.site_score_reasons ?? [],
      basis: s.site_score_detail?.basis ?? 'deep', checkedAt, pagesRead: s.site_score_detail?.pagesRead ?? null, version: s.site_score_version,
    };
  }
  return { kind: 'none' };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
