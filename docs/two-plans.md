# Two plans: Findable Complete and Findable Essential (live 2026-10-30)

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

## Not changed

findable.live (separate repo): its `/agreement` page still shows v5 and its self-service sign-up still sells £99 × 12.
To sell the two plans there it reads fn findable-onboarding `plans` and sends `answers.payment_plan`
(`docs/findable-site-plan-contract.md`); `scripts/check-cross-repo-sync.mjs` now checks any `SITE_PLAN_IDS` it declares.
