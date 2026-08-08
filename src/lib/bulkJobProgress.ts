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
  phase?: string;
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
  /** "Bulk enrich" / "Audit and push" / the raw job_type when unknown. */
  label: string;
  /** Which half of a two-phase job is running. Empty when there is nothing honest to say. */
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
  site_gen: 'Bulk site generation',
  audit: 'Bulk audit',
  audit_and_push: 'Audit and push',
};

/** Statuses that mean an item is still moving. Everything else is terminal. */
const IN_FLIGHT = new Set(['pending', 'running', 'awaiting_audit']);

export function bulkJobProgress(job: BulkJobProgressInput): BulkJobProgress {
  const label = LABELS[job.job_type] ?? job.job_type;
  const doneWord = job.job_type === 'audit_and_push' ? 'pushed' : 'done';
  const settled = job.done_count + job.failed_count + job.skipped_count;
  const total = job.total;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((settled / total) * 100))) : 0;

  const items = Array.isArray(job.items) ? job.items : null;
  let phase = '';
  if (job.job_type === 'audit_and_push' && items) {
    const auditItems = items.filter((it) => it.phase === 'audit');
    const stillAuditing = auditItems.filter((it) => IN_FLIGHT.has(it.status)).length;
    const readyToPush = items.filter((it) => it.phase === 'push' && it.status === 'pending').length;

    if (stillAuditing > 0) {
      /* An audit takes minutes, so the operator watches this number for a long time. It says how
         many are ANSWERED, because that is the thing that moves; a bare "auditing 8" looks frozen. */
      phase = `auditing — ${auditItems.length - stillAuditing} of ${auditItems.length} answered`;
    } else if (readyToPush > 0) {
      phase = `pushing ${readyToPush} to Instantly`;
    }
    /* No else. Nothing in flight and nothing ready means the phase is genuinely nothing, and an
       invented "finishing up" would be a claim about a state we have not observed. */
  }

  return { label, phase, settled, total, pct, doneWord };
}
