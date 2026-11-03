/* ══ THE DAILY STRIPE CHECK: WHAT TO CHANGE (Paul, 2026-11-03, docs/commission-owed.md) ══════════════════════════════════════════
   Stripe's payments, refunds and disputes in, the ledger in, a list of changes out. Fn commission-stripe-check reads both and applies
   the list through the one ledger writer (recordLedger), so a fix here is exactly what the webhook would have written.
   Rules:
   - A row is written only when its lead is known from a Stripe id or Stripe's own metadata. Never from an email, never a guess.
   - A payment Stripe has on hold with us (client_payment_holds) is not a sale yet. It is reported, never written.
   - Money facts on an existing payment row are never overwritten: a different amount is reported.
   - A plan is corrected only on a plan_v1 sale, and only before its commission has been paid.
   - Nothing is ever deleted. A ledger row Stripe does not know is reported.
   Pure. ⚠️ Edge-reachable: relative imports, explicit .ts. */
import { salePlanFlagAtPayment, salePlanFromCharge } from './salePlan.ts';
import { isPaymentPlan, type PaymentPlan } from './paymentPlans.ts';

export const STRIPE_CHECK_WINDOW_DAYS = 60;
/** The screen warns once the last good check is older than this: a daily job has missed a run. */
export const STRIPE_CHECK_STALE_HOURS = 36;
/** What the webhook endpoint must send for commission to update by itself. */
export const REQUIRED_WEBHOOK_EVENTS = ['checkout.session.completed', 'invoice.paid', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed'] as const;

const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.005;
const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? v as Record<string, unknown> : null);
const idOf = (v: unknown): string | null => (typeof v === 'string' && v ? v : (typeof asRecord(v)?.id === 'string' ? asRecord(v)!.id as string : null));

/** Stripe moved these off the invoice in API version 2025-03-31. The webhook takes whatever version its endpoint is set to, so it reads both shapes. */
export function invoiceRefs(inv: unknown): { subscription: string | null; paymentIntent: string | null; charge: string | null } {
  const i = asRecord(inv) ?? {};
  const parent = asRecord(asRecord(i.parent)?.subscription_details);
  const firstPayment = asRecord(asRecord((asRecord(i.payments)?.data as unknown[] | undefined)?.[0])?.payment);
  return {
    subscription: idOf(i.subscription) ?? idOf(parent?.subscription),
    paymentIntent: idOf(i.payment_intent) ?? idOf(firstPayment?.payment_intent),
    charge: idOf(i.charge) ?? idOf(firstPayment?.charge),
  };
}

export interface StripeChargeFact {
  id: string;
  paymentIntent: string | null;
  invoice: string | null;
  customer: string | null;
  amountGbp: number;
  refundedGbp: number;
  /** When the latest refund happened. */
  refundedAt: string | null;
  createdAt: string;
  currency: string;
}
export interface StripeDisputeFact { id: string; charge: string | null; paymentIntent: string | null; status: string; amountGbp: number; createdAt: string; currency: string }

/** Where a charge belongs, worked out by the caller from Stripe ids and metadata. */
export interface ChargePlacement {
  leadId: string | null;
  /** Stripe's own metadata says this is a Findable sale, even if no lead could be named. */
  findable: boolean;
  /** The plan on the checkout session. */
  plan: PaymentPlan | null;
  /** The picked plan, for the flag. */
  picked: string | null;
  /** Held by the webhook: no valid signature (client_payment_holds). */
  held: boolean;
}

export interface LedgerFact {
  id: string;
  kind: string;
  status: string;
  amount_gbp: number;
  lead_id: string | null;
  occurred_at: string;
  stripe_object_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  stripe_customer_id: string | null;
  payout_rule: string | null;
  sale_plan: string | null;
  sale_plan_flag: string | null;
  commission_rule: string | null;
}

export type ReconcileKind = 'initial' | 'recurring' | 'refund' | 'chargeback';
export interface ReconcileWrite {
  lead_id: string | null;
  kind: ReconcileKind;
  status?: string;
  amount_gbp: number;
  currency: string;
  occurred_at: string;
  stripe_object_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  stripe_customer_id: string | null;
  stripe_plan?: string | null;
  note: string;
  /** Why: shown in the check's log. */
  why: string;
}
export interface PlanFix { ledgerId: string; leadId: string | null; from: string | null; to: string; flag: string | null }
export type NeedsYouKind = 'charge_no_lead' | 'held_payment' | 'amount_differs' | 'plan_paid_differs' | 'dispute_no_lead' | 'refund_no_lead' | 'not_in_stripe' | 'webhook_events_missing' | 'webhook_not_found';
export interface NeedsYou { kind: NeedsYouKind; object: string; leadId?: string | null; detail: string }
export interface ReconcilePlan { writes: ReconcileWrite[]; planFixes: PlanFix[]; needsYou: NeedsYou[]; notOurs: number }

const gbpWords = (n: number) => `£${n.toFixed(2)}`;

/** A charge's ledger key, the same one the webhook writes: the invoice for a monthly, else the payment intent. */
export const chargeObjectId = (c: StripeChargeFact) => c.invoice ?? c.paymentIntent ?? c.id;

export function planReconcile(input: {
  charges: readonly StripeChargeFact[];
  disputes: readonly StripeDisputeFact[];
  ledger: readonly LedgerFact[];
  placeOf: (c: StripeChargeFact) => ChargePlacement;
  /** A ledger id whose first-payment commission has already been marked paid. */
  paidLedgerIds: ReadonlySet<string>;
  /** Only rows dated on or after this are expected to be in Stripe's list. */
  sinceIso: string;
}): ReconcilePlan {
  const { ledger } = input;
  const out: ReconcilePlan = { writes: [], planFixes: [], needsYou: [], notOurs: 0 };
  const find = (kind: string, object: string) => ledger.find((r) => r.kind === kind && r.stripe_object_id === object) ?? null;
  const placed = new Map<string, ChargePlacement>();
  /** The lead a charge belongs to: what its payment row already says, else where Stripe's ids place it. */
  const leadOfCharge = (c: StripeChargeFact): string | null => {
    const row = find(c.invoice ? 'recurring' : 'initial', chargeObjectId(c));
    return row?.lead_id ?? placed.get(c.id)?.leadId ?? null;
  };

  for (const c of input.charges) {
    const kind: ReconcileKind = c.invoice ? 'recurring' : 'initial';
    const object = chargeObjectId(c);
    const row = find(kind, object);
    const place = input.placeOf(c);
    placed.set(c.id, place);
    const base = {
      amount_gbp: c.amountGbp, currency: c.currency, occurred_at: c.createdAt, stripe_object_id: object,
      stripe_payment_intent_id: c.paymentIntent, stripe_charge_id: c.id, stripe_invoice_id: c.invoice, stripe_customer_id: c.customer,
    };
    if (!row) {
      if (place.held) out.needsYou.push({ kind: 'held_payment', object, leadId: place.leadId, detail: `${gbpWords(c.amountGbp)} was taken but is held: no valid signature. Not recorded as a sale.` });
      else if (place.leadId) out.writes.push({ ...base, lead_id: place.leadId, kind, ...(kind === 'initial' ? { stripe_plan: place.plan } : {}), note: `daily check: charge ${c.id}`, why: `Payment of ${gbpWords(c.amountGbp)} the webhook missed` });
      else if (place.findable) out.needsYou.push({ kind: 'charge_no_lead', object, detail: `${gbpWords(c.amountGbp)} on ${c.createdAt.slice(0, 10)} is a Findable payment, but no lead could be matched.` });
      else out.notOurs += 1;
    } else {
      if (!sameMoney(Number(row.amount_gbp), c.amountGbp)) {
        out.needsYou.push({ kind: 'amount_differs', object, leadId: row.lead_id, detail: `The ledger says ${gbpWords(Number(row.amount_gbp))}, Stripe says ${gbpWords(c.amountGbp)}. Left as it is.` });
      }
      /* Blank ids are what tie a later refund or dispute to this payment. Filling them changes no money. */
      const blankId = (c.paymentIntent && !row.stripe_payment_intent_id) || !row.stripe_charge_id || (c.invoice && !row.stripe_invoice_id) || (c.customer && !row.stripe_customer_id);
      if ((!row.lead_id && place.leadId) || blankId) {
        out.writes.push({ ...base, amount_gbp: Number(row.amount_gbp), occurred_at: row.occurred_at, lead_id: row.lead_id ?? place.leadId, kind, note: `daily check: charge ${c.id}`, why: !row.lead_id && place.leadId ? 'Payment tied to its lead' : 'Stripe ids filled in, so refunds and disputes tie to this payment' });
      }
      if (kind === 'initial' && row.payout_rule === 'plan_v1') {
        const resolved = salePlanFromCharge({ metaPlan: place.plan, amountGbp: c.amountGbp });
        if (resolved && resolved !== row.sale_plan) {
          if (input.paidLedgerIds.has(row.id)) {
            out.needsYou.push({ kind: 'plan_paid_differs', object, leadId: row.lead_id, detail: `Stripe says ${resolved}, the ledger says ${row.sale_plan ?? 'no plan'}, and the commission has already been paid. Left as it is.` });
          } else {
            out.planFixes.push({ ledgerId: row.id, leadId: row.lead_id, from: row.sale_plan, to: resolved, flag: salePlanFlagAtPayment({ stripePlan: place.plan, pickedPlan: place.picked, amountGbp: c.amountGbp }) ?? (isPaymentPlan(row.sale_plan) ? 'plan_differs' : null) });
          }
        }
      }
    }

    /* Refunds: the ledger holds the charge's cumulative refund, the same as Stripe, up or down (a refund can fail after it was issued). */
    const refundRow = find('refund', c.id);
    const refundLead = leadOfCharge(c);
    if (!sameMoney(Number(refundRow?.amount_gbp ?? 0), c.refundedGbp) || (refundRow && !refundRow.lead_id && refundLead)) {
      if (refundLead || refundRow) {
        out.writes.push({
          lead_id: refundRow?.lead_id ?? refundLead, kind: 'refund', amount_gbp: c.refundedGbp, currency: c.currency, occurred_at: c.refundedAt ?? c.createdAt, stripe_object_id: c.id,
          stripe_payment_intent_id: c.paymentIntent, stripe_charge_id: c.id, stripe_invoice_id: c.invoice, stripe_customer_id: c.customer,
          note: 'daily check: refund on the charge', why: `Refund now ${gbpWords(c.refundedGbp)}${refundRow ? `, was ${gbpWords(Number(refundRow.amount_gbp))}` : ', the webhook missed it'}`,
        });
      } else if (place.findable) {
        out.needsYou.push({ kind: 'refund_no_lead', object: c.id, detail: `A refund of ${gbpWords(c.refundedGbp)} could not be tied to a lead.` });
      }
    }
  }

  const chargeById = new Map(input.charges.map((c) => [c.id, c]));
  for (const d of input.disputes) {
    const row = find('chargeback', d.id);
    const charge = d.charge ? chargeById.get(d.charge) : undefined;
    const payRow = d.charge ? ledger.find((r) => (r.kind === 'initial' || r.kind === 'recurring') && r.stripe_charge_id === d.charge) : undefined;
    const piRow = d.paymentIntent ? ledger.find((r) => (r.kind === 'initial' || r.kind === 'recurring') && r.stripe_payment_intent_id === d.paymentIntent) : undefined;
    const lead = row?.lead_id ?? (charge ? leadOfCharge(charge) : null) ?? payRow?.lead_id ?? piRow?.lead_id ?? null;
    const changed = !row || row.status !== d.status || (!row.lead_id && !!lead);
    if (!changed) continue;
    if (!row && !lead) {
      if (!charge || placed.get(charge.id)?.findable) out.needsYou.push({ kind: 'dispute_no_lead', object: d.id, detail: `A dispute of ${gbpWords(d.amountGbp)} could not be tied to a lead.` });
      continue;
    }
    out.writes.push({
      lead_id: lead, kind: 'chargeback', status: d.status, amount_gbp: d.amountGbp, currency: d.currency, occurred_at: d.createdAt, stripe_object_id: d.id,
      stripe_payment_intent_id: d.paymentIntent, stripe_charge_id: d.charge, stripe_invoice_id: null, stripe_customer_id: null,
      note: 'daily check: dispute', why: row ? `Dispute now ${d.status}, was ${row.status}` : `Dispute (${d.status}) the webhook missed`,
    });
  }

  /* A payment in the window that Stripe does not list. Reported only: a test row is expected to have no charge, so those are left out. */
  const known = new Set(input.charges.map(chargeObjectId));
  for (const r of ledger) {
    if ((r.kind !== 'initial' && r.kind !== 'recurring') || r.occurred_at < input.sinceIso || r.commission_rule === 'test_excluded' || known.has(r.stripe_object_id)) continue;
    out.needsYou.push({ kind: 'not_in_stripe', object: r.stripe_object_id, leadId: r.lead_id, detail: `${gbpWords(Number(r.amount_gbp))} on ${r.occurred_at.slice(0, 10)} is in the ledger, but Stripe does not list it. Left as it is.` });
  }
  return out;
}

/** What the webhook endpoint is missing, in the check's words. */
export function webhookProblems(endpoints: readonly { url?: string | null; enabled_events?: readonly string[] | null; status?: string | null }[]): NeedsYou[] {
  const mine = endpoints.filter((e) => String(e.url ?? '').includes('/stripe-webhook'));
  if (!mine.length) return [{ kind: 'webhook_not_found', object: 'webhook', detail: 'Stripe has no webhook endpoint pointing at stripe-webhook.' }];
  const on = mine.filter((e) => e.status === 'enabled');
  const events = new Set(on.flatMap((e) => [...(e.enabled_events ?? [])]));
  if (events.has('*')) return [];
  const missing = REQUIRED_WEBHOOK_EVENTS.filter((e) => !events.has(e));
  return missing.length ? [{ kind: 'webhook_events_missing', object: 'webhook', detail: `Stripe is not sending: ${missing.join(', ')}. The daily check catches them, up to a day late.` }] : [];
}

export interface StripeCheckRow { finished_at: string | null; ok: boolean; fixed_count: number; needs_you_count: number; needs_you?: readonly NeedsYou[] | null; changes?: readonly { what?: string }[] | null; error?: string | null }
export type StripeCheckTone = 'good' | 'attention' | 'problem';
/** The one line on Commission owed. Never reads "fine" unless a recent run finished and found nothing it could not fix. */
export function stripeCheckWords(check: StripeCheckRow | null | undefined, nowMs: number): { tone: StripeCheckTone; text: string } {
  if (!check?.finished_at) return { tone: 'problem', text: 'The daily Stripe check has not run yet, so nothing has been compared.' };
  const ageHours = (nowMs - Date.parse(check.finished_at)) / 3_600_000;
  const when = new Date(check.finished_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  if (!check.ok) return { tone: 'problem', text: `The Stripe check failed on ${when}. Figures are from the webhook only.` };
  if (!(ageHours <= STRIPE_CHECK_STALE_HOURS)) return { tone: 'problem', text: `The Stripe check last ran on ${when}. It should run every day.` };
  const fixed = check.fixed_count > 0 ? `${check.fixed_count} fixed` : 'nothing to fix';
  if (check.needs_you_count > 0) return { tone: 'attention', text: `Checked against Stripe ${when}: ${fixed}, ${check.needs_you_count} to look at.` };
  return { tone: 'good', text: `Checked against Stripe ${when}: ${fixed}.` };
}
