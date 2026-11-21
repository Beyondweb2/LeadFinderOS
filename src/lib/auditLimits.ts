/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REAL AUDIT LIMITS, in one place — so the words a person reads cannot drift from the numbers the
   code enforces (2026-10-15). The Outreach "Run AI audits" box said "Capped at $3/audit + $15/day"; no
   such cap exists. These are the ones that do:

     per run     AUDIT_RUN_CAP_USD            process-ai-audit-queue stops a run past it
     per day     POOL_DAILY_CAP_USD.prospecting  rolling 24 h, per user (auditBudget.ts)
     per press   AUDIT_BULK_JOB_MAX_LEADS     bulk-jobs refuses a larger job
     per month   APIFY_RESERVE_PCT.prospecting   prospecting pauses at this % of the Apify monthly cap;
                 client work keeps going to its own reserve, baselines to 100%

   ⛔ NAMED CONSTANTS, never a figure in prose. The edge functions import these; so does the dialog.
   Pure. IMPORTED BY EDGE FUNCTIONS: relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { APIFY_RESERVE_PCT, POOL_DAILY_CAP_USD } from './auditBudget.ts';

/** Per-RUN Apify cost ceiling: a run that would pass it stops starting questions. */
export const AUDIT_RUN_CAP_USD = 1.0;

/** What ONE question may cost inside a run: eight actor starts at the per-question estimate (SOURCES.ai_search.estCostUsd,
 *  $0.0125) — a normal question uses two or three (ChatGPT+Gemini, Google AI beside it, a lane retry). */
export const AUDIT_PER_QUESTION_CAP_USD = 0.1;

/** The cap for ONE run of `questionCount` questions: never below the flat floor, and growing with the question count.
 *  ⛔ WHY (21 Nov 2026, London Domestic Maintenance Ltd): the flat $1 was sized for runs of up to 20 questions with one start
 *  each. A 39-question run starts two actors per question, spent $1 on about 16 questions, and the other 71 rows were
 *  failed with 'cost_cap' - an audit that looked finished at "0/94". The daily budget pool and the Apify reserve still
 *  bound the spend; this only stops a legitimate long run from being cut off. */
export function auditRunCapUsd(questionCount: number): number {
  const n = Number.isFinite(questionCount) && questionCount > 0 ? Math.floor(questionCount) : 0;
  return Math.max(AUDIT_RUN_CAP_USD, n * AUDIT_PER_QUESTION_CAP_USD);
}

/** The most leads one bulk-audit job may carry (a larger job is REFUSED, not sliced). */
export const AUDIT_BULK_JOB_MAX_LEADS = 100;

const usd = (n: number): string => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/** Apify headroom left for PROSPECTING this cycle: up to the reserve line, not the whole cap — the last slice of
 *  the month is kept for client baselines and re-measures. Null when either figure is unknown. */
export function prospectingRemainingUsd(
  usage: { monthlyUsageUsd?: number | null; maxMonthlyUsageUsd?: number | null } | null | undefined,
): number | null {
  const used = usage?.monthlyUsageUsd;
  const cap = usage?.maxMonthlyUsageUsd;
  if (used == null || cap == null || !Number.isFinite(used) || !Number.isFinite(cap)) return null;
  return Math.max(0, (cap * APIFY_RESERVE_PCT.prospecting) / 100 - used);
}

/** The one sentence the bulk-audit dialog shows, built from the constants above. */
export function auditLimitsSentence(): string {
  return `Limits: up to ${usd(AUDIT_RUN_CAP_USD)} of checking per audit, ${usd(POOL_DAILY_CAP_USD.prospecting)} a day across prospecting audits, `
    + `${AUDIT_BULK_JOB_MAX_LEADS} leads per run, and prospecting pauses once Apify reaches ${APIFY_RESERVE_PCT.prospecting}% of its monthly cap.`;
}
