/* No imports, deliberately. This file is bundled into render-audit-report (via
   aiAuditReportHtml.ts), so anything it imports lands in that edge bundle too. If it ever needs
   one, use a RELATIVE path with an explicit .ts extension — Deno cannot resolve the Vite "@/"
   alias, there is no deno.json in this repo. */

/* ============================================================
   THE FOUNDER OFFER — the first ten at a reduced price.

   TEMPORARY. It lives in its own file so it can be deleted in one move rather than unpicked from
   findableOffer.ts, which holds the PERMANENT product offer (£99 + the guarantee) and is mirrored by
   hand into the findable-site repo. findable-site never renders this block, so putting it there
   would create a cross-repo mirror obligation for nothing.

   WHERE IT APPEARS: the bottom of the client-facing AI visibility report, after the CTA and above
   the footer. Deliberately not in a WhatsApp message — a discount attached to a request for feedback
   reads as an incentivised review in a chat thread, and reads as a founder's offer in a report.

   ⚠️ THE GUARANTEE IS NOT HERE. It is FINDABLE_GUARANTEE in findableOffer.ts, rendered verbatim.
   Never write a second copy of it: this offer's price will change and the guarantee must not drift
   with it.
   ============================================================ */

/** Flip to false the moment the ten are gone. Hides the whole block — copy, guarantee and button —
 *  in one line, without touching the renderer. */
export const FOUNDER_OFFER_LIVE = true;

/** What they pay. A LABEL, not a number: it is only ever displayed, never arithmetic, and the
 *  actual charge is whatever the Stripe link is configured for. */
export const FOUNDER_OFFER_PRICE_LABEL = "£49.99";

/** The normal price, so the offer has something to be an offer against. Matches
 *  FINDABLE_SETUP_PRICE_GBP (99) in findableOffer.ts — if that changes, change this. */
export const FOUNDER_OFFER_NORMAL_LABEL = "£99";

/** How many are going at this price. ⚠️ NOTHING DECREMENTS THIS. It is a statement Paul manages by
 *  hand; sell fifteen and the report still says ten until this line changes. */
export const FOUNDER_OFFER_COUNT = 10;

/* ⛔ THE RAW STRIPE PAYMENT LINK IS GONE — 2026-08-11. It was
   "https://buy.stripe.com/5kQcN492k1Uqdal01G0kE06", and it went STRAIGHT to Stripe. Three things
   were wrong with it, and only the first was obvious:

   1. IT SKIPPED THE QUESTIONNAIRE, so it skipped the serve gate. Somebody on a platform we cannot
      publish to could pay, and the only thing standing in the way was a sentence of copy.
   2. THE PAYMENT WAS INVISIBLE. stripe-webhook's entire Findable branch is gated on
      `metadata.onboarding_id`, which only findable-checkout sets — a STATIC payment link cannot
      carry a per-payer row id. So no onboarding row was marked paid, no lead got `amount_paid` or
      `payment_received`, no operator email went out, and startPaidBaseline never ran. The money
      would have arrived with no trace in the system that it had.
   3. THE REPORT WOULD HAVE KEPT SELLING TO THEM. showFounderOffer() below hides the offer once
      `amount_paid > 0` — a value that route never wrote.

   The button now points at findable-site's onboarding flow, carrying the lead, so the payment goes
   through questionnaire -> findable-checkout -> stripe-webhook: gated, recorded, and baselined.

   ⚠️ THE URL IS BUILT PER-READER AND PASSED IN, not stored here. It needs the lead id and the
   configured site origin, neither of which is a constant — see AiAuditReportData.founderOfferUrl and
   render-audit-report, which resolves it with the SAME onboardingUrl() the live onboarding_followup
   template uses. This file stays pure so the SPA can import it.
   ⛔ AND NO LEAD MEANS NO BUTTON. The price is derived server-side by offerPriceForLead, which
   returns the FULL £99 for `no_lead` — so a button built without one would say £19.99 and charge £99.
   Two audits have no lead row and both are already in FOUNDER_OFFER_HIDE_AUDIT_IDS below, so this
   costs nothing today; it is the rule that keeps it costing nothing. */

/** What happens when they press the button — now stated as the ORDER it actually happens in.
 *  ⛔ REWORDED WITH THE REPOINT. The old line said "Before we start we'll confirm a couple of things
 *  about your website", which was written for a button that went straight to Stripe: the website
 *  questions came after the money, if at all. They now come BEFORE it, so the sentence describing
 *  them had to move with them or it would be describing the previous flow.
 *  ⚠️ IT STILL DOES THE ORIGINAL JOB. Naming the platform question up front is what stops a serve
 *  gate refusal arriving as a surprise — "some setups we can publish to directly, others we host for
 *  you" is the serveGate distinction in plain words, with no hint that one of the answers is a no.
 *  ⚠️ NOT the guarantee, which is FINDABLE_GUARANTEE and is rendered verbatim above this. */
export const FOUNDER_OFFER_AFTER_PAYMENT =
  "Two quick questions about your website first — some setups we can publish to directly, others we "
  + "host for you. Then payment, then the rest of your details.";

/* ── WHO MUST NEVER SEE IT ───────────────────────────────────────────────────────────────────────
   A client reopening their own report to a cheaper founder offer is a bad moment.

   The general rule is `amount_paid > 0` on the lead — the same definition of "paid" the rest of the
   app uses (CLAUDE.md §6). That is the rule that will matter for every future customer.

   ⚠️ BUT IT STRUCTURALLY CANNOT SEE AN AUDIT-ONLY CLIENT. Measured 2026-08-05: two audits have no
   lead row at all — ABLM Associates (the delivery client) and Paul's pool bar — so there is no
   amount_paid to read for either. Hence the explicit list. It is two ids, not a design: when a real
   payment path exists for these, delete them from here.

   ⚠️ AND `ai_audits.baseline` IS NOT A PAID SIGNAL, despite only stripe-webhook writing it in
   production. Checked 2026-08-05: three audits carry a baseline and all three are test businesses
   (MK Plumbing, SW2 Bathrooms, one other plumber) — while ABLM, the actual client, has none. Using
   it would hide the offer from three test rows and still show it to the one business that matters. */

/** Audits whose report must never carry the offer, where no payment row exists to derive it from. */
export const FOUNDER_OFFER_HIDE_AUDIT_IDS: readonly string[] = [
  "d2008327-c8f3-4940-848b-71dcc466ee17", // ABLM Associates — delivery client, lead_id NULL
  "94b25c15-39d2-4638-821e-ec310dc1a37a", // Sinners and saints kava cafe and pool bar — Paul's own, lead_id NULL
];

export interface FounderOfferAudience {
  /** The audit being rendered. */
  auditId?: string | null;
  /** amount_paid on the attached lead, when there is one. */
  amountPaid?: number | null;
}

/** Should this report carry the founder offer? False for a client, false when the offer is over. */
export function showFounderOffer(who: FounderOfferAudience): boolean {
  if (!FOUNDER_OFFER_LIVE) return false;
  if ((who.amountPaid ?? 0) > 0) return false;
  if (who.auditId && FOUNDER_OFFER_HIDE_AUDIT_IDS.includes(who.auditId)) return false;
  return true;
}
