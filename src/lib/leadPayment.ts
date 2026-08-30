/* ══ WHAT MAKES A LEAD A PAYING CUSTOMER, AND HOW A PAYMENT AMOUNT IS PARSED ══════════════════
   ⛔ `paid` MEANS `amount_paid > 0`, EVERYWHERE (CLAUDE.md §6). NOT `status === 'payment_received'`.
   The two diverge on purpose: a customer moved to `in_delivery` is still paid, and an operator can
   drag a £0 lead to `payment_received` without any money having arrived. Deriving "paid" from the
   status is wrong in both directions, and the page whose entire job was showing revenue got it
   wrong that way once already.

   ⛔ AND A CLEARED FIELD MUST WRITE null, NEVER 0. This is the absent-value shape (CLAUDE.md §6)
   pointed straight at the one column that decides whether someone is a customer: an empty box means
   "the operator did not say", and writing 0 for it would silently UN-PAY a real customer — they
   would drop out of the Paid filter, out of the paid-exempt Inbox rule, and out of every revenue
   figure, with nothing thrown and nothing logged. `0` typed deliberately is a different statement
   and is kept as 0. */

/**
 * Parse a payment-amount text input into what should be written to `outreach_leads.amount_paid`.
 *
 * - empty / whitespace-only        → null  ("not said" — never 0)
 * - unparseable ("abc", "£", "-")  → null  (same reason: we did not learn an amount)
 * - "0"                            → 0     (an explicit statement, kept)
 * - "19.99", " 19.99 ", "£19.99"   → 19.99
 */
export function parseAmountPaid(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/^£/, '').trim();
  if (trimmed === '') return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** The status that means the money went back. Exported so nothing has to re-type the string. */
export const REFUNDED_STATUS = 'refunded';

/**
 * The one test for "is this a paying customer". Tolerates a missing/undefined column.
 *
 * ⛔ REFUNDED IS THE ONE STATUS THAT CAN OVERRIDE THE AMOUNT, AND IT IS STILL NOT "paid FROM the
 * status". The rule stays `amount_paid > 0` — the status can only ever SUBTRACT, never add, so an
 * operator dragging a £0 lead to `payment_received` still counts as nothing. Before this, a
 * refunded customer kept `amount_paid > 0` and went on inflating the paid count, the funnel and
 * every revenue total, because nothing here could see the refund.
 *
 * ⚠️ `amount_paid` IS DELIBERATELY LEFT ON THE ROW. It is the record of what was charged; zeroing
 * it would destroy that history and make a refund indistinguishable from a lead that never paid.
 * Refunded means "we still hold the amount, it just stops counting".
 *
 * ⚠️ A CALLER THAT DOES NOT SELECT `status` GETS THE OLD BEHAVIOUR — undefined is not 'refunded',
 * so the lead still counts as paid. That is the safe direction (a refund is rare and visible; a
 * silently un-paid customer is not), but it means every money caller must select the column.
 * All five do; scripts/lead-payment.test.ts pins the absent-status case so a new caller that
 * forgets is a known, tested behaviour rather than a surprise.
 */
export function isPaidLead(
  lead: { amount_paid?: number | null; status?: string | null } | null | undefined,
): boolean {
  if ((lead?.amount_paid ?? 0) <= 0) return false;
  return lead?.status !== REFUNDED_STATUS;
}
