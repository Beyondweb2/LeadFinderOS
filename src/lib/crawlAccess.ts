// crawlAccess — which crawl-check ids a SALESPERSON may name, decided once (2026-10-04, pre-sales
// certification M-006 / E-06; docs/pre-sales-certification/fixes-01-security-inbound.md).
//
// 🔴 THE HOLE. crawl-check proved the rep works the lead they named, then trusted the other ids in the
// same request: `job_id` (the status read preferred it, so a rep could read ANY lead's crawl result)
// and `run_id` (the rep's crawl was merged into ANY audit run's results — a paying client's baseline
// report included). Both are UUIDs a rep does not normally see; the impact is report integrity.
//
// THE RULE, positive and enumerated (absent cases included):
//   · run_id present (any non-empty value)          → refused: only the audit pipeline (an internal
//                                                     caller) files a crawl into a run;
//   · job_id present and its lead is THIS lead       → allowed;
//   · job_id present and its lead is another / null  → refused (a job we cannot place is not theirs);
//   · neither                                        → allowed (the lead check already ran).
// The admin path is not judged here: an operator legitimately reads any job and runs the paste-URL box.
// Pure, no imports: edge-safe and unit-tested (scripts/crawl-check-access.test.ts).

export type SalesCrawlIdsRefusal = 'run_id_not_allowed' | 'job_not_your_lead';

export function salesCrawlIdsRefusal(input: {
  leadId: string;
  jobId: string | null | undefined;
  jobLeadId: string | null | undefined;
  runId: unknown;
}): SalesCrawlIdsRefusal | null {
  if (input.runId !== null && input.runId !== undefined && String(input.runId).trim() !== '') return 'run_id_not_allowed';
  const jobId = typeof input.jobId === 'string' ? input.jobId.trim() : '';
  if (jobId) {
    if (typeof input.jobLeadId !== 'string' || !input.jobLeadId || input.jobLeadId !== input.leadId) return 'job_not_your_lead';
  }
  return null;
}
