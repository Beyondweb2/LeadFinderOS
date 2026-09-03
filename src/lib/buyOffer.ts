/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SHOULD THIS REPORT INVITE THIS PERSON TO BUY?

   🔴 WAS founderOffer.ts UNTIL 2026-09-03. Renamed with the pricing change, not tidied: the founder
   tier is gone (one flat price for everyone — see findableOffer.ts), so `showFounderOffer` named a
   thing that no longer exists. A guard named after today's instance of a rule expires silently the
   day the rule moves, which is precisely how the WhatsApp phone seatbelt failed on 2026-09-02.
   This file now answers only the question it always really answered: do we show the buy CTA.

   ⛔ WHAT WENT WITH THE RENAME: FOUNDER_OFFER_PRICE_LABEL, FOUNDER_OFFER_NORMAL_LABEL ("£99"),
   FOUNDER_OFFER_COUNT ("the first 10") and FOUNDER_OFFER_AFTER_PAYMENT. All four existed only for
   the offer block in aiAuditReportHtml.ts, which was unrendered on 2026-09-02 and is deleted with
   this commit. The price a customer is shown now comes from ONE place, offerPrice(), which both the
   plan card and the Stripe session call. Git holds the old copy if the pitch is ever wanted back.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Master switch for the buy CTA. Manual on purpose: nothing closes it automatically, so a webhook
 *  lag or a refund can never silently change what the next visitor is offered. */
export const OFFER_LIVE = true;

/** Audits that must never carry a buy CTA. Both have `lead_id` NULL, so there is no per-lead
 *  onboarding link for them and no customer to sell to. */
export const OFFER_HIDE_AUDIT_IDS: readonly string[] = [
  "d2008327-c8f3-4940-848b-71dcc466ee17", // ABLM Associates — delivery client, lead_id NULL
  "94b25c15-39d2-4638-821e-ec310dc1a37a", // Sinners and saints kava cafe and pool bar — Paul's own, lead_id NULL
];

export interface OfferAudience {
  /** The audit being rendered. */
  auditId?: string | null;
  /** amount_paid on the attached lead, when there is one. */
  amountPaid?: number | null;
}

/** Should this report carry the buy CTA? False for an existing client, false when the offer is off.
 *  ⚠️ The paying-customer rule is the load-bearing one: a report renders live, so without it a
 *  customer opening their own report would keep being sold to. */
export function showOffer(who: OfferAudience): boolean {
  if (!OFFER_LIVE) return false;
  if ((who.amountPaid ?? 0) > 0) return false;
  if (who.auditId && OFFER_HIDE_AUDIT_IDS.includes(who.auditId)) return false;
  return true;
}
