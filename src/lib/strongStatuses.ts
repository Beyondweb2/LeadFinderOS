/* THE STATUSES NO AUTOMATIC WRITE MAY OVERWRITE (lead state audit, 2026-09-30).
 *
 * An inbound reply writes 'replied'; a report send writes 'report_sent'. Both are forward-only: they
 * must never wipe a deal. Three hand-kept copies of this list (the inbound handler, the Inbox sender,
 * the queue's auto-pitch) had drifted to the same five values and all three missed two:
 *   · won_pending_onboarding — a reply moved a lead the rep had WON back to "Replied";
 *   · refunded — a reply moved a refunded client to "Replied", and with amount_paid still on the row
 *     isPaidLead then counted it as PAYING again.
 * ⛔ ONE LIST, imported by all three (scripts/lead-state.test.ts: "is there only one of it").
 * ⛔ A person's own status change is NOT bound by this — the admin can move a lead anywhere.
 * Pure, no imports: edge functions reach it as ../../../src/lib/strongStatuses.ts. */

/** A deal or a client: interested, quoted, won, paid, delivering, done, refunded. */
export const STRONG_STATUSES: readonly string[] = [
  'interested', 'price_given', 'won_pending_onboarding', 'payment_received', 'in_delivery', 'completed', 'refunded',
];

/** An inbound reply leaves these alone: the strong ones, and 'replied' itself (no thrash).
 *  not_interested / report_sent are deliberately NOT here — a reply means they re-engaged. */
export const INBOUND_NO_DOWNGRADE: readonly string[] = [...STRONG_STATUSES, 'replied'];

/** A PostgREST `not.in` list: "(a,b,c)". */
export function postgrestList(values: readonly string[]): string {
  return `(${values.join(',')})`;
}
