# Paid client automation, sales handoff, delivery readiness (2026-10-02)

Branch `feat/paid-client-automation` (LeadFinderOS) + `feat/paid-client-setup-prefill` (findable-site).
**SHIPPED 2026-10-02** (Paul approved, with the READY TO SUBMIT split and the reminder under the next step):
SQL applied and read back, 9 functions deployed and bundle-checked, LeadFinderOS main `740964b9`,
findable-site master `a33b165` deployed to findable.live. Live check at the end of this file.

## What was there already (the map, re-derived 2026-10-02)

- `stripe-webhook` `checkout.session.completed` already made the Paid Client: `amount_paid`, `payment_date`,
  `status='payment_received'`, the ledger row (unique per payment intent), the seller stamp
  (`trg_outreach_leads_sold_by`), the contract count, the delayed subscription, the PAID email, the
  customer's `payment_recieved` WhatsApp. Membership of Paid Clients is `isPaidClient` — there was never a
  manual move after a Stripe payment (Mark Paid / `create_manual` are the fallbacks for money outside Stripe).
- Sales chasing already stopped on payment: `lead_is_client` removes the lead from `sales_leads` and every
  sales write; the queues skip paid leads. Next Action is human-set only, so payment does not clear it.
- READY TO START / MISSING INFORMATION (`handoffReadiness`), Quick Close, `ClientHandoffCard`, the paid
  baseline (Hook 3 + Discovery 17, approve & freeze, `startPaidBaseline`), the Welcome Pack (after the
  baseline), GBP access in three states, the domain rule.
- Gaps: no sales handoff beyond Quick Close's yes/no answers; no stage or next step; the PAID email's
  dedupe was a read of `client_error_reports` (fails open); payment drafted baseline questions from the
  plain generator BEFORE Discovery; the post-payment form asked for services and towns from scratch;
  nothing recorded the delivery workflow in History; a client with no Google profile could never be READY.

## What changed

| Piece | Where |
|---|---|
| The checklist (WAITING FOR INFORMATION / READY TO SUBMIT — READY FOR DELIVERY only after Submit, in deliveryStage; who owes each item, done/total, not-needed items) | `src/lib/handoffReadiness.ts` |
| The sales handoff (fields, prefill, completeness, who owes one) | `src/lib/salesHandoff.ts`, column `outreach_leads.sales_handoff` |
| Stage + ONE next step, filters | `src/lib/deliveryStage.ts` |
| One loader for list / page / email / submit; History writer; Submit for delivery | `supabase/functions/_shared/client-setup.ts` |
| New-client email lines | `src/lib/newClientEmail.ts` |
| Post-payment form prefill | `src/lib/setupPrefill.ts`, `findable-onboarding` `q2_prefill.known`, findable-site `OnboardingFlow.tsx` |
| Screens | `PaidClients.tsx` (cards, filters), `ClientSetupCard.tsx` (pipeline, checklist, next step, handoff, History), `SalesHandoffForm.tsx`, `QuickCloseDialog.tsx` (handoff + submit), `salesDash/MyHandoffs.tsx` |
| SQL | `supabase/migrations/20261004120000_paid_client_automation.sql` — 4 nullable columns, the History kinds, two partial unique indexes |

### Rules (also in CLAUDE.md)
- **Required vs not needed per client**: GBP is not needed only on the client's own `gbp_exists = 'no'`;
  crawl only with a site; domain only on a new-site build; the sales handoff only on a SALESPERSON's sale
  paid on/after `SALES_HANDOFF_SINCE` (Paul's own sale / older clients: not needed, never fabricated).
- **The crawl is reused while fresh** (`CRAWL_REUSE_DAYS` = the shared `CRAWL_FRESH_MS`); stale or missing →
  next step "Crawl website". Payment never crawls.
- **No questions at payment.** Order: crawl → Discovery (manual) → proposed set → approve & freeze → Run
  baseline (manual). A legacy draft made before Discovery points at "Run Discovery".
- **One new-client email per lead**: a conditional claim on `new_client_email_at` (plus the old trace for
  clients emailed before the column), released when Resend refuses. Recurring invoices send none.
- **Submit for delivery** is the only stored setup act (`delivery_submitted_at`, once), re-derived on the
  server, snapshot in History; Paul is emailed only when the seller submits.
- **History** = meaningful events only: `payment_received` (once per lead), `handoff_saved` (completion,
  then material changes), `onboarding_submitted` (first complete submission), `delivery_submitted`,
  `discovery_run`, `baseline_approved`, `baseline_run`, `build_started`, `launched` (once). `data.source` =
  system / client / sales / admin.
- **The seller may edit the handoff after payment, on their own sale only** (`sold_by_user_id`); nothing
  else on the lead. A rep's "finish the handoff" list carries no amount.
- **The post-payment form is seeded from ONE source per list** (client's answer > Sales > found on their
  website), labelled; it only fills an empty list; the client's submit is the confirmation.

## Credentials
No secure credential storage exists. Nothing in this work stores or asks for a password: website access
is "who controls it" + the client inviting us; GBP is a manager invite to Paul; `delivery_ref` has no
password field by design. Gap reported, nothing invented.

## Verification (2026-10-02)
- `npm run check`: typecheck 9 = baseline, edge syntax / undefined / import graph OK, build OK, 279/279.
- `scripts/paid-client-automation.test.ts` (98 checks) covers the brief's 35 test areas from the rules and the source.
- The migration was executed live inside a DO block ending in RAISE (rolled back): the second
  `payment_received` was refused (23505), an unknown kind refused by the CHECK, the claim took 1 row;
  read back afterwards — nothing kept.
- Screens rendered in a throwaway harness (real pages, fixture data built with the real rules) at 390 / 820
  / 1440 / 1920: no horizontal overflow at any width. Harness deleted.
- Not verifiable here: a real Stripe event end to end, the email arriving, the deployed functions.

## To ship (in this order)
1. SQL: the migration, one statement block at a time, read back.
2. Edge (closure walked with `check-import-graph --reached-by`): `stripe-webhook`, `paid-client-hub`,
   `quick-close`, `findable-onboarding`, `paid-baseline`; and for the History labels only:
   `admin-overview`, `business-summary`, `conversation-triage`, `sales-performance`.
   `paid-client-hub` BEFORE the SPA (the list shape changed).
3. SPA: merge to main (auto-deploys).
4. findable-site: `npm run deploy --branch=master` from a clean worktree of the merged branch (no CI).

## Live check (2026-10-02, fixture ZZ QA8 `10200000-0000-4000-8000-0000000002a1`, archived + excluded afterwards)
- `q2_prefill` returned the salesperson's services and towns with the 'on the phone' line; `complete_q2` saved;
  `onboarding_submitted` recorded once (a second submit added nothing).
- Admin `list`: 6 clients, each with a state, n/m and one next step; the real clients are placed by their progress
  (in delivery / ended), none sent back to waiting.
- `save_handoff` (admin): complete; History 'completed' then 'updated'; a no-change save wrote nothing.
  `submit_delivery` refused (409) naming the missing items.
- Not exercised live: a real Stripe payment (the new-client email, its claim, 'Payment received'). The first real
  payment is that proof.
