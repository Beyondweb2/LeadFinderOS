/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT THE LEAD WORKSPACE HEADER SHOWS — ONE RULE (declutter pass, 2026-10-01).
   Paul: "Meeting booked shown as a large pill at the top, then the exact same meeting again in Next
   Action immediately below." The header keeps three concepts apart and draws each fact ONCE:
     STATUS       — the one solid pipeline pill (pillStatusOf), plus the sales-state pill ONLY when it
                    says something the pill, the star and the chips below do not;
     NEXT ACTION  — the bar under it (the one stored next action, nextActionView);
     CONTACT      — the last contact line, quiet.
   Pure: display decisions only. Nothing here reads or writes the database, and no state is stored —
   the meeting is still call_booked_at, Meeting booked is still salesStateOf, History and the filters
   are untouched.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { SalesStateView } from './leadState.ts';
import { hhmmOf, meetingDayTime } from './nextActionView.ts';

type NextActionFacts = { next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null; call_booked_at?: string | null };

/** Is the booked meeting the SAME thing as the stored Next Action — a "Meeting" at the meeting's own UK day
 *  AND time? Then the Next Action bar shows it (with its time) and the header draws no second pill.
 *  ⛔ 2026-10-02: the time must match too. A Meeting whose time was removed (or differs) does not show the
 *  booked time, so the header keeps "Meeting booked · 15:15" rather than hiding the booking. */
export function meetingIsTheNextAction(l: NextActionFacts | null | undefined): boolean {
  if (!l || (l.next_action ?? '').trim() !== 'meeting' || !l.call_booked_at) return false;
  if (!Number.isFinite(Date.parse(l.call_booked_at))) return false;
  const day = (l.next_action_date ?? '').slice(0, 10);
  const booked = meetingDayTime(l.call_booked_at);
  return !!day && booked.day === day && hhmmOf(l.next_action_time) === booked.time;
}

/** The status pill words that already say "client". */
const CLIENT_STATUS_LABELS: ReadonlySet<string> = new Set(['paid', 'in delivery', 'completed', 'refunded']);

/** Does the header draw the sales-state pill beside the status pill? ⛔ ENUMERATED, never by exclusion:
 *  only the states named here can add a pill, and each says when.
 *    new / contacted / replied — the status pill already says it (pillStatusOf reads "Contacted");
 *    interested               — the gold star says it (Interested is never a pill, Paul 2026-10-01);
 *    wrong_number             — its own chip says it, with the admin's Clear;
 *    other                    — the raw status, which the status pill already shows;
 *    meeting_booked           — shown unless the meeting IS the Next Action (the bar shows it);
 *    won / not_interested     — shown unless the status pill already reads the same words;
 *    client                   — unless the status pill already reads as a client (Paid, In Delivery,
 *                               Completed, Refunded): money in outranks a pipeline that still says Replied. */
export function headerStateShown(view: SalesStateView | null | undefined, statusLabel: string, l: NextActionFacts | null | undefined): boolean {
  if (!view) return false;
  const same = statusLabel.trim().toLowerCase().startsWith(view.label.trim().toLowerCase());
  switch (view.state) {
    case 'meeting_booked': return !meetingIsTheNextAction(l);
    case 'won': return !same;
    case 'not_interested': return !same;
    case 'client': return !CLIENT_STATUS_LABELS.has(statusLabel.trim().toLowerCase());
    case 'new': case 'contacted': case 'replied': case 'interested': case 'wrong_number': case 'other': return false;
  }
  return false;
}

/** A meeting's note is saved as "Meeting at 08:30 · bring the audit" (meetingNote). Under a bar that
 *  already shows "· 08:30", only the person's own words are left; with no words of their own, nothing. */
export function noteBesideTime(note: string | null | undefined, time: string | null | undefined): string | null {
  const n = (note ?? '').trim();
  if (!n) return null;
  if (!time) return n;
  const own = n.replace(new RegExp(`^Meeting at ${time}(\\s*·\\s*)?`), '').trim();
  return own || null;
}

/** Statuses at which taking the money is the next thing: a price given, the deal agreed, or delivery
 *  already running while no payment is recorded. Here Mark Paid is the footer's main button; anywhere
 *  else it is a small secondary one. ⛔ Display only — what "paid" means is still isPaidLead
 *  (amount_paid > 0), and Mark Paid still writes exactly what it wrote before. */
export const PAYMENT_STAGE_STATUSES: ReadonlySet<string> = new Set(['price_given', 'won_pending_onboarding', 'payment_received', 'in_delivery', 'completed']);
export function markPaidIsMain(status: string | null | undefined, view: SalesStateView | null | undefined): boolean {
  return PAYMENT_STAGE_STATUSES.has((status ?? '').trim()) || view?.state === 'won';
}
