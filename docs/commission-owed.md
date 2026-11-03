# Commission owed, plan on every close, New paid clients, autosave (Paul, 2026-11-02)

Branch `feat/commission-owed-tracker`. Every number lives in `src/lib/commissionConfig.ts`. The database mirrors two of them
(`monthly_tier_rate`, `commission_payable_days`), pinned by `scripts/monthly-commission-tiers.test.ts` and `scripts/commission-owed.test.ts`.

## What existed, and what was built on it

- Money facts: `payment_ledger`, written from Stripe by `recordLedger`. Unique by Stripe object.
- The rate: stamped once per sale by the database (`stamp_monthly_commission_for`). Not changed.
- Commission: derived in `commissionLines` (`src/lib/commission.ts`), loaded by `_shared/earnings.ts`. Extended, not replaced.
- Payouts: `commission_payouts`, one figure per person per month. Too coarse to say what a person was paid for, so kept for old
  sales and joined by `commission_line_payments`.

## The rules

A ledger row has `payout_rule`. Every row present at the migration is `legacy` and keeps its numbers. New rows default to `plan_v1`
(a backfilled payment dated before `PAYOUT_RULE_PLAN_V1_FROM` stays legacy). On 2026-11-02 the ledger held 25 sales: 24 test sales at 0% and
Paul's own at £0 commission, so no real person's commission moves.

| | Plan rules (`plan_v1`) |
|---|---|
| First payment | The stamped 30/40/50% on the amount collected |
| Payable | `commission_payable_on` = UK day results sent + the client's refund window. 7 days on v7, 14 on older agreements. No backstop |
| Trailing | 20% of the next 6 monthly payments the plan has, any amount. Payable on the 1st of the next month. Pay in full: none. Hosting after the plan: none |
| Refund or lost chargeback | Earns nothing, at any time. Not yet paid: cancelled, or a partial comes off the line. Already paid: an offset, due at once |
| Open dispute | Held, in the quiet list |

Kept from before, unchanged: a sale counts on payment; only a salesperson earns; the seller-engagement rule; the client-ended rule; the
attribution hold; test sales at 0%.

The single writer of `commission_payable_on` is a trigger on `outreach_leads.remeasure_results_sent_at`. If the sender un-stamps a failed send,
the date goes too.

## Plan on the close

`payment_ledger.sale_plan` = the plan in Stripe's session, `sale_plan_picked` = what Quick Close held, `sale_plan_flag` = any mismatch
(`src/lib/salePlan.ts`). The plan id encodes both the plan and the way to pay, so only the id is stored. A monthly that is not the plan's
amount is flagged on read (`monthly_differs`).

## Commission owed (admin home) and Your payments (Sales page)

`buildOwed` (`src/lib/commissionOwed.ts`) makes one view from the same lines as the earnings page. Fn `sales-earnings`:
- `owed`: both roles. A salesperson always gets only their own, with a belt check. The admin also gets names and New paid clients.
- `mark_paid` (admin): `{ person }` or `{ item_key }`, plus `expected_total`. The server works the money out again and refuses a different total.
  `commission_record_line_payments` writes all or nothing, and a partial unique index allows one live row per line and part.
- `undo_paid` (admin): by batch, own payments, within `MARK_PAID_UNDO_HOURS`. The screen offers it for the session.

⛔ Nothing here pays anybody. It records a bank transfer Paul made.

An offset is never paid as a negative. It nets against that person's due money, and carries forward if bigger. A single line can be paid
a little early (a warning says so). An offset cannot be marked on its own.

**Complete paid up front (2026-11-03, `docs/two-plans.md`):** always 30% of the £999, £299.70, whatever its Sale Number (`COMMISSION_UPFRONT_RATE`), on the same
payable date, no trailing. v7.1 stamps v7's terms, so the 7-day window holds. Its place still counts toward the seller's tier for other sales, and the row stores the 30% it earns (see below).

## Autosave, no submit

`src/lib/autosaveQueue.ts` (the rules) and `src/hooks/useAutosaveFields.tsx`. About 800ms after typing, at once on blur, before leaving.
One request per field at a time. Failed saves retry with back-off and the text is kept in local storage until the server has it.
A reply never overwrites text being typed.

- Handoff answers: `quick-close` `save_handoff_field`, through `sales_handoff_set_field`, which merges inside one update so two tabs cannot
  overwrite each other's answers. Two tabs on the SAME answer: last write wins.
- Call notes (`save_call` with `quiet: true`): the existing revision check handles two tabs.
- Tapped answers (who runs the site, agency contract, plan, decision maker) already saved on tap. They now retry over a bad connection.

**No handover form (Paul, 2026-11-03).** The form, Send to Paul, the seller's Submit for delivery and the checklist's "Sales handoff" item are gone. Everything typed on the prospect page reaches Paul in New paid clients (`paidClientRecord.ts`), with phone and email. Saved handoff answers on older sales stay readable there, on the client page and in the new-client email. `SellerClientInfoForm` appears only when Paul has asked (`client_info_requests`), and saving it tells him. Fn quick-close keeps `save_handoff`, `save_handoff_field` and `send_to_paul` for a tab still open during the deploy; nothing in the app calls them. The promise question has no box of its own now: the Internal note placeholder asks for it.

What saves itself, about 800ms after typing stops, with the same Saved / Saving line: call answers and services/areas on the Call tab; Services and areas on the lead (`lead_set_profile` keeps one History line per edit, ten-minute window); Correct a detail (a half-typed email waits until valid or left); the trade (the box stays open, and `trade_prev` lets a save replace only what that box just saved, so a set trade is still never overwritten); an internal note (`lead_note_draft`: one row however many pauses, leaving the box finishes it, hint text "Who decides? Anything you promised? Best way to reach them?"); the older lead window's name, contact fields and private note. Escape or the cross puts back what was there on opening. ⛔ A number on a queued or already-messaged lead saves only on leaving, after its warning: the next send reads it. The website-control note saves on leaving, and a note typed in the Log window and never logged is kept as an internal note when leaving the lead. The private note says "only you", so it does not go to New paid clients. Next Action and Meeting stay explicit forms: they are decisions, not notes.

**One answer to "when do I get paid?" (Paul, 2026-11-03).** Your payments is the only panel that names dates and the only one with that name (the list of every payment is Client payments). Earned this month says "earned, not paid yet" with no date, and the pop-up points to Your payments. Screens show a sale's plan through `salePlanWordsOr`; old-plan sales keep their route name.

## Stripe is the source of truth (Paul, 2026-11-03)

The webhook writes each payment, refund (cumulative, per charge) and dispute through `recordLedger`. The plan is read from what was charged (`salePlanFromCharge`): the session's plan when the amount agrees; otherwise the one plan with that first payment (£999, £499). £99 starts several plans, so it never overrules a session: it stays and is flagged `amount_differs`. Any difference from Quick Close is `plan_differs`, and Stripe wins. Monthly amounts are flagged on read (`monthly_differs`).

**The daily check:** fn `commission-stripe-check`, cron `commission-stripe-check-daily` (04:10 UTC, `invoke_commission_stripe_check()`), rules in `src/lib/commissionReconcile.ts`, log in `commission_stripe_checks`, last run shown on Commission owed. Reads Stripe with the edge secret, pinned to API version 2024-06-20. `mode: dry_run` reads only.
- Fixes: a missed payment, refund or dispute; a refund up or down (a failed refund moves it back); a dispute's status; a blank lead or Stripe id; a wrong plan on a `plan_v1` sale whose commission is unpaid.
- Reports and never changes: a different amount on a recorded payment, a plan differing after its commission was paid, a held payment (no signature), a Findable payment with no paid lead (only `establishLeadPayment` writes paid state; replay the event from Stripe), a ledger row Stripe does not list, missing webhook events.
- A charge is placed from Stripe ids and metadata only, never an email (the older admin `backfill` mode also matches on billing email, which is why it reports before applying).

**The rate on the row:** `stamp_monthly_commission_for` stores `commission_fixed_rate_for_plan(sale_plan)` when a plan fixes one, so an up-front row holds 0.30 and keeps its place in the month. A trigger keeps the rate right if the plan is corrected. The engine still applies `commissionFixedRateForPlan`, so both agree.

**Invoices:** Stripe moved `subscription`, `payment_intent` and `charge` off the invoice in API 2025-03-31. The webhook reads both shapes (`invoiceRefs`). No real monthly has landed yet, so this was never proved against a live one; the check's `webhook` field records the endpoint's API version.

## Open

- ⚠️ `REMEASURE_RESULTS_COPY_APPROVED` is false, and no client has ever been sent four-week results. Until Paul approves that copy, every
  first-payment commission stays in Waiting, with no date.
- ⚠️ A client whose results never go (guarantee ceased, service ended early) keeps the seller waiting forever. No backstop, by Paul's decision.
- ⚠️ The sales contractor agreement (draft v2) says 5 trailing payments and an Approval Date. Paul's rules now say 6 and no fallback. It needs updating.
- On the last day of a window, a line is due while the client can still claim until midnight. A claim after paying becomes an offset.
- A guarantee claim is an email; there is no claim record. Nothing cancels the line until the refund lands in Stripe, so check for an open claim before paying.

## Proof

**Stripe check and no handover form, 2026-11-03, branch `fix/commission-stripe-and-handover`:** `scripts/commission-stripe-check.test.ts` (fixtures, totals to the penny). `supabase/tests/commission-stripe-check.sql` passed with the migration in a rolled-back transaction on the live database; read back, nothing stayed. Screens checked in headless Edge against made-up data.

**Live, 2026-11-03 (main 41ab5572).** Both migrations applied and read back. 13 functions deployed: commission-stripe-check, stripe-webhook, sales-earnings, quick-close, paid-client-hub, admin-overview, business-summary, client-intake, client-onboarding, conversation-triage, findable-onboarding, paid-baseline, sales-performance (not whatsapp-status). The live bundle holds this change's markers. Both functions refuse with 401 unauthenticated. The screens' database reads ran by SQL with no error. ⚠️ Nobody has seen Commission owed or New paid clients signed in on the live app.
Read-only check (dry_run): 4 charges, 0 disputes, 2 not ours, 0 writes, 0 plan fixes, 3 to look at: a £99 charge of 2026-09-13 and its refund with no paid lead, and the 2026-11-02 QA fixture's simulated monthly (not in Stripe; it leaves the window on its own). All required webhook events are on.
⚠️ The webhook endpoint is on Stripe API `2026-08-26.dahlia`, so invoices arrive in the newer shape. `invoice.subscription` is absent there, so before `invoiceRefs` a real monthly would have been ignored. `invoice.payments` is not sent by default, so a monthly's row has no charge id at first and a refund on it cannot be tied until the 04:10 check fills the id and the lead: a monthly refund can reach commission up to a day late. The first real monthly is the real proof.


`scripts/commission-owed.test.ts`, `scripts/autosave-queue.test.ts`, `supabase/tests/commission-owed.sql` (migration + proof in a rolled-back
transaction on the live database, 2026-11-02; read back, nothing stayed).

**Live, 2026-11-02 (migration applied, 12 functions deployed, main 3ed926b8).** Fixture `ZZ QA commission owed` (`20100000-0000-4000-8000-000000000ca1`, archived).
A simulated v7 Complete checkout through the deployed webhook: plan written, picked plan agreed, no flag, no hold, no outbound WhatsApp. On app.leadfinderos.com, signed in as the admin:
New paid clients showed it first (plan, test chip, click opens the lead). With the row temporarily stamped as earning: £29.70 due today, £19.80 "in 29 days",
Mark as paid, one confirm, £0.00, paid history, undo, back to £29.70; the row recorded who, when and how much. Then reset to `test_excluded`.
**Salesperson view, live, 2026-11-03,** signed in as `test1` (Paul's OK), the row again stamped as earning, then reset: Your payments showed £29.70, £19.80 and "in 28 days" (read from a screenshot; the script's own text check ran before the panel loaded). The server gave only their own money, no names, no client list, and refused `mark_paid` with 403 `admin_only`. No live typing test of autosave. Nobody but Claude has looked at the screens.
