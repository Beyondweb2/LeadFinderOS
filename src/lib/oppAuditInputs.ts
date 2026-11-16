/* The Opportunity score's AUDIT INPUTS per lead, from one newest-first audit read (useOpportunityInputs). Not the score:
   the score itself is opportunityScore.ts / opportunityForLead.ts, imported only by the two lists and the cell
   (scripts/opportunity-score.test.ts). Team only (docs/OPPORTUNITY_SCORE.md). */
import { leadAuditScores, type LeadAuditScore, type ScoredAudit } from './auditScore.ts';
import { leadNewestRechecks, leadVerdictCounts, type LeadRecheckCounts, type StoredVerdictCounts } from './auditVerdictCounts.ts';

/** A lead's audit inputs: the hook score + the newest Discovery's counts, and — when a prospect re-check REPLACED the
 *  hook (2026-11-16, src/lib/prospectRecheck.ts) — that re-check, which then supplies the whole AI part. */
export type OppAuditInput = Partial<LeadAuditScore> & { verdicts?: StoredVerdictCounts | null; recheck?: LeadRecheckCounts | null };

/** A lead's newest re-check is attached when it REPLACED the hook — it is newer than the hook audit the score reads, or
 *  there is no hook — the same "older than the newest re-check" rule as prospectRecheck.replacedAuditIds. A hook started
 *  after the re-check keeps the hook score. */
export function oppAuditByLead(rows: readonly ScoredAudit[]): Map<string, OppAuditInput> {
  const scores = leadAuditScores(rows);
  const plain = rows as unknown as Array<{ id: string; lead_id: string | null; created_at: string; audit_purpose?: string | null; verdict_counts?: unknown }>;
  const counts = leadVerdictCounts(plain);
  const rechecks = leadNewestRechecks(plain);
  const createdOf = new Map(plain.map((a) => [a.id, Date.parse(a.created_at) || 0]));
  const out = new Map<string, OppAuditInput>();
  for (const [lead, s] of scores) out.set(lead, { ...s, verdicts: counts.get(lead) ?? null });
  for (const [lead, r] of rechecks) {
    const hook = out.get(lead);
    const hookAt = hook?.auditId ? createdOf.get(hook.auditId) ?? 0 : 0;
    if (!hook || (Date.parse(r.createdAt) || 0) > hookAt) out.set(lead, { ...(hook ?? {}), verdicts: hook?.verdicts ?? counts.get(lead) ?? null, recheck: r });
  }
  return out;
}
