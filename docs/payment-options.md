# Payment options for Findable Build (2026-10-29)

Branch `feat/build-payment-options` (not merged, not deployed). Paul's brief: replace the single Build payment plan with
three ways to pay; keep the old £99 × 12 for staff only; test-mode Stripe only; stop before merge for any wording or
layout change.

## The rule

`src/lib/paymentPlans.ts` is the one place the plans live (amounts, counts, totals, words). `ServiceRoute` stays WHAT we
deliver (Build); `PaymentPlan` is HOW it is paid: `full` (£499 once), `six` (£99 × 6), `twelve` (£99 then £49.99 × 11),
`legacy_twelve` (£99 × 12, staff only). ⛔ A payment COUNT never identifies a plan once one is recorded: 6 is also the
withdrawn Optimise route's count. Read `payment_plan` first (Stripe metadata, onboarding row, lead).

⛔ **Off sale until the agreement names the plans:** `PAYMENT_OPTIONS_SELLABLE = false`. While false, every path is
exactly today's: Quick Close asks no plan question, a blank plan reads as `legacy_twelve`, and the checkout refuses any
other plan on a row (`plan_not_on_sale`). Once true, a blank plan is undecided and refused (`plan_undecided`), never a
default. Agreement draft and open decisions: `docs/payment-options-term-changes-draft.md`.

## What is built

* **DB** (migration `20261129090000_payment_plans.sql`, applied 2026-10-29, read back): `onboarding_responses.payment_plan`,
  `outreach_leads.payment_plan`, `outreach_leads.paid_in_full_at` (nullable, CHECK `not valid`); the paid lock trigger
  now also locks the plan after payment. No rows touched.
* **Checkout** (`findable-checkout`): reads the plan off the row; takes the plan's first payment (`offerPrice(plan)`);
  pay in full does not save the card; Stripe metadata carries `payment_plan` and the plan's `total_payments`; the old plan
  keeps its exact v5 line name and card notice.
* **Schedule** (`_shared/delayed-subscription.ts`): the plan picks the monthly Price (`FINDABLE_STANDARD_MONTHLY_PRICE_ID`
  £99, or `FINDABLE_REDUCED_MONTHLY_PRICE_ID` £49.99, amount checked against the plan) and the recurring count, so Stripe
  stops after the last payment (`cancel_at`). Pay in full creates no subscription. `resolvePaidRoute` checks the count
  against the recorded plan; a plan on Optimise is refused.
* **Webhook** (`stripe-webhook`): stamps `payment_plan` on the lead; contract count = the plan's; pay in full stamps
  `paid_in_full_at` at payment; an instalment plan stamps it when the subscription ends at its own `cancel_at` (term
  complete), then the existing "payments complete" email (site transfers; £29.99 hosting optional, manual) goes out.
* **Quick Close**: question "How do they want to pay?" after the plan (only when on sale); the old plan is hidden behind
  "Show the old plan (£99 × 12, staff only)"; the terms read out and the header chip follow the chosen plan; the plan is
  written to `onboarding_responses.payment_plan`.
* **Test-mode Stripe**: `scripts/stripe-payment-options-setup.ts` (dry run by default, `--apply` creates the £49.99 Price;
  refuses any non-test key; never prints it). **Not run: no Stripe test key is stored on this machine.**
* Live Stripe list: `docs/payment-options-live-setup.md`. Tests: `scripts/payment-plans.test.ts`.

## Not changed yet (each follows the agreement, so it changes with v6)

Price words on: the AI reply fact sheet (`offerFactSheet.ts`, pinned to the agreement text by its test), the call
playbook / `FINDABLE_OFFER_SUMMARY`, welcome pack, monthly-starting and payment-failed emails (they say £99 a month),
client portal / paid-client hub, dashboard and inbox quote text, findable.live (separate repo: its sign-up page, pre-pay
screen and `/agreement`). The ready-made words are in `paymentPlans.ts` (`paymentOptionsSummary`, `planTermsLines`,
`cardSavedNoticeForPlan`, `planAfterWords`).

## Meta templates that quote a price (fixed at Meta, NOT changed)

| Template | Price text | Status |
|---|---|---|
| `explain_offer` | "£99 to start … After that £29.99 a month … Stop any time" | already blocked (`STALE_OFFER_TEMPLATES`) |
| `explain_offer_v2` | same | already blocked |
| `re_engage` / `re_engage_49` | "next ten businesses at £49.99 instead of £99" | registered copy, old offer |
| `booking_switch_barbers` | "flat £29.99 a month" | dead barber product |

`findable_signup_link` and `findable_onboarding` name no price. None needs changing for the new plans to work.

## Saved replies with stale prices (DB `templates`, personal; NOT edited)

"Price" (£99 / £19.99 offer, eight weeks), "Pricing" (£49.99 and £99 with **direct Stripe payment links**, which skip the
signed agreement; the webhook holds such payments), "Barber follow up" (£29.99), "META prompt" (internal). Recommend
Paul deletes or rewrites "Price" and "Pricing".

## Go-live checklist

v6 approved and generated in both repos → £49.99 live Price + secret → deploy `findable-checkout`, `stripe-webhook`,
`quick-close` (+ import-graph list) → wire the price words above → `PAYMENT_OPTIONS_SELLABLE = true` → What's New entry
→ one ZZ QA run per plan with `scripts/qa-simulate-payment.ts`.
