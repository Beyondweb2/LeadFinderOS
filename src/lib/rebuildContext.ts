/* ════════════════════════════════════════════════════════════════════════════════════════════════
   REBUILD CONTEXT — turn what paid-client-hub's `rebuild_context` action returns into the input the
   rebuild prompt is generated from.

   One place where the five sources are named and ranked, so "where did this line come from" has a
   single answer. The ranking itself lives in clientFacts.ts; this module only decides WHICH ROW
   plays WHICH role:

     onboarding row        → onboarding    (the client confirmed it)
     paid lead row         → client_record
     BASELINE audit row    → baseline      (its frozen context)
     DISCOVERY audit row   → discovery     (verified prior context, never the baseline)
     lead_crawl_checks     → crawl         (stored findings, read not re-run)

   ⛔ DISCOVERY CANNOT SUBSTITUTE FOR THE BASELINE. Its row is passed as a FACT source only — a name,
   a category, a location, a website. Its measurement numbers are never read, and the baseline half
   of the prompt is built solely from the report of the audit the lead claims as its baseline. When
   there is no completed baseline, the prompt says so; it does not quietly use Discovery's numbers.
   ⛔ NOTHING HERE MEASURES OR WRITES.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { buildBaselineSummary, visibilitySignals, dayLabel } from './baselineSummary.ts';
import { clientConfirmationsNeeded, resolveClientFacts, toList } from './clientFacts.ts';
import type { RebuildPromptInput } from './websiteBuildPrompt.ts';
import { parseWebsiteBuild } from './websiteBuildState.ts';
import { buildFaultLines } from './crawlCheck.ts';
import type { AiAuditReportData } from './aiAuditReportHtml.ts';
import type { CrawlStoredResult } from './crawlResult.ts';
import type { FullCrawlEvidence } from './fullCrawl.ts';

/** Exactly what the edge action returns. Every field may be absent. */
export interface RebuildContextPayload {
  lead: Record<string, unknown> | null;
  onboarding: Record<string, unknown> | null;
  baseline_audit: Record<string, unknown> | null;
  baseline_audit_id: string | null;
  baseline_completed_at: string | null;
  report: AiAuditReportData | null;
  discovery_audit: Record<string, unknown> | null;
  /** The lead's ONE lead_crawl_checks row — whichever screen's Crawl site button wrote it. */
  crawl: { url?: string | null; result?: CrawlStoredResult | null; created_at?: string | null; mode?: string | null; requested_from?: string | null; full_evidence?: Partial<FullCrawlEvidence> | null } | null;
  pages: Array<{ service?: string | null; town?: string | null; status?: string | null }>;
}

/** The stored crawl's faults as plain sentences, or [] when there is nothing stored or readable. */
export function crawlFindingsFrom(result: CrawlStoredResult | null | undefined): string[] {
  const signals = result?.signals;
  if (!signals) return [];
  /* buildFaultLines returns [] when the site could not be read at all — the honest answer is then
     "nothing stored", not a list of things we could not check. */
  return buildFaultLines(signals).map((f) => `${f.title}: ${f.detail}`);
}

/** Assemble everything the prompt is built from. Pure: no I/O, no clock beyond the prompt's stamp. */
export function toRebuildPromptInput(p: RebuildContextPayload): RebuildPromptInput {
  const lead = p.lead ?? {};
  const build = parseWebsiteBuild((lead as { website_build?: unknown }).website_build);

  const facts = resolveClientFacts({
    lead: lead as never,
    onboarding: p.onboarding as never,
    baselineAudit: p.baseline_audit as never,
    discoveryAudit: p.discovery_audit as never,
    savedCanonicalDomain: build.canonical_domain || null,
  });

  /* ⛔ A BASELINE SUMMARY ONLY WHEN THE BASELINE IS BOTH COMPLETE AND REPORTABLE. Either half
     missing → null, and the prompt prints its "no completed baseline" branch rather than an
     authoritative-looking section built on a partial run. */
  const baseline = (p.report && p.baseline_completed_at)
    ? buildBaselineSummary(p.report, p.baseline_completed_at)
    : null;

  return {
    facts,
    confirmations: clientConfirmationsNeeded(facts),
    build,
    baseline,
    /* The frozen set, taken from the onboarding row that approval wrote it to. */
    frozenQuestions: toList((p.onboarding as { baseline_questions?: unknown } | null)?.baseline_questions),
    baselineAuditId: p.baseline_audit_id,
    signals: (p.report && baseline) ? visibilitySignals(p.report, facts.website.value) : [],
    crawlFindings: crawlFindingsFrom(p.crawl?.result),
    crawlUrl: (p.crawl?.url ?? p.crawl?.result?.url ?? null) || null,
    crawlCheckedAt: dayLabel(p.crawl?.created_at ?? p.crawl?.result?.checked_at ?? null) || null,
    plannedPages: p.pages ?? [],
  };
}
