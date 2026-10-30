# Hosting price £29.99 and the v7 guarantee wording sweep (2026-10-30)

Branch `fix/hosting-price-and-guarantee-wording`. Paul's brief: what we charge and what we promise match the contract.

## 1. Hosting price (Stripe, live)

- Product **Findable Hosting** `prod_VFEEg4QhqVTyGj`.
- Created **`price_1UW9a5Fi7Bp695ObRYZ7L6Um`**: £29.99 GBP, recurring monthly, lookup key `findable_hosting_monthly_2999`,
  nickname "£29.99/month Hosting and Maintenance". Now the product's default price.
- Archived **`price_1UEk3BFi7Bp695ObE7PIPYhI`** (£9.99/month). Archiving does not touch existing subscriptions.
- Edge secret `FINDABLE_HOSTING_PRICE_ID` now holds the new id (read back through Stripe: £29.99, active).
  Only `findable-checkout` reads it today (validates the website tick); the v5 month-12 hosting reminder is "reply to
  opt in", so the opt-in is still set up by hand in Stripe on the £29.99 price.
- **One client already on £9.99, left untouched:** The Lock Specialist Ltd (lead `50826b1a-74ee-41e2-a609-8652f1c5e7a6`),
  subscription `sub_1UEqTXFi7Bp695ObQfja9mkG`, customer `cus_VFL9gEoz4ewDIm`, created 2026-09-12, status active.
  Our DB does not know about it: `amount_paid` null, no `stripe_subscription_id` on the lead, no ledger row.
- How it was done: the live Stripe key exists only as an edge secret, so a one-off function `zz-hosting-price-op`
  (CRON_SECRET-gated, printed ids/amounts only) was deployed, called from SQL via `net.http_post`, then deleted.
  Never committed. Same pattern works for any future one-off Stripe object.

## 2. Guarantee wording (v7: 7 days after the results, everything paid back)

Changed to v7 (new sales sign v7):
- Quick-check report (`aiAuditReportHtml.ts`, both footers): "judged on a full 20-question measurement we run after you
  join, not on this quick check" then `V7_CLAIM_SENTENCE`. The quick check is pre-sale, so the guarantee is described as
  applying to the full measurement after joining, reworded to v7 rather than removed.
- Report no-website panel: the old single-plan line (`offerSummaryFor`, "14-day refund window") is replaced by the two
  plans (`plansReplyLine`) and `MONTHLY_START_V7_WORDS`.
- Call script (`callClose.ts`): guarantee says 7 days; build's monthly start is v7's. Optimise (pre-v5 record) keeps v3.
- Quick Close (`quickClose.ts`): the sign-up message and spoken script carry `guaranteeForPlan(plan)`; only the old plan
  or no plan keeps `FINDABLE_GUARANTEE`.
- Access Date email (`_shared/client-terms.ts`, sent from `paid-client-hub`): v7 terms get day-28-from-baseline and the
  7-day window.
- Operator / rep hints: Client timeline fallback, delivery cockpit "Results sent" hint, earnings help line.

Left as they are, on purpose:
- `FINDABLE_GUARANTEE`, `REMEASURE_CLAIM_SENTENCE` (v5, 14 days, £99): byte-locked to findable.live, which still sells
  the v5 self-service sign-up. They remain correct for v5 signers and the old staff-only plan.
- The four-week results email, welcome pack and checkout were already version-aware (v7 7 days, v6/v5 14 days).
- Signed agreement texts (never edited). AI reply facts were already v7 (no window named, everything paid back).

findable.live (not touched, separate repo): `src/lib/site.ts` `GUARANTEE` (line ~279) and `REFUND_CLAIM_SENTENCE`
(line 328) say 14 days / £99, rendered on the home page, `/refunds`, Guarantee, ProofSection, WhatWeDo, GetStartedFab and
OnboardingFlow. Correct only while the site sells v5. Changing them means changing V1's locked copies in the same pass.

### Second pass (same day): when the 7 days start

Paul: say the 7 days start when we SEND the four-week audit results, not from sign-up, as findable.live now does
(site commit `92dec7f`, Guarantee.astro / refunds.astro / `PAYMENT_START_SHORT`).
- `V7_CLAIM_SENTENCE` → "...email us within 7 days of the date we send your four-week audit results and we'll refund
  everything you have paid us." Feeds `V7_GUARANTEE`, so the Stripe line-item description (`guaranteeForPlan`), Quick
  Close, the report and the cold-call playbook all change with it. ⚠️ The Stripe description is now ~280 characters;
  the longest proven untruncated was 236, so read the first real hosted Checkout page.
- `MONTHLY_START_V7_WORDS` → "the day after your refund window closes, 7 days after we send your four-week audit
  results (normally 36 days after your baseline audit)". Feeds the Stripe card-saved custom text, welcome pack, sign-up
  summary, plan terms and call script.
- Welcome pack (v7): the signed key point is printed unchanged, then `V7_WINDOW_START_LINE` (findable.live /refunds'
  sentence: "The 7 days start on the date we send you your four-week audit results, not on the day you sign up.").
- Four-week results email (v7 only): "...of the date we send your four-week audit results (the date of this email)".
- Access Date email (v7): "the 7 days after the date we send your four-week audit results, not from the day you signed up".
- Headline "We improve AI visibility or you get your money back" unchanged. Agreement texts untouched.

## 3. Housekeeping

- Onboarding rows `5f7107cf`, `eb0a6242`, `eb612f23`, `54ed5a20`, `fc293e4e` (lead `e33f9c57…`, "ZZ TEST two plans"):
  `status` `submitted` → `archived`. The table has no archive column; readers only test for `paid`. Not deleted.
  ⚠️ `client-agreement` picks the latest row with `status <> 'paid'`, so it can still pick one of these for that test lead.
- `scripts/check-cross-repo-sync.mjs` `readIdArray`: whitespace before `:` / `=` is allowed (`SITE_PLAN_IDS = [`).
