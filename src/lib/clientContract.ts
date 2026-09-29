/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT A PAID CLIENT BOUGHT (Paul, 2026-09-29) — Findable Build (12 payments) or Findable Optimise (6).
   The admin's one summary: route, payment count, payments made / remaining, next payment date, and
   whether we are building a site or optimising theirs. Derived on every read, never stored.
   ⛔ THE TERM COMES ONLY FROM THE STAMPED CONTRACT (outreach_leads.contract_total_payments, written by
   stripe-webhook from the Stripe page the client paid on). A client who paid before routes existed has
   none, and is shown as NOT RECORDED for Paul to confirm — never given a 12 or a 6 because of what their
   website looks like. What the WORK is (build vs optimise) is a separate fact, from the onboarding row.
   Pure, relative imports with .ts: read by fn paid-client-hub and the SPA.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { SERVICE_ROUTE_NAME, findableSiteKind, serviceRouteForTotal, type ServiceRoute } from './findableOffer.ts';

export interface ContractLedgerRow { kind: string; status: string; amount_gbp: number | string }
export interface ClientContractInput {
  lead: {
    contract_total_payments?: number | null;
    amount_paid?: number | string | null;
    stripe_subscription_id?: string | null;
    subscription_status?: string | null;
    subscription_renews_at?: string | null;
  };
  onboarding?: { plan_tier?: unknown; website_route?: unknown } | null;
  ledger?: ContractLedgerRow[];
}
export interface ClientContract {
  /** From the stamped contract only; null = not recorded. */
  route: ServiceRoute | null;
  /** "Findable Build" / "Findable Optimise", or null. */
  name: string | null;
  totalPayments: number | null;
  paymentsMade: number;
  paymentsRemaining: number | null;
  /** The next charge Stripe will make (ISO), when a live subscription has one still to come. */
  nextPaymentAt: string | null;
  /** The work: we build a site / we optimise theirs / not known. */
  work: 'building' | 'optimising' | 'unknown';
  /** Plain words for Paul when something needs his decision (a historical client, no schedule). */
  note: string | null;
}

const LIVE = new Set(['trialing', 'active', 'past_due']);

export function clientContract(i: ClientContractInput): ClientContract {
  const route = serviceRouteForTotal(i.lead.contract_total_payments);
  const totalPayments = route ? Number(i.lead.contract_total_payments) : null;
  const ledgerPayments = (i.ledger ?? []).filter((r) => (r.kind === 'initial' || r.kind === 'recurring') && r.status === 'succeeded' && Number(r.amount_gbp) > 0).length;
  // A client who paid before the ledger existed still paid their sign-up (the lead records the amount).
  const paymentsMade = Math.max(ledgerPayments, Number(i.lead.amount_paid ?? 0) > 0 ? 1 : 0);
  const paymentsRemaining = totalPayments === null ? null : Math.max(0, totalPayments - paymentsMade);
  const live = !!(i.lead.stripe_subscription_id ?? '').trim() && LIVE.has(String(i.lead.subscription_status ?? ''));
  const nextPaymentAt = live && (paymentsRemaining === null || paymentsRemaining > 0) && i.lead.subscription_renews_at ? i.lead.subscription_renews_at : null;
  const kind = findableSiteKind(i.onboarding ?? null);
  const work = kind === 'findable_built' ? 'building' : kind === 'client_owned' ? 'optimising' : 'unknown';
  let note: string | null = null;
  if (!route) note = 'Payment term not recorded (paid before Build / Optimise existed) — Paul to confirm what was agreed.';
  else if (!live && paymentsRemaining !== null && paymentsRemaining > 0) note = 'No live monthly schedule in Stripe — check it was created.';
  return { route, name: route ? SERVICE_ROUTE_NAME[route] : null, totalPayments, paymentsMade, paymentsRemaining, nextPaymentAt, work, note };
}

export const WORK_LABEL: Record<ClientContract['work'], string> = {
  building: 'Findable is building their website',
  optimising: 'Optimising their existing website',
  unknown: 'Website work not recorded',
};
