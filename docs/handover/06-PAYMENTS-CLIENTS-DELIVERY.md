# 06 — Payments, clients and delivery

*Live since the certified pre-sales release (2026-10-05, `c5c4a1b5`) and Sales workspace v2. Records:
`docs/pre-sales-certification/fixes-02-quick-close.md`, `fixes-03-payment-client.md`, `wave1-integration.md`,
`docs/paid-client-automation.md`, `docs/client-agreement.md`, `docs/welcome-pack-and-website-build.md`.*

## The journey

```
Quick Close (salesperson, Close tab)
  → £99 Stripe Checkout (findable-checkout)
  → stripe-webhook: payment recorded once → the lead becomes a Paid Client
  → Paul's first contact (owed from the activation stamp)
  → onboarding (setup link / form, client agreement)
  → delivery: crawl → Discovery → approve the 20 → baseline → Website Build or page work
  → day-28 replay → results email (HELD) → guarantee decision
  → monthly payments (Stripe subscription, trial ends 42 days after sign-up)
```

## 1. Quick Close → payment

- `src/lib/quickClose.ts` + fn `quick-close` (see `03-SALES-WORKFLOW.md` for the questions). It writes the route
  (`plan_tier`) and answers onto the SAME onboarding row (locked find-or-create), then calls the EXISTING
  `findable-checkout` with the row + lead only — **the browser never decides a price**.
- `findable-checkout` refuses: an undecided route (`route_undecided`), a blocked serve-gate row, an unresolved domain on a
  self-service Build (Quick Close rows its own gate cleared skip this), and any closed client (`quickCloseClosedRefusal`:
  money already, paid-or-beyond status, refunded, ended — one rule shared with Quick Close).
- The Stripe page names the route's payment count; the session metadata carries the route. Checkout includes the client
  agreement tick (binding acceptance, write-once evidence tables, signed PDF emailed).
- One current link per lead, 24-hour session; expired links never shown as ready; Copy is recorded as copied (never "sent").
- QA: payment success in tests is `scripts/qa-simulate-payment.ts` — never a real card, never Stripe test mode on live.

## 2. Payment → Paid Client (`stripe-webhook`)

**Payment replay safety** (`src/lib/paymentState.ts` → `_shared/payment-state.ts`):

- Only `establishLeadPayment` writes the paid state, as **conditions on the UPDATE** (the database decides): a payment may
  establish "paid" only on a lead with no money that is neither refunded nor ended. It returns `first` (this delivery won)
  or `replay` (state left exactly as it was).
- `payment_date` = the Stripe event's day, so retries are stable; Stripe customer / payment-intent ids are filled only where
  blank.
- Everything downstream (WhatsApp confirmation, new-client email, contract stamp, subscription) runs only for the delivery
  that won. Every replay writes a `payment_replay_state_kept` row to `client_error_reports`.
- Payment state is **monotonic**: a replay never moves a client backwards.

**Subscription idempotency** (`_shared/delayed-subscription.ts`):

1. A **claim on the lead** — a conditional write of `subscription_claim = <checkout session id>` while the claim and
   `stripe_subscription_id` are blank and the client is open. One checkout owns a lead's subscription; a second is refused.
2. **`Idempotency-Key: findable-monthly-<checkout session id>`** on Stripe's create — a concurrent re-delivery gets 409 and
   stands down; a crash retry gets the same subscription back. Parameters are deterministic (event time, not "now").

- Fails closed: if the claim can't be written, nothing is created and the PAID email says to set it up by hand.
- The subscription starts after a trial ending `firstRecurringPaymentIso(sign-up)` = **sign-up + 42 days**, and ends via
  `cancel_at` after `recurringPaymentsFor(route)` charges (**11** for Build, **5** for Optimise). The route comes from the
  SESSION (`resolvePaidRoute`); a mismatch is refused and Paul told.
- `outreach_leads.contract_total_payments` stamps the contract (12 / 6); NULL = not recorded — a pre-route client is never
  given a 12 or 6. Triggers lock it.
- ⚠️ The idempotency behaviour is coded to Stripe's documented behaviour; **the first genuine payment is still a watched
  event** — it has never run against a real customer since this release.

**Ended-client terminal state** — a paid client's service ends ONCE: `service_terminated_at` + `service_termination_reason`
(paid-client-hub `terminate_service`; words in `src/lib/serviceEnd.ts`). `client_ended_early` = the client stopped (shows
COMPLETED); `domain_authority_dispute` = Findable ended it (ENDED). An ended or refunded client gets: no subscription, no
active/trialing status from a late invoice (the money is still recorded in the ledger and Paul is told to cancel in
Stripe), no delivery work, no re-measure, no results, no monthly update, no agreement workflows, no future commission. Ending
never touches money — Paul cancels a live subscription in Stripe himself. `refunded` is the one status that removes a lead
from revenue (and keeps the amount).

## 3. First contact — Paul owns it

- `src/lib/firstContact.ts`: owed only from the **activation stamp** `outreach_leads.first_contact_owed_since`, written by
  `stripe-webhook` on the payment that made them a client. Never a hard-coded day; historical clients are never "overdue".
- The one next step: **"Introduce yourself and send the setup link — by <day>"**, due `FIRST_CONTACT_WORKING_DAYS` working
  days after payment (weekends and England & Wales bank holidays skipped); the seller sees the same due day.
- Recorded once via paid-client-hub `record_first_contact` (phone / email / WhatsApp / other) → `client_contacted_at/_by/_via`.
  Paul gets one bell notification and the new-client email opens with "FIRST CONTACT IS YOURS … by <day>".
- One new-client email per lead (claim on `new_client_email_at`).

## 4. Onboarding and setup

- The salesperson's handoff (`outreach_leads.sales_handoff`, written only by quick-close `save_handoff`, seller-only after
  payment). The seller is `sold_by_user_id`, stamped once at payment.
- Stage + ONE next step = `deliveryStage` (derived): **WAITING FOR INFORMATION / READY TO SUBMIT** (`handoffReadiness`) →
  **READY FOR DELIVERY** (after Submit for delivery, `delivery_submitted_at`). One rule for Paid Clients, the client page,
  the new-client email and Submit (`_shared/client-setup.ts`).
- **Build vs Optimise blockers** (`handoffReadiness.ts`, route = what they PAID on): **Build** never needs an existing
  website or a website login (an old site is shown for reference only). **Optimise** still needs the real site and access.
  Unknown route: the older rule. Not-needed items never block (no GBP = `gbp_exists='no'` only).
- Consents are preserved: a save that would turn a stored consent from true to false is refused (`409
  would_clear_consents`).
- The agreement route locks at the first binding fact (a stamped contract or any acceptance) — `409 route_locked`.
- Payment never crawls and drafts no questions: crawl → Discovery (manual) → approve & freeze the 20 → run baseline (manual)
  (`02-AI-VISIBILITY-METHODOLOGY.md`).

## 5. Welcome Pack

- Public link `findable.live/w/<code>` (the baseline audit's short code) + operator download; one builder
  `_shared/welcome-pack-render.ts`; resolves from `outreach_leads.baseline_audit_id` ONLY (never "the newest audit").
- **Ownership wording per route** (`AGREEMENT_KEY_POINTS`):
  - Build: 12 payments; "We build, host and manage your new website during the term."; "We own the website and our work
    until your final payment."; we can take down the site we built for non-payment, telling them first.
  - Optimise: 6 payments; "Your website is always yours. We will never take it offline."; pages and content we add become
    theirs on the final payment.
  - Unknown route: no ownership or take-down terms at all. The guarantee line is identical on all three.
- **SEO grade** (`seoStyle: 'pack'`, Paul 2026-10-04): a **separate supporting website metric** — the measured grade as
  Before, an After only when genuinely re-scanned ("After — not measured yet"), with words saying it is separate from AI
  visibility. **It is NOT the AI guarantee metric.** Never a projected grade, never the money-back number. Never claim an
  SEO score anywhere else.

## 6. Delivery and remeasure

- Website Build (`05-WEBSITE-BUILD.md`) for Build clients; the page generator / page-plan queue for Optimise.
- The monthly client update (paid client page step 8) is prepared and sent **by hand**; only its measurement paragraph is
  generated from stored weekly-check counts.
- Day-28 replay and the guarantee decision: `02-AI-VISIBILITY-METHODOLOGY.md`.
- **Results-email approval hold:** `REMEASURE_RESULTS_COPY_APPROVED = false` — nothing is sent until Paul approves the exact
  copy (`final-certification.md` §8: three versions — clear improvement / inside the 5-point band / fell; signed "Paul,
  Findable"; the not-gone-up versions name no upcoming payment). Then a deliberate commit flips the constant and redeploys
  every function reaching the sender (`paid-baseline`, `process-ai-audit-queue`, `render-remeasure-results`).
- Billing and the claim window are two clocks: billing = sign-up + 42 days (Stripe trial); claim window = results + 14 days.
- At the end of the route's payments: `subscriptionEndedByTerm` → the term-complete email; ownership words only for a site
  Findable built.

## 7. Commission (from the payment ledger, never a CRM status)

`payment_ledger` (written by `stripe-webhook` + admin backfill) → the database stamps the monthly-ladder place and rate once;
20% × the next 6 succeeded recurring payments; reversed by refund / chargeback; ended engagement → 0% for later payments; test
accounts / leads stamped `test_excluded`. `docs/sales-page-monthly-commission.md`.

## Manual Stripe items still open

- Deactivate the two old Stripe Payment Links from Paul's old "Pricing" text.
- Check MCL's Stripe customer once for any subscription / schedule.
(Claude has no Stripe access — these are Paul's.)
