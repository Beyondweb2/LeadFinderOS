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

/** The one test for "is this a paying customer". Tolerates a missing/undefined column. */
export function isPaidLead(lead: { amount_paid?: number | null } | null | undefined): boolean {
  return (lead?.amount_paid ?? 0) > 0;
}
