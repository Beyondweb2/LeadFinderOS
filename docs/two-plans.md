# Two plans: Findable Complete and Findable Essential (live 2026-10-30)

> **2026-11-03: Findable Complete can be paid up front.** See "Complete paid up front" at the end. Agreement is now **v7.1**
> for new signatures on both plans (`docs/agreement-v7.1.md`); anyone who signed v7 stays on v7.

Paul, 2026-10-30: "V1 sells two plans." Branch `feat/two-plans`. Agreement v7 (`docs/agreement-v7.md`,
`docs/v7-review-for-solicitor.md`). Plan module: `src/lib/paymentPlans.ts`. Before this: `docs/payment-options.md` (v6).

## The plans

| Plan | Plan id(s) | Paid | Agreement |
|---|---|---|---|
| **Findable Complete** (recommended, first) | `complete` | £99 at sign-up, then 11 × £99 (12 payments, £1,188) | v7 |
| **Findable Essential** | `full` / `six` / `twelve` | £499 once / £99 × 6 / £99 then 11 × £49.99 (unchanged from v6) | v7 |
| Old plan (staff only, "Show the old plan") | `legacy_twelve` | £99 × 12 | v5 |

- `planProduct(p)` says which plan an id is. Every plan is route Build.
- Complete adds (`COMPLETE_EXTRAS`, agreement v7 2.8 to 2.11): review replies, Google Business Profile, directories,
  changes within reason (fair use: small edits, not rebuilds), monthly audits. Hosting included while paying.
- Essential (`ESSENTIAL_SUMMARY`): an AI-optimised website plus a baseline audit and a four-week audit. Never "just the website".
- **The old staff-only plan is kept**: findable.live's self-service sign-up still sends no plan, and a blank plan is the v5
  £99 × 12 offer. Removing it would break that site's links.

## Stripe

- **No new Stripe Price.** Complete reuses the existing £99/month Price (edge secret `FINDABLE_STANDARD_MONTHLY_PRICE_ID`,
  the one the 6-month plan and the old plan use). The webhook reads the Price back and refuses unless it is exactly £99/month.
- The first £99 is charged inline at checkout, as for every plan. The monthly subscription is created at checkout on a
  365-day hold (`PAYMENT_START_HOLD_DAYS`) and its first charge is set later (below). It stops after 11 monthly payments
  (`cancel_at`).

## The v7 guarantee clock (both plans)

Day 0 = the day the baseline audit is completed (`ai_audits.baseline_completed_at` of the lead's baseline). Results due
day 28. Refund Window = 7 days after the Results Date. Payment Start Date = the day after the window = **day 36** when the
results go out on time (`clientTimeline.paymentStartV7`).

- **No baseline yet → nothing scheduled.** Shows on What needs you (`payment_waits_baseline`, or `setup_not_started` when
  no baseline exists) and as the `baseline_not_taken` timeline notice.
- **Who sets Stripe:** fn `cron-run` (daily) task `v7PaymentStarts` → `scheduleV7PaymentStarts` → `schedulePaymentStart`
  (moves the trialing subscription's `trial_end`, reads it back). Also the results sender and Paul's "Set" button, as before.
- **Late results:** from 3 days before day 36 (`V7_SLIDE_LEAD_DAYS`), while results are unsent, the provisional date slides
  to today + 3 + 7 + 1 each day, so no monthly can be charged before the client has had 7 days with the results. Once the
  results are sent: max(day 36, Results Date + 8). ⚠️ This relies on the daily cron. If cron-run stops for 3+ days around
  day 33 to 36 with results unsent, Stripe would charge on day 36.
- **What v6 did, kept for v6 clients:** first monthly = Results Date + 15 (14-day window), set only when the results are
  sent. v6 and v7 both take the first payment (£99 or £499) at checkout; v7 only changes when the MONTHLIES start.
- **Pay in full (Essential):** £499 at checkout, no subscription, refundable under the guarantee. Unchanged from v6.

## Fixed on the way

- 🔴 `planPaymentStart` re-set Stripe's `cancel_at` from the ROUTE's count (11 monthly payments) instead of the PLAN's when
  the Payment Start Date was written. A v6 6-month client would have been billed 11 monthly payments instead of 5.
  `loadTimelineFacts` now passes the plan's count (`recurringPaymentsNeeded`). No 6-month client had paid yet.
- A Stripe session created on v6 before this deploy that completes afterwards is verified against v6 (`payment-hold.ts`),
  not held.

## Where the plan reaches

Quick Close (Complete first, labelled recommended; never pre-answered), agreement page (v7, plan printed in Client
Details), checkout (line name, card notice, guarantee), webhook (plan stamped, subscription on the plan), welcome pack
(Complete extras, v7 key points and guarantee), four-week results email (7-day window for v7; still held behind
`REMEASURE_RESULTS_COPY_APPROVED`), Plan Period reminder (Complete included), What needs you, AI reply fact sheet, call
script, cold-call playbook, voice note price line, public plan list (fn findable-onboarding `plans`: now returns
`product` and `recommended`).

## Hosting

Complete includes hosting while paying (v7 9.2). Essential unchanged (while paying; pay in full 6 months from go-live).
⚠️ **Mismatch, not changed (Paul flagged it):** the agreement and the app say optional hosting after the Plan Period is
£29.99/month (`FINDABLE_CONTINUING_GBP`); Stripe has a £9.99 hosting price. Opting in is manual today, so nothing charges
either automatically. Paul to decide which is right.

## Complete paid up front (Paul, 2026-11-03, branch `feat/complete-upfront`)

Plan id `complete_upfront`: £999 once (`COMPLETE_UPFRONT_GBP`), saves £189 against £99 × 12 (`completeUpfrontSavingGbp`, derived).
Same inclusions and guarantee as Complete. Monthly Complete is unchanged and stays the default.

| What | How |
|---|---|
| Charge | Inline `price_data` at checkout, exactly as Pay in full. No subscription, card not kept. |
| Stripe Price object | **None.** Paul asked for a Price; a one-off dashboard Price cannot carry the guarantee as its line description (`scripts/stripe-payment-options-setup.ts` header) and there is no live Stripe key on this machine (edge secret only). Inline needs no setup and touches nothing existing. |
| Agreement | v7.1, new signatures on every Complete and Essential plan. Terms stamp stays `csa_v7_two_plans`, because the clock is identical, so the commission payable days and `isV7Terms` do not move. Ask `isV7Family`, never `=== 'v7'`. |
| Unpaid v7 signatures | Asked to re-sign on v7.1 when they reopen the link (same rule as v6 to v7). A Stripe session already open on v7 still completes on v7 (`payment-hold.ts`). |
| Website transfer | ⛔ At the END of the 12 months (v7.1 8.4), not on payment. The webhook does not stamp `paid_in_full_at` for it (`planTransfersAtPayment`). If the agreement ends sooner the site transfers then, except on a valid guarantee claim. |
| Plan Period, hosting | 12 months from the date the payment cleared. The Plan Period reminder runs from that date (`planPeriodEnd`). |
| Commission | Always 30% of the £999, £299.70, whatever its Sale Number (`COMMISSION_UPFRONT_RATE`, Paul 2026-11-03). It still counts toward the seller's monthly tier for other sales, and the ledger row stores the 30%. Payable on `commission_payable_on`, no trailing (`commission-owed.test.ts`). |
| Sale record | `sale_plan = complete_upfront`, which `salePlanParts` shows as "Complete · paid up front". The id holds both the plan and the option; no extra column. |

⚠️ Open for Jess (`docs/v7-review-for-solicitor.md`): whether any of the £999 comes back on early exit or on our serious breach (15.3 gives an
up-front client nothing today), and when the 12 months start.

⚠️ Tested with no real Stripe session: there is no Stripe test key on this machine. Proof is the plan tests, the gate tests and
`scripts/qa-simulate-payment.ts`.

## findable.live

The site sells both plans through fn findable-onboarding `plans` and `answers.payment_plan`
(`docs/findable-site-plan-contract.md`); `scripts/check-cross-repo-sync.mjs` checks its `SITE_PLAN_IDS`.
