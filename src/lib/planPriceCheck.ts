/* IS EVERY PLAN WIRED TO THE RIGHT STRIPE PRICE? (2026-11-10; fn sales-earnings mode `plan_prices`, admin only, read only.)
 *
 * What a client is charged comes from two places:
 *   · THE FIRST PAYMENT of every plan is an INLINE amount built in findable-checkout from PAYMENT_PLAN_SPEC (it carries
 *     the guarantee as the line description, which a dashboard Price cannot). There is no Stripe Price to get wrong.
 *   · THE MONTHLY PAYMENTS that follow use a dashboard Price whose id is an edge secret (PLAN_MONTHLY_PRICE_SECRET). The
 *     webhook checks that Price's amount before it creates a subscription and refuses a wrong one, but that is only
 *     found out AFTER a client has paid their first payment. This lets Paul see it before a sale.
 * This file is the rule: what each plan should charge, and whether a Stripe Price object matches. No Stripe call here.
 * Pure. Edge-reachable: relative imports, explicit .ts. */
import { CLIENT_PAYMENT_PLANS, PAYMENT_PLAN_SPEC, PLAN_MONTHLY_PRICE_SECRET, STAFF_ONLY_PAYMENT_PLANS, planFullName, recurringPaymentsForPlan, type PaymentPlan } from './paymentPlans.ts';

const pence = (gbp: number): number => Math.round(gbp * 100);
const PRICE_ID_RE = /^price_[A-Za-z0-9_]+$/;

export interface PlanPriceExpectation {
  plan: PaymentPlan;
  name: string;
  /** Taken at checkout, in pence. Always an inline amount from the code's constants. */
  firstPence: number;
  /** Monthly payments after the first (0 = one payment, nothing follows). */
  monthlyCount: number;
  /** Each monthly payment, in pence (0 when there are none). */
  monthlyPence: number;
  /** The edge secret(s) that may hold the monthly Price id, in the order the webhook reads them. Empty = no Price needed. */
  secrets: string[];
}

/** Every plan that can be charged, clients' plans first then the staff-only one. */
export function planPriceExpectations(): PlanPriceExpectation[] {
  return [...CLIENT_PAYMENT_PLANS, ...STAFF_ONLY_PAYMENT_PLANS].map((plan) => {
    const s = PAYMENT_PLAN_SPEC[plan];
    const secret = PLAN_MONTHLY_PRICE_SECRET[plan];
    /* The £99 monthly falls back to the older secret name (delayed-subscription.ts reads them in this order). */
    const secrets = !secret ? [] : secret === 'FINDABLE_STANDARD_MONTHLY_PRICE_ID' ? [secret, 'FINDABLE_NEW_SITE_PRICE_ID'] : [secret];
    return { plan, name: planFullName(plan), firstPence: pence(s.firstGbp), monthlyCount: recurringPaymentsForPlan(plan), monthlyPence: recurringPaymentsForPlan(plan) > 0 ? pence(s.monthlyGbp) : 0, secrets };
  });
}

/** The first configured secret, as the webhook picks it. `env` reads a secret. */
export function configuredPriceId(secrets: readonly string[], env: (name: string) => string | undefined): { secret: string | null; id: string | null; malformed: boolean } {
  for (const name of secrets) {
    const v = env(name);
    if (v === undefined || v === null) continue;
    const id = String(v).trim();
    return { secret: name, id, malformed: !PRICE_ID_RE.test(id) };
  }
  return { secret: null, id: null, malformed: false };
}

/** What Stripe says about a Price (the fields we judge on). */
export interface StripePriceFacts { unit_amount?: unknown; currency?: unknown; active?: unknown; livemode?: unknown; type?: unknown; recurring?: { interval?: unknown; interval_count?: unknown } | null }

/** null = this Price charges exactly what the plan says. Otherwise what is wrong, in plain words. */
export function priceProblem(expectedPence: number, p: StripePriceFacts | null | undefined): string | null {
  if (!p) return 'Stripe has no Price with that id.';
  const gbp = (n: number) => `£${(n / 100).toFixed(2)}`;
  if (Number(p.unit_amount) !== expectedPence) return `It charges ${Number.isFinite(Number(p.unit_amount)) ? gbp(Number(p.unit_amount)) : 'an unknown amount'}, and the plan says ${gbp(expectedPence)}.`;
  if (p.currency !== 'gbp') return `It is priced in ${String(p.currency ?? 'an unknown currency').toUpperCase()}, not GBP.`;
  if (p.recurring?.interval !== 'month' || (p.recurring?.interval_count !== undefined && Number(p.recurring.interval_count) !== 1)) return 'It is not a once-a-month price.';
  if (p.active !== true) return 'It is archived in Stripe, so a subscription cannot be created on it.';
  if (p.livemode !== true) return 'It is a TEST-mode price, so a real subscription cannot be created on it.';
  return null;
}
