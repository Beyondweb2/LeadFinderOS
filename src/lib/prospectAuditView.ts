/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DETAILED PROSPECT AUDIT — what the big results view shows, decided once (2026-10-05,
   docs/pre-sales-certification/prospect-full-crawl-audit-results.md). Pure: the dialog renders it,
   the tests drive it with fixtures.

   Three questions a salesperson asks before a call, answered from STORED evidence only:
     · Are they showing up in AI?          → the hook audit's own score (hookScore.ts, unchanged)
     · What is wrong with the website?     → the stored site audit (siteAudit.ts)
     · What is the strongest point to make? → callPoint: one AI fact + one website fact, each with
                                             the evidence it rests on.
   ⛔ NOTHING IS INVENTED. No result stored → "no AI check yet"; no crawl → "not crawled yet"; no
   website → the truthful no-website explanation (never a crawl error, never a guessed domain).
   ⛔ NO SCORE IS RE-COMPUTED HERE. The AI numbers are HookScore's; the website has no number at all.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { HookScore } from './hookScore';
import { auditFromStoredCrawl, HOME_FETCH_LABELS, type AuditFinding, type SiteAudit, type StoredCrawlForAudit } from './siteAudit';
import { isAggregatorUrl } from './aggregators';

export const NO_WEBSITE_TEXT = 'No website was found for this business, so there is no site for search engines or AI systems to crawl and verify.';
export const NO_WEBSITE_WHY = 'Without a site of its own, AI tools can only go on what directories, listings and reviews say about the business — and Gemini in particular leans on businesses’ own websites. A simple, accurate site gives them a source the business controls.';
export const NO_WEBSITE_ON_FILE_TEXT = 'No website is recorded on this lead. If the business has one, add it to the lead and crawl it.';

export type WebsiteState =
  | { kind: 'no_website'; confirmed: boolean }
  | { kind: 'directory_only'; url: string }
  | { kind: 'not_crawled'; url: string }
  | { kind: 'crawling'; url: string; label: string | null }
  | { kind: 'failed'; url: string; reason: string; checkedAt: string | null }
  | { kind: 'audited'; url: string; audit: SiteAudit; checkedAt: string | null; source: 'fresh' | 'saved' };

export interface LeadForAudit { website?: string | null; place_id?: string | null }

/** The website half's state. `justRan` = this view started or watched the crawl that produced the row. */
export function websiteState(input: {
  lead: LeadForAudit | null; row: (StoredCrawlForAudit & { created_at?: string | null }) | null;
  running: { label?: string | null } | null; justRan?: boolean;
}): WebsiteState {
  const site = String(input.lead?.website ?? '').trim();
  /* ⛔ "No website" is only CONFIRMED when Google's listing (a place id) has none; a blank field on a
     hand-added lead is "none on file" — false is never inferred from blank (CLAUDE.md §6 Reports). */
  if (!site) return { kind: 'no_website', confirmed: !!input.lead?.place_id };
  if (isAggregatorUrl(site)) return { kind: 'directory_only', url: site };
  if (input.running) return { kind: 'crawling', url: site, label: input.running.label ?? null };
  const row = input.row;
  if (!row) return { kind: 'not_crawled', url: site };
  const checkedAt = row.result?.checked_at ?? row.created_at ?? null;
  const fetchFailed = row.result?.signals?.fetchFailed === true || (row.mode === 'full' && row.full_evidence?.completeness === 'failed');
  if (fetchFailed) {
    const hf = row.result?.homeFetch ?? null;
    const reason = hf ? HOME_FETCH_LABELS[hf.kind] + (hf.status ? ` (HTTP ${hf.status})` : '') : 'The website could not be reached when it was crawled — it may have been down or blocking automated requests.';
    return { kind: 'failed', url: site, reason, checkedAt };
  }
  const audit = auditFromStoredCrawl(row);
  if (!audit) return { kind: 'not_crawled', url: site };
  return { kind: 'audited', url: site, audit, checkedAt, source: input.justRan ? 'fresh' : 'saved' };
}

/** A plain coverage line: "Read 500 of 2,340 pages found (capped) · 3 sitemaps · checked 2 Oct". */
export function coverageLine(audit: SiteAudit): string {
  const f = (n: number) => n.toLocaleString('en-GB');
  const c = audit.coverage;
  if (audit.basis === 'quick') return 'Quick check — a sample of up to 12 pages, not a full crawl.';
  if (!c) return 'Full crawl (from before coverage was recorded).';
  if (c.capped) return `Capped crawl: read ${f(c.pagesCrawled)} of ${f(c.urlsDiscovered)} addresses found — ${f(c.notCrawled)} not read. Not the whole site.`;
  return `Full crawl: every page found was read (${f(c.pagesCrawled)} page${c.pagesCrawled === 1 ? '' : 's'}).`;
}

export interface CallPoint {
  ai: { headline: string; evidence: string[] } | null;
  site: { headline: string; evidence: string[]; findingId: string } | null;
}

/** The single website finding most worth raising: the first HIGH, else the first MEDIUM, that is not a
 *  structured-data finding (tested NEGATIVE as a lever, CLAUDE.md §5). Null when nothing qualifies. */
export function strongestFinding(audit: SiteAudit | null): AuditFinding | null {
  if (!audit) return null;
  const issues = audit.findings.filter((f) => f.severity !== 'good' && f.category !== 'structured_data');
  return issues.find((f) => f.severity === 'high') ?? issues.find((f) => f.severity === 'medium') ?? null;
}

/** The one AI fact + the one website fact worth saying on this call, each with its evidence. */
export function callPoint(input: { score: HookScore | null; rivalsWithheld?: boolean; site: WebsiteState }): CallPoint {
  const s = input.score;
  let ai: CallPoint['ai'] = null;
  if (s && s.complete) {
    if (s.allNamed) ai = { headline: `Strong AI visibility — named in all ${s.expected} answers.`, evidence: s.perEngine.map((t) => `${t.label}: named ${t.named} of ${t.expected}`) };
    else if (s.hook) {
      const rivals = !input.rivalsWithheld && s.hook.competitors.length ? `It named ${s.hook.competitors.slice(0, 3).join(', ')} instead.` : '';
      ai = {
        headline: `${s.hook.label} did not name them when asked “${s.hook.question}”.`,
        evidence: [`Named in ${s.named} of ${s.expected} AI answers overall.`, ...(rivals ? [rivals] : [])],
      };
    } else ai = { headline: `Named in ${s.named} of ${s.expected} AI answers.`, evidence: s.perEngine.map((t) => `${t.label}: named ${t.named} of ${t.expected}`) };
  }
  let site: CallPoint['site'] = null;
  if (input.site.kind === 'no_website' && input.site.confirmed) site = { headline: NO_WEBSITE_TEXT, evidence: ['Google’s listing for the business has no website.'], findingId: 'no_website' };
  else if (input.site.kind === 'audited') {
    const f = strongestFinding(input.site.audit);
    if (f) site = { headline: f.title, evidence: [f.saw, ...(f.evidence ?? []).slice(0, 2), ...f.urls.slice(0, 2)], findingId: f.id };
  }
  return { ai, site };
}

/** Per-engine rows for the AI section, in question order. */
export function engineSections(score: HookScore | null) {
  if (!score) return [];
  return score.perEngine.map((t) => ({
    engine: t.engine, label: t.label, named: t.named, valid: t.valid, expected: t.expected, failed: t.failed, pending: t.pending,
    results: score.results.filter((r) => r.engine === t.engine),
  }));
}

/** "example.co.uk" from a URL, for citation chips. */
export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
