/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHAT A RUNNING BULK JOB IS ACTUALLY DOING.

   ⛔ THE BUG THIS STARTED FROM. The progress line read
       `job_type === 'enrich' ? 'enrich' : 'site generation'`
   — a two-branch expression over a set that has had FOUR members since 'audit' was added. So every
   bulk audit Paul has ever run announced itself as "Bulk site generation running server-side". It
   never broke anything, which is exactly why it survived: the label was wrong and the numbers beside
   it were right, so it read as a cosmetic oddity rather than as a branch that had stopped covering
   its own input. Same shape as the six absent-value faults CLAUDE.md lists — the known values are
   branched on and everything else falls into the `else`, wearing a name the data never gave it.

   ⚠️ SO: a job type with no entry in LABELS renders its RAW job_type. Ugly on purpose. An unlabelled
   type should look unlabelled, not like some other job that happens to be listed last.

   ⚠️ AND THE PHASE IS DERIVED FROM ITEMS, NEVER STORED. Same reason serveGate derives its verdict:
   a stored phase would be a second copy of a truth the items already own, and it would be the copy
   that goes stale when a chunk dies mid-persist. `items` missing means "we cannot tell" and the
   phase is empty — never a guessed one.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface BulkJobProgressItem {
  status: string;
}

export interface BulkJobProgressInput {
  job_type: string;
  total: number;
  done_count: number;
  failed_count: number;
  skipped_count: number;
  items?: BulkJobProgressItem[] | null;
}

export interface BulkJobProgress {
  /** "Bulk enrich" / "Bulk audit" / the raw job_type when unknown. */
  label: string;
  /** Which half of a two-phase job is running. Always empty since the two-phase audit_and_push job
   *  went with Instantly (2026-09-16); kept so the Outreach render needs no change and a future
   *  two-phase job has a home. */
  phase: string;
  /** Items that have reached a terminal state. */
  settled: number;
  total: number;
  /** 0–100, clamped. 0 when total is 0 rather than NaN. */
  pct: number;
  /** What `done_count` counts for this job type — "pushed" reads very differently from "done". */
  doneWord: string;
}

const LABELS: Record<string, string> = {
  enrich: 'Bulk enrich',
  audit: 'Bulk audit',
};

export function bulkJobProgress(job: BulkJobProgressInput): BulkJobProgress {
  const label = LABELS[job.job_type] ?? job.job_type;
  const doneWord = 'done';
  const settled = job.done_count + job.failed_count + job.skipped_count;
  const total = job.total;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((settled / total) * 100))) : 0;

  const phase = '';

  return { label, phase, settled, total, pct, doneWord };
}
