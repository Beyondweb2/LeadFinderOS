/* WHAT A SALE WAS SOLD ON (Paul, 2026-11-02, docs/commission-owed.md). Trust Stripe over what the salesperson picked, and flag any
   mismatch. `sale_plan` on the ledger row is the plan in Stripe's own session; `sale_plan_picked` is what Quick Close held when the
   money landed. The plan id already says both the plan and the way to pay, so only the id is stored and the words come from here.
   Pure: read by the ledger writer, fn sales-earnings and the screens. ⚠️ Edge-reachable: relative imports, explicit .ts. */
import { PAYMENT_PLAN_SPEC, isPaymentPlan, planProduct, type PaymentPlan, type PlanProduct } from './paymentPlans.ts';

export type SalePlanFlag = 'plan_differs' | 'amount_differs' | 'monthly_differs';
export type PayOption = 'monthly' | 'full' | 'six' | 'twelve' | 'old';

export const SALE_PLAN_FLAG_WORDS: Record<SalePlanFlag, string> = {
  plan_differs: 'Stripe took a different plan from the one the salesperson picked. Stripe is used.',
  amount_differs: 'The first payment Stripe collected is not this plan’s first payment.',
  monthly_differs: 'A monthly payment Stripe collected is not this plan’s monthly amount.',
};

export const isSalePlanFlag = (v: unknown): v is SalePlanFlag => v === 'plan_differs' || v === 'amount_differs' || v === 'monthly_differs';

/** The mismatch on a sale's first payment, or null. A sale with no plan on either side is the old v5 offer: nothing to compare. */
export function salePlanFlagAtPayment(input: { stripePlan: string | null | undefined; pickedPlan: string | null | undefined; amountGbp: number }): SalePlanFlag | null {
  const stripe = isPaymentPlan(input.stripePlan) ? input.stripePlan : null;
  const picked = isPaymentPlan(input.pickedPlan) ? input.pickedPlan : null;
  if (picked && picked !== stripe) return 'plan_differs';
  if (stripe && Math.abs(PAYMENT_PLAN_SPEC[stripe].firstGbp - input.amountGbp) >= 0.005) return 'amount_differs';
  return null;
}

/** Stripe's monthly amounts against the plan. Derived on read, because each monthly lands long after the sale was stamped. */
export function monthlyDiffers(plan: string | null | undefined, recurringAmounts: readonly number[]): boolean {
  if (!isPaymentPlan(plan)) return false;
  const spec = PAYMENT_PLAN_SPEC[plan];
  /* Payments past the plan's own count are opt-in hosting, which has its own price. */
  return recurringAmounts.slice(0, Math.max(0, spec.totalPayments - 1)).some((a) => Math.abs(a - spec.monthlyGbp) >= 0.005);
}

export interface SalePlanParts { product: PlanProduct | null; option: PayOption; words: string; }

/** "Complete · monthly" / "Essential · pay in full" / "Old plan". A blank plan is the v5 offer (paymentPlans.ts). */
export function salePlanParts(plan: string | null | undefined): SalePlanParts {
  if (!isPaymentPlan(plan) || plan === 'legacy_twelve') return { product: null, option: 'old', words: 'Old plan' };
  const p: PaymentPlan = plan;
  const option: PayOption = p === 'complete' ? 'monthly' : p;
  const product = planProduct(p);
  const optionWords: Record<PayOption, string> = { monthly: 'monthly', full: 'pay in full', six: '6 months', twelve: '12 months', old: 'old plan' };
  return { product, option, words: `${product === 'complete' ? 'Complete' : 'Essential'} · ${optionWords[option]}` };
}
