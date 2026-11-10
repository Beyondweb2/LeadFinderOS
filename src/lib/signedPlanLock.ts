/* THE PLAN LOCK AFTER A SIGNATURE (2026-11-10; fn quick-close `save` asks it).
 *
 * A signature is for ONE plan: the agreement the client signed prints it (paymentPlans.ts PLAN_PRINTING_VERSIONS), and
 * their sign-up page refuses to open payment on a signature for a different one (fn client-agreement). They also cannot
 * sign the same sign-up again on the same agreement version (one acceptance per sign-up and version). So a salesperson
 * who changed the plan after the client had signed left the client with a link that could neither pay nor be signed,
 * and nothing told anyone. This is the rule that refuses that change, in words the salesperson can act on.
 *
 * ⛔ Only a signature on the SAME agreement version as the new plan locks. The old staff plan signs v5 and everything
 *    else v7.1 (agreementVersionForPlan): moving between the two needs a fresh signature anyway, which the client's page
 *    asks for, so it is not a dead end and is not refused here.
 * ⛔ Going back to the signed plan is never refused: that is how a sign-up already stuck is put right.
 * Pure. Edge-reachable: relative imports, explicit .ts. */
import { agreementVersionForPlan, isPaymentPlan, planFullName, type PaymentPlan } from './paymentPlans.ts';

export interface SignedPlanRow { agreement_version: string | null; payment_plan: string | null }

/** null = the plan may change. Otherwise the sentence to show the salesperson. */
export function signedPlanLock(signatures: readonly SignedPlanRow[], newPlan: PaymentPlan): string | null {
  const version = agreementVersionForPlan(newPlan);
  for (const s of signatures) {
    if (s.agreement_version !== version) continue;
    /* A signature on this version that records no plan (v5 prints none) says nothing about the plan. */
    if (!isPaymentPlan(s.payment_plan)) continue;
    if (s.payment_plan === newPlan) return null;
    return `They have already signed the agreement for ${planFullName(s.payment_plan)}, so the plan cannot change here. `
      + `Their link still takes payment for ${planFullName(s.payment_plan)}. If they want ${planFullName(newPlan)} instead, tell Paul: it needs a new agreement.`;
  }
  return null;
}
