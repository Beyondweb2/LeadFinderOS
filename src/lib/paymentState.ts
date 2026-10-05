/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAYMENT STATE IS MONOTONIC — the one rule for what a payment event may do to a client's record
   (pre-sales certification fix 03, 2026-10-04; M-016 / M-017 / E-02 / E-03 / E-17).

   🔴 WHY THIS EXISTS. stripe-webhook wrote status = payment_received, amount_paid, payment_date and
   paid_for UNCONDITIONALLY on every delivery of checkout.session.completed. Stripe re-delivers that
   event for up to three days when our endpoint is slow, and Paul can resend it from the dashboard, so a
   late copy moved clients BACKWARDS — proved live on 4 Oct: in_delivery → payment_received, a REFUNDED
   client back to payment_received (back into revenue), an ended client's label back to "payment
   received", and payment_date rewritten to the replay day. The money rows were already exactly-once;
   the STATE was not.

   ⛔ THE FIRST GENUINE PAYMENT ESTABLISHES THE STATE; NOTHING LATER MOVES IT. A lead is "unpaid" only
   when it carries no money (amount_paid null or ≤ 0), is not refunded and has not ended. Only then may a
   payment event write status / amount / date / label. Every other delivery is a REPLAY: it may fill a
   Stripe id that is still blank, and nothing else. A refunded client stays refunded, an ended client
   stays ended, a delivered client stays where it is, and the original payment date is never rewritten.
   ⛔ THE DATABASE DECIDES, NOT A READ. The webhook writes the first-payment patch with these same
   conditions as filters on the UPDATE (FIRST_PAYMENT_FILTERS), so two concurrent deliveries cannot both
   win, and a row that changed between a read and the write is not overwritten.
   ⛔ A CLOSED CLIENT IS NEVER SUBSCRIBED OR REACTIVATED. Ended (service_terminated_at) or refunded:
   no monthly subscription is created for them, and a late invoice / subscription event never writes
   `active` / `trialing` back onto them (the money is still recorded in the ledger — it is a fact — and
   Paul is told, because only he can cancel or refund in Stripe).
   Pure, no imports. ⚠️ Edge-reachable (stripe-webhook, _shared/delayed-subscription.ts).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The onboarding statuses that already mean "this submission was paid for". A replay never moves a
 *  row that is already in one of these (onboarding statuses read live 2026-10-04: paid / submitted /
 *  answers_saved; the other three are the lead's words, kept here so a row ever moved on is never
 *  moved back). */
export const ONBOARDING_PAID_STATUSES = ['paid', 'payment_received', 'in_delivery', 'completed', 'refunded'] as const;

export interface PaymentStateLead {
  amount_paid?: number | string | null;
  status?: string | null;
  service_terminated_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_payment_intent_id?: string | null;
}

export type ClosedReason = 'ended' | 'refunded';

/** Is this client's engagement over? Ended (the one terminal mark, serviceEnd.ts) or fully refunded.
 *  POSITIVE: only those two facts close a client; anything else is open. */
export function clientClosed(lead: PaymentStateLead | null | undefined): ClosedReason | null {
  if (!lead) return null;
  if (typeof lead.service_terminated_at === 'string' && lead.service_terminated_at.trim()) return 'ended';
  if (lead.status === 'refunded') return 'refunded';
  return null;
}

/** Does the lead already carry a payment? (isPaidLead's money half: amount_paid > 0.) */
export function carriesMoney(lead: PaymentStateLead | null | undefined): boolean {
  const n = Number(lead?.amount_paid ?? 0);
  return Number.isFinite(n) && n > 0;
}

/** May a payment event establish the paid state on this lead? Only on a lead with no money that is
 *  neither refunded nor ended. ⛔ An unreadable lead (null) is NOT eligible: the conditional UPDATE is
 *  what decides, and a lead we could not read is never assumed blank. */
export function mayEstablishPayment(lead: PaymentStateLead | null | undefined): boolean {
  if (!lead) return false;
  return !carriesMoney(lead) && clientClosed(lead) === null;
}

/** The PostgREST filters the webhook puts ON THE UPDATE, so the database applies the same rule as
 *  mayEstablishPayment atomically. ⛔ `.neq` drops NULLs (CLAUDE.md §4), hence the or() forms.
 *  Two or() filters on one request are ANDed by PostgREST. */
export const FIRST_PAYMENT_FILTERS = {
  amountUnpaid: 'amount_paid.is.null,amount_paid.lte.0',
  notRefunded: 'status.is.null,status.neq.refunded',
  /** applied with .is('service_terminated_at', null) */
  notEnded: 'service_terminated_at',
} as const;

/** The onboarding UPDATE's filter: move a row to `paid` only when it is not already in a paid-family
 *  status (or has none). */
export const ONBOARDING_NOT_PAID_FILTER = `status.is.null,status.not.in.(${ONBOARDING_PAID_STATUSES.join(',')})`;

export interface PaymentFacts {
  amountGbp: number;
  /** YYYY-MM-DD — outreach_leads.payment_date is a DATE column (read live 2026-10-04). */
  paymentDay: string;
  paidFor: string;
  stripeCustomerId: string | null;
  stripePaymentIntentId: string | null;
}

/** The patch the FIRST payment writes (and only the first). */
export function firstPaymentPatch(p: PaymentFacts): Record<string, unknown> {
  return { status: 'payment_received', amount_paid: p.amountGbp, payment_date: p.paymentDay, paid_for: p.paidFor };
}

/** The Stripe ids a delivery may write: only into a column that is still blank. The payment intent is
 *  what a later refund resolves by, so it must stay the FIRST payment's — never the last delivery's. */
export function stripeIdFillPatch(lead: PaymentStateLead | null | undefined, p: Pick<PaymentFacts, 'stripeCustomerId' | 'stripePaymentIntentId'>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const blank = (v: unknown) => !(typeof v === 'string' && v.trim());
  if (p.stripeCustomerId && blank(lead?.stripe_customer_id)) out.stripe_customer_id = p.stripeCustomerId;
  if (p.stripePaymentIntentId && blank(lead?.stripe_payment_intent_id)) out.stripe_payment_intent_id = p.stripePaymentIntentId;
  return out;
}

/** The day a payment is recorded against (YYYY-MM-DD, UTC — the same day the old write produced when
 *  Postgres cast its ISO timestamp into the DATE column), taken from the EVENT's own time so every
 *  re-delivery of one event names the same day. */
export function paymentDayOf(epochSeconds: number | null | undefined, nowMs = Date.now()): string {
  const ms = typeof epochSeconds === 'number' && Number.isFinite(epochSeconds) && epochSeconds > 0 ? epochSeconds * 1000 : nowMs;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Subscription statuses that would make a client read as "paying". A closed client never has one of
 *  these written onto it by a late webhook. */
export const LIVE_SUBSCRIPTION_WRITES: ReadonlySet<string> = new Set(['active', 'trialing']);

/** May a subscription event write this status onto the lead? A closed client never gets a live status
 *  back; stopping statuses (canceled, past_due, unpaid…) are always recorded — they only ever say less. */
export function maySetSubscriptionStatus(lead: PaymentStateLead | null | undefined, status: string | null | undefined): boolean {
  if (!status) return false;
  if (clientClosed(lead) === null) return true;
  return !LIVE_SUBSCRIPTION_WRITES.has(status);
}

/** Why no monthly subscription may be created for this lead, or null when one may. */
export function subscriptionRefusal(lead: PaymentStateLead | null | undefined): string | null {
  const closed = clientClosed(lead);
  if (closed === 'ended') return 'the client’s service has ended, so no monthly payments are taken';
  if (closed === 'refunded') return 'the client was refunded, so no monthly payments are taken';
  return null;
}
