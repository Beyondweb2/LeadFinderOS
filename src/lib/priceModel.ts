/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PRICE MODEL — ONE RULE (2026-10-14, test day; docs/test-day-outreach.md).

   Two models a salesperson can switch between with one click (their own setting, else the admin's team default):
     · 'standard'     — today's offer, unchanged: £99 to start, then £99 a month (Build 12 payments / Optimise 6).
                        Every existing constant in findableOffer.ts is still the truth for it.
     · 'upfront_499'  — £499 up front with the money-back guarantee, then £99 a month for 12 months, the monthly
                        payments starting when Build's do: the day after the 14-day refund window closes (normally about six
                        weeks after sign-up — the v4 agreement's timing, MONTHLY_START_V3_WORDS; the old fixed 42 days is legacy).

   ⛔ THE £499 MODEL CANNOT BE PAID FOR YET — PRICE_MODEL_PAYMENT_LIVE. The signed Client Service Agreement (v4) names
   "£99 initial payment" in its service descriptions, 3.1, 3.7, 4.1 and 5.4–5.6, and findable-checkout only takes
   money after that agreement is signed. Selling £499 on a £99 agreement would be a contract that says one price and
   a charge of another. So: the scripts, the Close tab and the record all follow the chosen model, but a sign-up link
   is REFUSED for a model whose payment is not live (fn quick-close 'price_model_not_live', before any checkout call).
   It goes live only when Paul approves a new agreement version for it, findable.live's /agreement matches, and the
   checkout + webhook learn its amount and payment count — never by flipping this flag alone.
   ⛔ The guarantee words are the existing headline only ("We improve AI visibility or you get your money back.").
   Nothing here invents a refund amount or a condition for the £499 model — that is Paul's, in the new agreement.
   This leaf has no imports beyond findableOffer (edge-reachable: relative .ts imports only).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, MONTHLY_START_V3_WORDS } from './findableOffer.ts';

export const PRICE_MODELS = ['standard', 'upfront_499'] as const;
export type PriceModel = typeof PRICE_MODELS[number];

/** The £499 model's figures. The monthly is the same £99 as today. */
export const UPFRONT_SETUP_GBP = 499;
export const UPFRONT_MONTHLY_GBP = FINDABLE_MONTHLY_GBP;
/** Monthly payments AFTER the £499 (12 months), so 13 payments in all. */
export const UPFRONT_MONTHLY_PAYMENTS = 12;
/** When the first monthly payment is taken — the same moment as Build (the v4 agreement's words). */
export const UPFRONT_MONTHLY_START_WORDS = MONTHLY_START_V3_WORDS;

/** Can a client PAY under this model today? Positive list: only 'standard'. */
export const PRICE_MODEL_PAYMENT_LIVE: Record<PriceModel, boolean> = { standard: true, upfront_499: false };

/** The ONE guarantee line every model may use (pinned to Quick Close's QUICK_CLOSE_PROMISE by test). */
export const PRICE_MODEL_GUARANTEE = 'We improve AI visibility or you get your money back.';

export const PRICE_MODEL_LABEL: Record<PriceModel, string> = {
  standard: `£${FINDABLE_SETUP_PRICE_GBP} start`,
  upfront_499: `£${UPFRONT_SETUP_GBP} upfront`,
};

/** Unknown / absent → 'standard' (today's offer). Never a guess towards the model that cannot be paid. */
export function parsePriceModel(v: unknown): PriceModel {
  return v === 'upfront_499' ? 'upfront_499' : 'standard';
}

/** The person's model: their own choice, else the team default, else standard. */
export function effectivePriceModel(own: unknown, teamDefault: unknown): PriceModel {
  if (own === 'standard' || own === 'upfront_499') return own;
  return parsePriceModel(teamDefault);
}

/** What the salesperson says for the £499 model (the standard model keeps its route words from callClose.ts). */
export function upfrontSpoken(): { summary: string; spoken: string[]; terms: string[] } {
  const total = UPFRONT_SETUP_GBP + UPFRONT_MONTHLY_GBP * UPFRONT_MONTHLY_PAYMENTS;
  return {
    summary: `£${UPFRONT_SETUP_GBP} upfront · £${UPFRONT_MONTHLY_GBP}/month × ${UPFRONT_MONTHLY_PAYMENTS} · ${PRICE_MODEL_GUARANTEE}`,
    spoken: [
      `It's £${UPFRONT_SETUP_GBP} up front, then £${UPFRONT_MONTHLY_GBP} a month for ${UPFRONT_MONTHLY_PAYMENTS} months, starting ${UPFRONT_MONTHLY_START_WORDS}.`,
      PRICE_MODEL_GUARANTEE,
    ],
    terms: [
      `£${UPFRONT_SETUP_GBP} up front`,
      `then £${UPFRONT_MONTHLY_GBP} a month for ${UPFRONT_MONTHLY_PAYMENTS} months, from ${UPFRONT_MONTHLY_START_WORDS}`,
      `£${total.toLocaleString('en-GB')} in all`,
      PRICE_MODEL_GUARANTEE,
    ],
  };
}

/** Why a sign-up link cannot be made under this model yet (null = it can). */
export function priceModelLinkRefusal(model: PriceModel): string | null {
  return PRICE_MODEL_PAYMENT_LIVE[model] ? null
    : `The £${UPFRONT_SETUP_GBP} upfront model is not switched on for payment yet — its client agreement still needs Paul's approval. Switch to the £${FINDABLE_SETUP_PRICE_GBP} start model to send a sign-up link.`;
}
