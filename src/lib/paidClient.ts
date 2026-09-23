/* ══ WHO BELONGS ON THE PAID CLIENTS LIST (the fulfilment list, NOT the revenue count) ══════════
   ⛔ THIS IS NOT isPaidLead. Revenue stays `amount_paid > 0` (src/lib/leadPayment.ts, CLAUDE.md §6)
   and nothing here changes a single money figure. This answers a different question: "is this a
   customer Paul is delivering for". Paul moving a lead to Paid by hand is sufficient for THAT — a
   client can pay outside Stripe, and the build must not wait on an amount being typed.

   Two routes in, kept distinguishable (`paidClientSource`):
   - 'recorded'    — an amount is on the row (Stripe checkout, or the manual-add dialog).
   - 'marked_paid' — the operator set a paid status and no amount has been recorded. Nothing is
                     invented for it: no amount, no payment date, no Stripe id.

   ⚠️ The status route is a POSITIVE list. An absent or unknown status never qualifies. `refunded`
   is deliberately not in it (a refunded row with an amount keeps the membership it always had via
   the amount — unchanged behaviour — but a refunded row with no amount never enters). */

import { REFUNDED_STATUS } from './leadPayment.ts';

/** Statuses that mean "Paul has marked this customer as paid / being delivered". */
export const PAID_CLIENT_STATUSES = ['payment_received', 'in_delivery', 'completed'] as const;

type PaidClientRow = { amount_paid?: number | string | null; status?: string | null } | null | undefined;

function hasRecordedAmount(lead: PaidClientRow): boolean {
  const n = Number(lead?.amount_paid ?? 0);
  return Number.isFinite(n) && n > 0;
}

/** The one test for membership of the Paid Clients list. */
export function isPaidClient(lead: PaidClientRow): boolean {
  if (hasRecordedAmount(lead)) return true;
  const status = lead?.status;
  if (!status || status === REFUNDED_STATUS) return false;
  return (PAID_CLIENT_STATUSES as readonly string[]).includes(status);
}

/** How the client got onto the list, or null if they are not on it. */
export function paidClientSource(lead: PaidClientRow): 'recorded' | 'marked_paid' | null {
  if (!isPaidClient(lead)) return null;
  return hasRecordedAmount(lead) ? 'recorded' : 'marked_paid';
}

/** The PostgREST `.or()` filter that pre-selects candidates; isPaidClient is still applied after. */
export const PAID_CLIENT_OR_FILTER = `amount_paid.gt.0,status.in.(${PAID_CLIENT_STATUSES.join(',')})`;
