/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS CLIENT'S DAY-28 REPLAY DUE? — the predicate the queue tick fires on.

   ⛔ THIS FILE CONTAINS NO DATE ARITHMETIC, AND A TEST ASSERTS IT NEVER WILL. It reads
   `remeasure_due_date` and compares it to today. It does not know what REMEASURE_OFFSET_DAYS is,
   it cannot import addDaysISO, and it has no "+ 28" anywhere. That is Paul's rule made structural
   (2026-09-12): RG Locksmiths' stored date is 2026-10-06 and his computed default would have been
   2026-09-08 — a tick that computed instead of read would have fired his controlled experiment four
   weeks early and destroyed it. The only +28 in the system is the one-time fill at baseline
   finalisation (remeasureFill.ts), WHERE remeasure_due_date IS NULL, and it never runs here.

   ⛔ EVERY GATE IS A POSITIVE TEST, AND ABSENCE REFUSES. No pointer → not due. No date → not due
   (never "compute one"). Already replayed → not due. Refunded → not due — SC Plumbing is refunded
   with a NULL date, and this gate is what stops a refunded client getting a measurement he did not
   pay for, on its own, with nothing else in the way. Archived → not due. Nothing paid → not due.

   ⛔ THE POINTER, NOT THE PREDICATE, IS THE IDEMPOTENCY. The tick runs every 30 seconds; this says
   "fire", the trigger on ai_audits claims outreach_leads.remeasure_audit_id in the audit's own
   transaction, and the partial unique index refuses a second `remeasure` audit for the lead at the
   database. So even if two ticks both read `remeasure_audit_id IS NULL`, only one replay can exist.

   IMPORTED BY AN EDGE FUNCTION: relative imports with an explicit .ts extension only; this file has
   none, deliberately.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The columns the decision reads — and only these. */
export interface RemeasureCandidate {
  baseline_audit_id?: string | null;
  remeasure_audit_id?: string | null;
  /** YYYY-MM-DD. Read, never computed. */
  remeasure_due_date?: string | null;
  status?: string | null;
  is_archived?: boolean | null;
  amount_paid?: number | null;
}

export type NotDueReason =
  | 'no_baseline_pointer'
  | 'already_replayed'
  | 'no_due_date'
  | 'not_yet_due'
  | 'refunded'
  | 'archived'
  | 'not_paid';

export type RemeasureDueVerdict =
  | { due: true }
  | { due: false; reason: NotDueReason };

/** The one status that stops the replay. A hosting cancellation is NOT this: the £99 guarantee is
 *  calendar-based and stands whether or not the £9.99/month is still running. */
export const REMEASURE_STOP_STATUS = 'refunded';

/** Today as YYYY-MM-DD in UTC. Passed in by the caller so the test is deterministic. */
export function utcDateISO(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Decide whether the replay should fire for this lead today.
 *
 * Order of the gates is the order of the reasons a human wants to hear first: is there anything to
 * replay, has it been done, is a date even set, is it reached, and only then the money questions.
 * Every gate is a positive test; an absent value can only ever land on the "not due" side.
 */
export function isRemeasureDue(lead: RemeasureCandidate | null | undefined, todayISO: string): RemeasureDueVerdict {
  if (!lead) return { due: false, reason: 'no_baseline_pointer' };
  const pointer = (lead.baseline_audit_id ?? '').trim();
  if (!pointer) return { due: false, reason: 'no_baseline_pointer' };
  if ((lead.remeasure_audit_id ?? '').trim()) return { due: false, reason: 'already_replayed' };
  /* ⛔ Refunded and archived are tested BEFORE the date, so a refunded client with a past date is
     refused as refunded — the load-bearing reason — not as some other thing. */
  if (lead.status === REMEASURE_STOP_STATUS) return { due: false, reason: 'refunded' };
  if (lead.is_archived === true) return { due: false, reason: 'archived' };
  if (!(Number(lead.amount_paid ?? 0) > 0)) return { due: false, reason: 'not_paid' };
  const due = (lead.remeasure_due_date ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return { due: false, reason: 'no_due_date' };
  const today = (todayISO ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { due: false, reason: 'not_yet_due' };
  /* ISO dates compare correctly as strings. No Date object, no arithmetic. */
  if (due > today) return { due: false, reason: 'not_yet_due' };
  return { due: true };
}
