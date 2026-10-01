/* ══ WHY THEY SAID NO (2026-10-01) ════════════════════════════════════════════════════════════════
   When a lead is marked Not interested the person who marked it may record WHY, from one short list,
   so the Admin dashboard can show what keeps losing prospects (price, an existing provider, value,
   timing, scepticism). One structured reason per lead (outreach_leads.lost_reason + note, who, when);
   every save or correction is also a History row (lead_activity 'lost_reason_set', old and new).

   ⛔ THIS IS THE ONE LIST. The SQL twin is the CHECK constraint and lead_set_lost_reason in
   supabase/migrations/20261002200000_lost_reason.sql; scripts/lost-reason.test.ts fails if they differ.
   ⛔ Never inferred: a lead that said no before this existed, or whose reason was skipped, reads
   "Reason not recorded" (nothing is backfilled from notes or messages).
   A leaf: no imports, so the edge closure (admin-overview → adminMetrics) can reach it. */

export const LOST_REASONS = [
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'has_provider', label: 'Already has someone' },
  { value: 'no_value', label: "Doesn't see the value" },
  { value: 'bad_timing', label: 'Bad timing / not right now' },
  { value: 'not_into_ai', label: 'Not interested in AI / AI visibility' },
  { value: 'no_more_work', label: "Doesn't need more work" },
  { value: 'sceptical', label: "Doesn't trust it / sceptical" },
  { value: 'thinking', label: 'Wants to think about it' },
  { value: 'other', label: 'Other' },
] as const;

export type LostReason = typeof LOST_REASONS[number]['value'];

/** The longest note kept (the SQL function refuses longer). */
export const LOST_REASON_NOTE_MAX = 300;

/** What the dashboard and History call a lead with no recorded reason. */
export const LOST_REASON_UNRECORDED = 'Reason not recorded';

export function isLostReason(v: unknown): v is LostReason {
  return typeof v === 'string' && LOST_REASONS.some((r) => r.value === v);
}

/** The words for a stored reason; an unknown stored value shows itself rather than a wrong label. */
export function lostReasonLabel(v: string | null | undefined): string {
  if (!v) return LOST_REASON_UNRECORDED;
  return LOST_REASONS.find((r) => r.value === v)?.label ?? v;
}

/** Why a pick cannot be saved yet, or null. Only Other needs a note; every note is optional otherwise. */
export function lostReasonProblem(reason: string | null | undefined, note: string | null | undefined): string | null {
  if (!isLostReason(reason)) return 'Pick a reason';
  const n = (note ?? '').trim();
  if (reason === 'other' && !n) return 'Say briefly why (needed for Other)';
  if (n.length > LOST_REASON_NOTE_MAX) return `Keep the note under ${LOST_REASON_NOTE_MAX} characters`;
  return null;
}
