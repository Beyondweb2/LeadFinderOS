/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ONE-TIME FILL OF remeasure_due_date — the ONLY place +REMEASURE_OFFSET_DAYS lives.

   ⛔ WHERE remeasure_due_date IS NULL, AND NOWHERE ELSE. This runs once, when a baseline freezes
   (onBaselineFrozen in audit-baseline.ts). It must never touch a stored date: RG Locksmiths' is
   2026-10-06 by hand (+56, the legacy 8-week promise) and Ronnie's is 2026-10-13. The value is
   computed here; the WRITE is conditional in the database (`.is('remeasure_due_date', null)`), and
   scripts/remeasure-schedule.test.ts asserts both halves — that this function returns null for a
   set date and that the update in audit-baseline carries the NULL guard.

   ⛔ THE QUEUE TICK NEVER CALLS THIS. remeasureDue.ts (what the tick reads) has no date arithmetic
   at all, by test. Keeping the +28 out of the tick is what makes "the stored date wins" impossible
   to regress rather than merely intended.

   IMPORTED BY AN EDGE FUNCTION: relative imports with an explicit .ts extension only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { defaultRemeasureDue } from './deliveryCockpit.ts';

/**
 * The date to write into `remeasure_due_date`, or null when there is one already (never overwrite).
 *
 * @param existing   the lead's current remeasure_due_date, exactly as read
 * @param frozenAt   the baseline's completion instant (baseline_completed_at), ISO
 */
export function remeasureDueFill(existing: string | null | undefined, frozenAt: string): string | null {
  if ((existing ?? '').trim()) return null;
  if (!frozenAt || Number.isNaN(new Date(frozenAt).getTime())) return null;
  return defaultRemeasureDue(frozenAt);
}

/** Which of the four delivery milestones (everything except the re-measure tick itself) are
 *  unticked. Fire-and-stamp (Paul, 2026-09-12): an unfinished delivery does not delay the replay
 *  — the promise is calendar-based — it is RECORDED on the replay so the number tells the truth
 *  about our own delivery. */
export const WORK_MILESTONES = ['directories', 'pages', 'gbp', 'website'] as const;

export function workIncompleteFor(checklist: Record<string, boolean> | null | undefined): { incomplete: boolean; missing: string[] } {
  const missing = WORK_MILESTONES.filter((k) => checklist?.[k] !== true);
  return { incomplete: missing.length > 0, missing: [...missing] };
}
