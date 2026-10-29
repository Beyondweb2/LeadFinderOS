# Payment options: what to create in LIVE Stripe (for Paul to approve and do)

Branch `feat/build-payment-options`, 2026-10-29. Nothing here has been created in live mode. Do this only after the
new agreement version is approved (see `docs/payment-options-term-changes-draft.md`) and just before the switch
`PAYMENT_OPTIONS_SELLABLE` is turned on in `src/lib/paymentPlans.ts`.

## Why so little

The app already builds most of a payment in code, and that is kept:

* **Every first payment** (the £99 sign-up, and the £499 pay in full) is charged inline by `findable-checkout`, so the
  guarantee sentence stays on the Stripe line. **No Stripe Product or Price is needed for these.**
* **Every schedule** is a Stripe subscription the webhook creates after the first payment, with `cancel_at` set so it
  stops after the plan's last payment. **No Stripe "schedule" object is needed.**

So live Stripe needs **one new Price** and **one new secret**. Everything else already exists.

## 1. Create in live Stripe (Dashboard, Live mode)

| What | Exact values |
|---|---|
| Product | Name: `Findable Build — 12 months (monthly)` |
| Price on it | **£49.99 GBP, recurring, monthly** (billing period: Monthly). Lookup key: `findable_reduced_monthly`. Nickname: `£49.99/month (12-month plan)`. Tax behaviour: as the existing £99 monthly price. |

Copy the **Price id** (starts `price_`, NOT the `prod_` product id).

## 2. Check what already exists (no change)

| What | Expected |
|---|---|
| The £99 monthly Price, already set as edge secret `FINDABLE_STANDARD_MONTHLY_PRICE_ID` | £99.00 GBP, recurring monthly. Used by the 6-month plan and the old £99 × 12 plan. The webhook refuses to create a schedule if the amount is not £99/month. |
| `FINDABLE_SETUP_PRICE_ID` | Still **unset** (keep it unset; the sign-up and £499 lines are inline). |

## 3. Edge secret to add (I can set it once you give me the price id; the id is not a secret)

| Secret | Value |
|---|---|
| `FINDABLE_REDUCED_MONTHLY_PRICE_ID` | the £49.99 Price id from step 1 |

The webhook reads the price back from Stripe and refuses to create a 12-month schedule unless it is exactly £49.99 a month.

## 4. What each plan does in Stripe

| Plan | Taken at checkout | Then | Stops |
|---|---|---|---|
| Pay in full | £499 (inline line, card not saved) | nothing | n/a. Marked paid in full at once. |
| 6 months | £99 (inline line, card saved) | subscription on the £99 Price, first charge the day after the refund window | after 5 monthly payments (6 in total) |
| 12 months | £99 (inline line, card saved) | subscription on the £49.99 Price, same start | after 11 monthly payments (12 in total) |
| Old £99 × 12 (staff only) | £99 | subscription on the £99 Price | after 11 monthly payments (unchanged) |

When the last payment clears, Stripe ends the subscription at `cancel_at`; the webhook then marks the lead **paid in
full** (`outreach_leads.paid_in_full_at`), sends the existing "payments complete" email (website transfers; optional
£29.99/month hosting only if they ask) and alerts you. £29.99 hosting stays a manual opt-in, as today.

## 5. Order on go-live day

1. Agreement v6 approved and generated (both repos), findable.live `/agreement` matches.
2. Create the £49.99 Price (step 1). Give me the id; I set `FINDABLE_REDUCED_MONTHLY_PRICE_ID`.
3. Deploy edge functions `findable-checkout`, `stripe-webhook`, `quick-close` (and anything else the import graph names).
4. Turn `PAYMENT_OPTIONS_SELLABLE` on, deploy the app, add the What's New entry.
5. One QA run per plan with a `ZZ QA` lead and `scripts/qa-simulate-payment.ts` (no real card).
