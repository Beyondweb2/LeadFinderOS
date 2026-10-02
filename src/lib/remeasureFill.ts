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
import { defaultRemeasureDue, remeasureOffsetDays } from './deliveryCockpit.ts';

/**
 * The date to write into `remeasure_due_date`, or null when there is one already (never overwrite).
 *
 * @param existing   the lead's current remeasure_due_date, exactly as read
 * @param frozenAt   the baseline's completion instant (baseline_completed_at), ISO
 * @param weeks      the client's re-measure clock (remeasureWeeksFor: 4, or 8 for a site we build on
 *                   a brand-new domain) — REQUIRED, so no caller can silently fall back to four
 */
export function remeasureDueFill(existing: string | null | undefined, frozenAt: string, weeks: number): string | null {
  if ((existing ?? '').trim()) return null;
  if (!frozenAt || Number.isNaN(new Date(frozenAt).getTime())) return null;
  if (!Number.isInteger(weeks) || weeks <= 0) return null;
  return defaultRemeasureDue(frozenAt, remeasureOffsetDays(weeks));
}

/* 🔴 THE CLIENT'S OWN CLOCK, FROM THEIR STORED DATE (Paul, 2026-10-02). Every word that says how long
   the re-measure took — the results email, the results document, the Welcome Pack — reads THIS, so a
   pinned client (RG 6 Oct and Ronnie 13 Oct, both 56 days after their baseline day) is told "eight
   weeks", never the standard four. Whole weeks between the baseline's UTC day and the stored due
   date; anything that is not a positive whole number of weeks (or a missing date) returns null and
   the caller uses the standard clock. ⛔ Reads the stored date only; it never writes or derives one. */
export function storedRemeasureWeeks(dueDate: string | null | undefined, baselineCompletedAt: string | null | undefined): number | null {
  const due = String(dueDate ?? '').trim().slice(0, 10);
  const start = String(baselineCompletedAt ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const days = Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0 || days % 7 !== 0) return null;
  return days / 7;
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
