/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS AUDIT FINISHED? (Paul, 2026-11-21, fix/incomplete-audit-runs)

   The case: "London Domestic Maintenance Ltd" was set up as 39 questions × 3 runs × 2 AIs = 234 answers, got 94 (the
   per-run cap cut it off, see auditLimits.ts auditRunCapUsd), and the app page showed a final-looking "0/94 · 0%" while the
   report page said "not finished". One rule for the app page, the same words as the report: an audit that did not get
   every answer it was set up to ask is IN PROGRESS ("94 of 234 answers"), never a score, and Create report / prospect
   sharing wait until it is complete or a teammate overrides.

   Counted from the queue: every row is one question in one run, worth two scored answers (ChatGPT + Gemini).
   Only audits that are SUPPOSED to have every row answered are judged: Discovery, targeted, measurement, re-check, or any
   audit with a multi-run target. A hook / quick check stops early on purpose and is never judged here.
   Pure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const COVERAGE_PURPOSES: readonly string[] = ['discovery', 'targeted', 'measurement', 'recheck'];
/** Scored AIs per question row. */
export const ANSWERS_PER_ROW = 2;

export interface CoverageRow { run_id: string; status: string }
export interface CoverageInput {
  purpose: string | null | undefined;
  targetRuns: number | null | undefined;
  /** The audit's runs as they exist now. */
  runs: { id: string; status: string }[];
  rows: CoverageRow[];
}
export interface AuditCoverage {
  /** False for audits that stop early on purpose (hooks, quick checks): nothing to judge. */
  applies: boolean;
  complete: boolean;
  expectedAnswers: number;
  gotAnswers: number;
  /** "94 of 234 answers" */
  label: string;
}

const LIVE = new Set(['pending', 'running']);

export function auditCoverage(i: CoverageInput): AuditCoverage {
  const purpose = String(i.purpose ?? '').trim().toLowerCase();
  const target = Number(i.targetRuns ?? 0) || 0;
  const applies = COVERAGE_PURPOSES.includes(purpose) || target > 1;
  const perRun = new Map<string, number>();
  let done = 0;
  for (const r of i.rows) {
    perRun.set(r.run_id, (perRun.get(r.run_id) ?? 0) + 1);
    if (r.status === 'done') done++;
  }
  const questions = Math.max(0, ...perRun.values());
  const runs = Math.max(target, i.runs.length, 1);
  const expectedRows = questions * runs;
  const live = i.runs.some((r) => LIVE.has(r.status));
  const complete = expectedRows > 0 && done >= expectedRows && !live;
  const label = `${done * ANSWERS_PER_ROW} of ${expectedRows * ANSWERS_PER_ROW} answers`;
  return { applies, complete: applies ? complete : true, expectedAnswers: expectedRows * ANSWERS_PER_ROW, gotAnswers: done * ANSWERS_PER_ROW, label };
}
