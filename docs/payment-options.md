# Payment options for Findable Build (live 2026-10-29)

Paul, 2026-10-29: "Build everything out and ship it. No off switch." Findable Build is sold three ways, signed on
agreement v6; the old £99 × 12 is staff-only on v5. Existing clients and signed records are untouched.

## The rule

`src/lib/paymentPlans.ts` owns the plans (amounts, counts, totals, words, the v6 guarantee):

| Plan id | Paid | Total | Agreement |
|---|---|---|---|
| `full` | £499 once | £499 | v6 |
| `six` | £99 × 6 | £594 | v6 |
| `twelve` | £99, then £49.99 × 11 | £648.89 | v6 |
| `legacy_twelve` (staff only) | £99 × 12 | £1,188 | v5 |

- `ServiceRoute` is WHAT we deliver (Build); `PaymentPlan` is HOW it is paid. ⛔ A payment count of 6 is also the withdrawn
  Optimise route's: every reader of `contract_total_payments` passes the lead's `payment_plan` to `serviceRouteForTotal` /
  `resolveAgreementRoute` / `agreementRouteLock`.
- A blank `payment_plan` on a sign-up row is the v5 offer (`paymentPlanFromRow`): rows made before plans, and findable.live
  self-service sign-ups (that site still shows £99 × 12 — separate repo, not changed). Quick Close always writes a plan
  (the plan question must be answered before a link).
- The 12-month plan needs edge secret `FINDABLE_REDUCED_MONTHLY_PRICE_ID` (a £49.99/month Price). Until it is set,
  `planAvailable` is false: Quick Close shows it switched off with the reason, and findable-checkout refuses it
  (`plan_unavailable`) before any Stripe session exists.

## The flow

1. **Quick Close**: "How do they want to pay?" after the plan (three buttons; "Show the old plan" reveals £99 × 12). Terms,
   script, link message and link email follow the plan. Written to `onboarding_responses.payment_plan`.
2. **Agreement page** (fn client-agreement): version by plan (`agreementVersionForPlan`). v6 prints "Payment plan: …" in the
   client details (part of the hashed text) and stores `client_agreement_acceptances.payment_plan`.
3. **Checkout** (fn findable-checkout): first payment per plan (£499 or £99), gate requires a signature on the plan's version
   and, for v6, for THIS plan (`signupGate` `other_plan`); Stripe line description = the plan's guarantee.
4. **Webhook**: stamps `outreach_leads.payment_plan`, contract count = the plan's; pay in full stamps `paid_in_full_at` at once
   and creates no subscription; instalment plans get a subscription on the plan's monthly Price, stopping after the last
   payment (`cancel_at`), and `paid_in_full_at` is stamped when it ends at its own term (then the existing "payments complete"
   email: site transfers, £29.99 hosting optional and manual). Backstop (`verifyV3Checkout`) checks the plan's version.
5. **After sale**: welcome pack, four-week results email, "monthly starts" and "payment failed" emails and the Paid Client
   contract line use the client's plan; legacy clients get exactly the v5 wording.

## Wording changed in this repo

AI reply fact sheet (now v6), reply playbook lines, call script + objections, cold-call playbook, voice-note price line,
Quick Close, welcome pack, results email, payment emails, Paid Client contract name. Removed: the "£99 start / £499 upfront"
price model (`priceModel.ts`, its switch and hook); its DB columns/functions remain, unused.

## NOT changed (other repo or deliberately)

- **findable.live** (repo `findable-site`): sign-up pages, pricing, `/agreement` (still v5), pre-pay screen, `/refunds`. Its
  self-service sign-up still sells £99 × 12 on v5, which is consistent end to end.
- The prospect report's offer panel (it links to findable.live's sign-up, so it still describes that offer).
- `FINDABLE_GUARANTEE` / `REMEASURE_CLAIM_SENTENCE` (byte-locked with findable.live; the v5 text). v6 uses `V6_GUARANTEE`.
- Meta templates that quote a price: `explain_offer`, `explain_offer_v2` (blocked), `re_engage` / `re_engage_49`,
  `booking_switch_barbers`. Fixed at Meta.

## Known gaps

- (Closed 2026-10-29) The v6 9A.5 reminder before the Plan Period ends is built: fn `plan-period-reminder`,
  `docs/plan-period-reminder.md` (Pay in full, 6 months and 12 months).
- Commission: initial commission is on the real first payment (£499 on pay in full); recurring on £49.99 for the 12-month plan.
  Not changed; Paul to confirm.
- Saved replies "Price" and "Pricing" (personal templates) quote retired prices and direct Stripe links.

Live Stripe steps: `docs/payment-options-live-setup.md`. Agreement: `docs/agreement-v6.md`, `docs/v6-review-for-solicitor.md`.
Tests: `scripts/payment-plans.test.ts`.
