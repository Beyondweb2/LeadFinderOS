/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LOCKED BASELINE — the exact questions a client's before/after is measured on.

   ⛔ WHAT THIS DOES AND DOES NOT FIX, stated plainly because the reason it was asked for was not
   the reason it is worth having. Re-measures do NOT regenerate questions today: create-ai-audit
   uses a supplied list verbatim (`questions = providedQuestions`) and, with none supplied, reuses
   the previous run's set ("Like-for-like re-run"). There is no randomness in the generator — no
   temperature, no shuffle — and baselines deliberately opt out of the cross-audit coverage
   directive because "a paid client's set must be stable and seed-driven". Verified on RG's live
   data 2026-09-08: his 11 Aug, 26 Aug and 8 Sep measurements ask the BYTE-IDENTICAL same 12
   strings.

   So this is not a fix for drift. It converts a guarantee that happens to hold into one that is
   RECORDED AND CHECKABLE:
     · the exact set is written down, with the audit and date it came from, so the intent survives
       the operator's memory;
     · a proposed re-measure is diffed against it BEFORE the money is spent, instead of the
       mismatch appearing afterwards as unmatched rows in the comparison;
     · a client whose questions genuinely DO move is caught. ABLM is that client: 28 runs, 10
       different question sets, and a 21 Jul vs 28 Aug pair that compares zero questions.

   ⚠️ THE LOCK NEVER CHANGES WHAT RUNS. It seeds the dialog and it warns. The operator can still
   edit the list and run it — because a legitimate reason to change the set exists (a town the
   client stopped serving) and a tool that refuses would just be worked around. What must not
   happen is changing it BY ACCIDENT, and that is what the diff prevents.

   PURE. No React, no Supabase.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** A frozen measurement set. Stored as one row per business in `measurement_locks`. */
export interface MeasurementLock {
  /** Schema version, so a later shape change is detectable rather than guessed at. */
  version: 1;
  /** The questions, verbatim and in order, exactly as they were queued. */
  questions: string[];
  /** Runs per question the baseline was measured at — what a comparable re-measure must repeat. */
  runs: number;
  /** The audit the set was taken from, so the lock can be traced to real rows. */
  sourceAuditId: string;
  /** When the baseline was measured (not when it was locked). */
  measuredAt: string | null;
  lockedAt: string;
  /** Free text from the operator: why this is the baseline. */
  note?: string;
}

/** Case-insensitive identity, the SAME rule the comparison joins on (qKey in measurementCompare),
 *  so a question the lock calls matched is one the comparison will also match. Trimmed and
 *  lowercased only — punctuation and spelling are NOT normalised, because "accoutnant in wisbech"
 *  asked again is a valid like-for-like and a tidied version measures something else. */
const key = (q: string) => q.trim().toLowerCase();

export interface LockDiff {
  /** Locked questions the proposal also asks. */
  matched: string[];
  /** Locked questions the proposal DROPS — the ones that would lose their before side. */
  missing: string[];
  /** Questions in the proposal that are not in the lock — new, with no before side. */
  added: string[];
  /** True when the proposal asks exactly the locked set, order aside. */
  identical: boolean;
  /** One line for the screen. Always states the numbers, never just "ok". */
  summary: string;
}

/**
 * Compare a proposed question list against the lock.
 *
 * ⚠️ ORDER IS NOT PART OF IDENTITY. The comparison joins on the question text, so a reordered set
 * is still a like-for-like measurement; flagging it would train the operator to ignore the
 * warning. Duplicates within a side collapse, exactly as the audit queue's own dedupe does.
 */
export function diffAgainstLock(lock: MeasurementLock | null, proposed: readonly string[]): LockDiff {
  const prop = new Map<string, string>();
  for (const q of proposed) {
    const t = (q ?? '').trim();
    if (t && !prop.has(key(t))) prop.set(key(t), t);
  }
  if (!lock) {
    return {
      matched: [], missing: [], added: [...prop.values()], identical: false,
      summary: 'No locked baseline for this business yet, so there is nothing to compare these questions against.',
    };
  }
  const locked = new Map<string, string>();
  for (const q of lock.questions) {
    const t = (q ?? '').trim();
    if (t && !locked.has(key(t))) locked.set(key(t), t);
  }
  const matched: string[] = [];
  const missing: string[] = [];
  for (const [k, original] of locked) (prop.has(k) ? matched : missing).push(original);
  const added: string[] = [];
  for (const [k, original] of prop) if (!locked.has(k)) added.push(original);

  const identical = missing.length === 0 && added.length === 0;
  const summary = identical
    ? `All ${matched.length} locked question${matched.length === 1 ? '' : 's'} — a true like-for-like re-measure.`
    : `${matched.length} of ${locked.size} locked question${locked.size === 1 ? '' : 's'} match`
      + (missing.length ? `, ${missing.length} dropped` : '')
      + (added.length ? `, ${added.length} new` : '')
      + '. Dropped questions lose their before side; new ones have none.';
  return { matched, missing, added, identical, summary };
}

/**
 * Build a lock from the runs of one measurement.
 *
 * ⛔ THE QUESTIONS COME FROM THE QUEUE ROWS THAT ACTUALLY RAN, never from a generator or from what
 * someone believes was asked. `runs` likewise counts the distinct runs it was measured over, so a
 * re-measure can be held to the same repeat count and not just the same wording.
 * ⚠️ Returns null on an empty set rather than an empty lock: a lock with no questions would
 * silently make every future diff read "0 of 0 match", i.e. always identical.
 */
export function lockFromRows(
  rows: ReadonlyArray<{ run_id: string | null; question: string | null }>,
  opts: { sourceAuditId: string; measuredAt: string | null; note?: string; now?: string },
): MeasurementLock | null {
  const seen = new Set<string>();
  const questions: string[] = [];
  const runIds = new Set<string>();
  for (const r of rows) {
    const q = (r.question ?? '').trim();
    if (r.run_id) runIds.add(r.run_id);
    if (!q) continue;
    const k = key(q);
    if (seen.has(k)) continue;
    seen.add(k);
    questions.push(q); // first occurrence's ORIGINAL text survives, misspellings included
  }
  if (questions.length === 0) return null;
  return {
    version: 1,
    questions,
    runs: runIds.size || 1,
    sourceAuditId: opts.sourceAuditId,
    measuredAt: opts.measuredAt,
    lockedAt: opts.now ?? new Date().toISOString(),
    ...(opts.note ? { note: opts.note } : {}),
  };
}

/**
 * Is a stored value a usable lock?
 *
 * ⛔ VALIDATED, NOT CAST. The column is jsonb, so anything could be in it — an older shape, a
 * half-written row, `{}`. A malformed lock must read as NO LOCK (the diff then says there is
 * nothing to compare against) rather than as an empty one that calls every proposal identical.
 */
export function isUsableLock(v: unknown): v is MeasurementLock {
  if (!v || typeof v !== 'object') return false;
  const l = v as Partial<MeasurementLock>;
  return l.version === 1
    && Array.isArray(l.questions)
    && l.questions.length > 0
    && l.questions.every((q) => typeof q === 'string' && q.trim().length > 0)
    && typeof l.sourceAuditId === 'string'
    && l.sourceAuditId.length > 0
    && typeof l.runs === 'number'
    && l.runs >= 1;
}

/** "12 questions × 3 runs, locked 8 Sep from the 11 Aug measurement" — the line on screen. */
export function describeLock(lock: MeasurementLock): string {
  const when = (lock.measuredAt ?? '').slice(0, 10);
  return `${lock.questions.length} question${lock.questions.length === 1 ? '' : 's'} × ${lock.runs} run${lock.runs === 1 ? '' : 's'}`
    + (when ? `, measured ${when}` : '')
    + `, locked ${lock.lockedAt.slice(0, 10)}`;
}
