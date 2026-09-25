/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE INBOX'S AI VISIBILITY CARD — which audit it reads and how it scores it (2026-09-25).

   Pure, no React, no Supabase. src/hooks/useHookVisibility.ts loads the rows; this file decides.

   ⛔ THE SCORE IS scoreHookRun (hookScore.ts), CALLED WITH THE REPORT'S OWN RULER: the audit's
   business name, trade and town as the NamedContext. So a result cannot be named here and not
   named on the report, in the 6/6 rule or in the send guard.
   ⛔ COMPETITOR NAMES GO THROUGH THE REPORT'S GATES, PER CELL. The run-level suppression
   (assessCompetitorCleanliness.suppressNames) blanks every list when the run's names are provably
   uncleaned, provable junk is dropped, and the business is never listed as its own rival. Each
   filter works on ONE cell's list. Nothing moves a name from one question or engine to another.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { auditKind, type AuditKindRow } from './auditKind';
import { assessCompetitorCleanliness, collectCompetitorNames, countAnsweredCells, isProvableJunkName } from './competitorCleaning';
import { excludeSelfRivals } from './rivalHook';
import { nameMatches } from './nameMatch';
import { scoreHookRun, type HookScore, type HookScoreRow } from './hookScore';

export interface HookCardAudit extends AuditKindRow {
  id: string;
  created_at: string | null;
  business_name: string | null;
  business_type: string | null;
  location_text: string | null;
  is_market?: boolean | null;
  ai_audit_runs?: Array<{ id: string; status: string | null; run_number: number | null; results?: unknown }> | null;
}

/** The kinds the card reads: an ordinary per-business audit (every hook is one) and the legacy
 *  pre-purpose single-run audit. A paid baseline, a measurement, a free check and a Discovery scan
 *  are different instruments and never shown as the outreach score. */
function isOutreachAudit(a: HookCardAudit): boolean {
  if (a.is_market === true) return false;
  const k = auditKind(a);
  return k === 'ordinary' || k === 'single_run';
}

/** The newest outreach audit for the lead that has a run, and its newest run. The newest one wins
 *  even while it is still running, so the card can show progress for the audit just started
 *  rather than the previous result. */
export function pickHookAudit<T extends HookCardAudit>(audits: readonly T[]): { audit: T; runId: string; runStatus: string | null; runResults: unknown } | null {
  const sorted = [...audits].filter(isOutreachAudit).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  });
  for (const audit of sorted) {
    const runs = [...(audit.ai_audit_runs ?? [])].sort((x, y) => (y.run_number ?? 0) - (x.run_number ?? 0));
    const run = runs[0];
    if (run?.id) return { audit, runId: run.id, runStatus: run.status ?? null, runResults: run.results ?? null };
  }
  return null;
}

/** The hook state stored on the run. `results.hook` is selected as a projection by the loader. */
export function hookStateOf(runResults: unknown): unknown {
  return (runResults as { hook?: unknown } | null | undefined)?.hook ?? null;
}

export interface HookCardScore {
  score: HookScore;
  /** True when the run's rival names are withheld (provably uncleaned). The card says so instead of
   *  implying AI named nobody. */
  rivalsWithheld: boolean;
}

export function scoreHookAuditForCard(input: {
  audit: Pick<HookCardAudit, 'business_name' | 'business_type' | 'location_text'>;
  state: unknown;
  runResults: unknown;
  rows: readonly HookScoreRow[];
}): HookCardScore {
  const business = (input.audit.business_name ?? '').trim();
  const rowsForCleaning = input.rows as unknown as Parameters<typeof collectCompetitorNames>[0];
  const cleanliness = assessCompetitorCleanliness(collectCompetitorNames(rowsForCleaning), input.runResults,
    { answeredCells: countAnsweredCells(input.rows as unknown as Parameters<typeof countAnsweredCells>[0]) });
  const rivalsWithheld = cleanliness.suppressNames;
  const score = scoreHookRun(input.state, input.rows, {
    named: { businessName: business, trade: input.audit.business_type || null, town: input.audit.location_text || null },
    town: input.audit.location_text ?? null,
    trade: input.audit.business_type ?? null,
    cleanCompetitors: (names) => rivalsWithheld ? [] : excludeSelfRivals(names.filter((n) => !isProvableJunkName(n)), business, nameMatches),
  });
  return { score, rivalsWithheld };
}

/** Is the run still being worked on? The card keeps refreshing while it is. Once the run is terminal,
 *  anything short of six valid results is INCOMPLETE and stays that way. Polling would never fix it. */
export function hookRunInFlight(runStatus: string | null): boolean {
  return runStatus === 'pending' || runStatus === 'running' || runStatus === 'processing';
}
