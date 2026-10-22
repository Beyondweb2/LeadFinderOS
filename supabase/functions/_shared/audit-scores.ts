// THE STORED AUDIT SCORE (2026-10-22, Paul: "the audit results in the Inbox do not sync up"). Rules: src/lib/auditScore.ts.
// Record: docs/audit-score-one-ruler.md.
//
// The database marks a run dirty (ai_audit_runs.score_dirty_at) on every write of an answer, a run status or the audit's
// name / trade / town (migration 20261122090000). This rescores dirty runs with the card's OWN scorer and stores the result
// on the run (hook_score). The clear is conditional on the dirty stamp it read, so a write that lands mid-score leaves the run
// dirty for the next tick — a stored score is never shown as current over inputs that changed after it.
// A score that CHANGED on an audit the Visible flag already judged clears that judgement, so the flag is re-judged on the
// new numbers (it used to keep a verdict made before the competitor reader finished).
import {
  isOutreachAudit, leadAuditScore, scoreHookAuditForCard, storedScoreOf, type ScoredAudit, type LeadAuditScore,
} from "../../../src/lib/auditScore.ts";
import type { HookScoreRow } from "../../../src/lib/hookScore.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

/** What every reader selects to find a lead's score (the card's audit + run, and the run's stored score). */
export const SCORED_AUDIT_SELECT =
  "id, lead_id, created_at, is_market, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(id, status, run_number, created_at, hook_score, score_dirty_at)";

export const RESCORE_MAX_RUNS = 60;
export const RESCORE_BUDGET_MS = 20_000;

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function rescoreDirtyRuns(service: Service, opts: { maxRuns?: number; budgetMs?: number } = {}): Promise<{ scored: number; cleared: number; skipped: number; left: boolean }> {
  const t0 = Date.now();
  const max = opts.maxRuns ?? RESCORE_MAX_RUNS;
  const budget = opts.budgetMs ?? RESCORE_BUDGET_MS;
  // Newest runs first: an audit that just finished is scored before an old backlog row.
  const { data: runs, error } = await service.from("ai_audit_runs")
    .select("id, audit_id, status, score_dirty_at, hook_score, hook:results->hook, competitor_cleaning:results->competitor_cleaning")
    .not("score_dirty_at", "is", null).order("created_at", { ascending: false }).limit(max);
  if (error) throw error;
  const list = (runs ?? []) as Array<{ id: string; audit_id: string; status: string | null; score_dirty_at: string; hook_score: unknown; hook: unknown; competitor_cleaning: unknown }>;
  if (!list.length) return { scored: 0, cleared: 0, skipped: 0, left: false };
  const auditIds = [...new Set(list.map((r) => r.audit_id))];
  const { data: audits, error: aErr } = await service.from("ai_audits")
    .select("id, lead_id, created_at, business_name, business_type, location_text, is_market, audit_purpose, baseline_target_runs, is_measurement, baseline_contract")
    .in("id", auditIds);
  if (aErr) throw aErr;
  // deno-lint-ignore no-explicit-any
  const auditById = new Map<string, any>(((audits ?? []) as any[]).map((a) => [a.id, a]));
  let scored = 0; let cleared = 0; let skipped = 0;
  for (const run of list) {
    if (Date.now() - t0 > budget) { skipped++; continue; }
    const audit = auditById.get(run.audit_id);
    let next: unknown = null;
    if (audit && audit.lead_id && isOutreachAudit(audit)) {
      const { data: rows, error: qErr } = await service.from("ai_audit_queue").select("id, question, status, result, engines")
        .eq("run_id", run.id).order("created_at", { ascending: true });
      if (qErr) { skipped++; continue; }
      const card = scoreHookAuditForCard({
        audit, state: run.hook ?? null, runResults: { hook: run.hook ?? null, competitor_cleaning: run.competitor_cleaning ?? null },
        rows: (rows ?? []) as HookScoreRow[],
      });
      next = storedScoreOf(card.score);
    }
    // ⛔ CONDITIONAL: only if nothing re-marked the run while it was being scored.
    const { data: upd, error: uErr } = await service.from("ai_audit_runs")
      .update({ hook_score: next, scored_at: new Date().toISOString(), score_dirty_at: null })
      .eq("id", run.id).eq("score_dirty_at", run.score_dirty_at).select("id");
    if (uErr || !(upd ?? []).length) { skipped++; continue; }
    if (next) scored++; else cleared++;
    if (audit?.lead_id && !sameJson(run.hook_score, next)) {
      // The numbers moved: a Visible verdict made on this audit is re-judged on the new ones.
      await service.from("outreach_leads").update({ ai_visible_checked_audit_id: null })
        .eq("id", audit.lead_id).eq("ai_visible_checked_audit_id", audit.id);
    }
  }
  return { scored, cleared, skipped, left: list.length >= max || skipped > 0 };
}

/** One lead's score, read the way every screen reads it (src/lib/auditScore.ts leadAuditScore). Null = no outreach audit. */
export async function loadLeadScore(service: Service, leadId: string): Promise<LeadAuditScore | null> {
  const { data, error } = await service.from("ai_audits").select(SCORED_AUDIT_SELECT)
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(10);
  if (error) return null;
  return leadAuditScore((data ?? []) as ScoredAudit[]);
}
