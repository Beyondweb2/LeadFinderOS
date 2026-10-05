# Fix workstream 3 — payment, client state and client documents

- **Date:** Sunday 4 October 2026. **Branch:** `fix/03-payment-client-state`, cut from `origin/main` `c0e85078`
  (proved equal before branching). **Not merged. Not deployed. No SQL run against the live database except
  read-only SELECTs.**
- **Inputs:** `cert/master-launch-plan` (updated: Ronnie closed 4 Oct), `cert/b-close-payment`,
  `cert/e-security-reliability`.
- **Master findings closed in code:** M-016, M-017, M-018, M-019, M-020, M-021, M-024 (wording + SEO grade),
  the ended-client guards (E-17 and the monthly-update refusal), E-16 (test recurring commission),
  M-023 (server guard only). **Not in this branch:** M-022, M-025, M-046–M-049 (see *Not done*).

---

## 1. Replay safety (M-016 / E-02 / B-15)

**Before:** every delivery of `checkout.session.completed` wrote `status = payment_received`, `amount_paid`,
`payment_date = now` and `paid_for`, unconditionally, and moved the onboarding row back to `paid`.

**Now:**
- `src/lib/paymentState.ts` is the one rule. A payment may establish the paid state only on a lead with no
  money (`amount_paid` null or ≤ 0) that is neither refunded nor ended.
- `supabase/functions/_shared/payment-state.ts` applies it **as filters on the UPDATE**, so the database
  decides, not a read:
  - `establishLeadPayment` returns `first` (this delivery won) or `replay` (state left exactly as it was).
  - `markOnboardingPaid` moves a row to `paid` only from a non-paid status.
  - A row that does not exist still throws, so Stripe retries (the old `mustWrite` contract).
- `payment_date` is the **event's** day (`event.created`), so even the first write is stable across retries.
  (`payment_date` is a DATE column, read live.)
- Stripe customer / payment-intent ids are filled **only where blank**. The first payment's intent is never
  replaced, so a later refund still resolves to the right payment.
- Everything downstream of the payment keys on the new facts:
  - WhatsApp confirmation: only the delivery that won (`firstPayment`). Before, two concurrent first
    deliveries could both pass the old `!alreadyPaid` read.
  - New-client email: only for the payment this checkout made (`ownsPayment`), on top of its existing claim.
  - Contract stamp and subscription: only `ownsPayment`.
  - For a **closed** client (ended or refunded) a replay starts nothing: no agreement acceptance or PDF, no
    `baseline_status` initialise, no baseline start, no subscription, no new-client email.
- Every replay writes a `payment_replay_state_kept` row to `client_error_reports` (status and date kept,
  closed or not), so a replay is visible, not silent.

Proved by `scripts/payment-client-state.test.ts` §1 (in-memory PostgREST fake):
- 5 deliveries → `first,replay,replay,replay,replay`, one ledger row, date unchanged;
- 3 concurrent first deliveries → exactly one `first`;
- `in_delivery`, `refunded` and ended fixtures are byte-identical after 5 replays, onboarding rows not moved back;
- a Ronnie-shaped ended fixture (£49.99, 17 Aug) keeps amount, date, status and end mark.

## 2. Subscription safety (M-017 / E-03)

`_shared/delayed-subscription.ts` now has two locks:

1. **A claim on the lead** (`claimSubscription`). It is a conditional write of `subscription_claim = <checkout
   session id>`, made only while the claim and `stripe_subscription_id` are both blank and the client is
   open. One checkout can own a lead's subscription. A **second checkout** for the same lead is refused.
2. **`Idempotency-Key: findable-monthly-<checkout session id>`** on Stripe's subscription create:
   - a concurrent re-delivery of the same checkout gets Stripe's 409 and stands down (`skipped`, no false
     alarm);
   - a retry after a crash gets the **same** subscription back.
   - The parameters are now deterministic: the sign-up instant is the event's time, not `new Date()`. Without
     that, Stripe refuses a reused key with different parameters.
   - The checkout session id is also in the subscription's metadata.

Also:
- **Fails closed:** if the claim cannot be written (for example, the column is not migrated yet), nothing is
  created. The PAID email already says "NO MONTHLY SCHEDULE WAS CREATED … set it up by hand".
- **Closed clients:** an ended or refunded client is refused before any claim or Stripe call.
- **Stored subscription id:** written only over a blank or the same id.

Proved in §2 with a fake Stripe that honours idempotency keys:
- two simultaneous deliveries → **1 subscription**, outcomes `created` + `skipped`, the same key and an
  identical body on every call;
- a crash retry → same `sub_1`;
- a stored id → no Stripe call;
- a second checkout → refused;
- ended and refunded → no claim, no call;
- a broken claim → nothing created.

⚠️ The Idempotency-Key behaviour (24 h key window, 409 while in flight, refusal on changed parameters) is
coded to Stripe's documented behaviour. It was **not** exercised against real Stripe; the QA simulation has no
customer. The first genuine payment stays a watched event (master plan).

## 3. Ended-client safety (E-17 and the master plan's seven rows)

| An ended client must not… | How | Proof |
|---|---|---|
| be reactivated by a payment replay | §1: state never moves; `markOnboardingPaid` never moves a `completed` row back | §1 + §3 Ronnie-shaped fixture |
| earn future recurring commission | `commission.ts`: a recurring payment at/after `service_terminated_at` earns 0%, flagged `afterClientEnded`; nothing projected for an ended **or refunded** client. Both loaders pass it (`_shared/earnings.ts` for Earnings, Sales and Admin; `_shared/payment-ledger.ts` for the "commission earned" alert) | §3 commission block |
| become subscription-active from a late invoice | `setFindableSubscription` withholds `active`/`trialing` from a closed client (`maySetSubscriptionStatus`). Stopping statuses are still recorded. `invoice.paid` still records the money in the ledger (it is a fact) and notifies Paul once per invoice: "Payment after the engagement ended… cancel in Stripe, decide on a refund" | §3 |
| get a monthly subscription at all | `subscriptionRefusal` before any claim | §2 |
| receive delivery work | `deliveryStage` = ended, no next step, never "Needs attention" (unchanged, re-asserted); first contact cannot be recorded | §3 |
| receive remeasurement | the firer's `service_terminated_at is null` / `status <> refunded` filters (unchanged, asserted on the source) | §3 |
| receive a monthly update | migration re-creates `monthly_update_save` / `monthly_update_mark_sent` with `service_ended` / `refunded` refusals; panel shows the reason in words | §3 |
| trigger agreement / reminder workflows | hub refuses `agreement_set_route` / `agreement_send_link` (`client_closed`); public agree page takes no new signature (a copy they already signed stays readable); webhook replay creates no checkout acceptance | §3 |
| create new future revenue expectation | commission projection 0 (above); no subscription | §3 |

Historic money is untouched: the ledger is write-once; the initial commission and any monthly earned before
the end keep their value (§3 asserts both).

**Also (E-16):** a test lead's **monthly** payments now earn 0%, like its initial one (stamped `test_excluded`),
and project nothing.

### Live read-back (read-only SQL, 4 Oct 2026)
- **Ronnie** (`0ff7954f…`):
  - closed by Paul at 10:20 UTC: `service_terminated_at` set, reason `client_ended_early`;
  - `amount_paid` 49.99, `status` `payment_received` (not refunded);
  - no `stripe_subscription_id`, no ledger rows (paid before the ledger existed), no monthly updates;
  - **the re-measure firer's exact filters return 0 rows for him on 13 Oct**; no `remeasure` audit exists.
  - Nothing was changed.
- **MCL** (`6d0585ac…`):
  - ended `client_ended_early` on 3 Oct;
  - **no `stripe_subscription_id` stored**; one ledger row (£99).
  - Stripe itself was **not** checked (no Stripe access from here). **Paul: look once in Stripe for any
    subscription or schedule on MCL's customer.**
- **RG:** `refunded`, no subscription. The replay can no longer move it out of `refunded`.

## 4. Post-payment owner and workflow (M-018 / B-07)

**Owner: Findable (Paul).** The salesperson's handoff is unchanged.

- **`src/lib/firstContact.ts`**:
  - until Paul records first contact, a client paid on or after `FIRST_CONTACT_SINCE` is **WAITING FOR
    FINDABLE**;
  - the one next step is **"Introduce yourself and send the setup link — by <day>"**, due
    `FIRST_CONTACT_WORKING_DAYS` working days after the payment day (weekends and England & Wales bank
    holidays skipped);
  - after the due day it becomes "overdue since …".
  - Derived, never stored. Older clients and clients with no payment day are "not recorded before" and are
    never chased.
- **The stored act:** `outreach_leads.client_contacted_at / _by / _via`, written once by paid-client-hub
  `record_first_contact` (phone / email / WhatsApp / other).
  - It is refused for an ended or refunded client.
  - History gets a `contact_logged` line (an existing kind, so no constraint change).
- **Paid Client page** (`ClientSetupCard`): a "First contact is yours" panel with the due day, Copy client
  setup link, and **Done by phone / email / WhatsApp**.
- **Paul's notification:**
  - on the payment that made them a client, one bell notification "Introduce yourself: <business>", due date
    in the body, deep-linked to the setup section, deduped per lead;
  - the new-client email now opens with "FIRST CONTACT IS YOURS … by <day>" and always carries the setup link
    while contact is owed;
  - the Admin dashboard's "new clients need you" already reads this next step.
- **No ambiguous "waiting for client"** before we have asked them for anything: the contact step comes first.

⚠️ **Notification kind:** `notifications_kind_check` (live) has no first-contact kind, so these use the
allowed `client_paid` kind with a clear title. A dedicated kind needs that CHECK widened; I did not do that,
because other workstreams may widen the same constraint.

## 5. Build false blockers (M-019 / B-05)

`handoffReadiness.ts` is route-aware. The route is what they **paid** on (`contract_total_payments`), else
the onboarding row's.
- **Build:** "Website" and "Website access / control" are **not needed**. An old site, if any, is shown for
  reference. A Build client never needs an existing website or a login.
- **Optimise:** both stay required.
- **Unknown route:** the old rule, plus two positive "no website" signals that Quick Close writes
  (`website_platform = 'no_website'`, Quick Close `answers.manager = 'no_website'`).
- `_shared/client-setup.ts` reads `contract_total_payments` and `website_platform`, and uses the same paid
  route for the stage label.

Proved in §4: the B1 shape, a Build client with an old site and no login, the Quick-Close-only signal,
Optimise with no site, Optimise with no controller, and an unknown route.

## 6. Consent preservation (M-020 / B-06)

- **`answersFromRecords`** now reads Quick Close's answers back:
  - `owner_only` → "No, I look after it myself";
  - `website_platform = no_website` → "I haven't got a website".
  - So the form opens on the right branch.
- **`changedOnboardingPatch`:** an operator save of an existing row writes only the column groups whose
  answers changed against what the row already says. Provenance is always stamped and `incomplete` is
  recomputed. Adding a service no longer rewrites the site or domain answers.
- **`consentsCleared` + the hub:** a save that would turn a stored consent (`authority_confirmed`,
  `dns_permission`, `materials_confirmed`) from true to anything else is refused with `409
  would_clear_consents`. The dialog then asks Paul to confirm the client withdrew it.

Proved in §4b with the B1 replay:
- the consents are not in the patch at all;
- services and town are saved;
- an untouched save writes provenance only (plus the name and town the form pre-filled from the lead);
- an explicit switch to Optimise is detected.

## 7. Welcome Pack route wording (M-024 / B-08 / B-25)

The agreement key points are now **per route** (`AGREEMENT_KEY_POINTS`). Each says only what that route's
agreement says (clauses 3.3, 8, 9.4).
- **Build:** 12 payments; "We build, host and manage your new website during the term."; ownership until the
  final payment; "we can take down the website we built … We will tell you first."
- **Optimise:** 6 payments; "Your website is always yours. We will never take it offline."; "The pages and
  content we add become yours on your final payment."; on late payment "we can remove the pages and content
  we added".
  - **No ownership claim and no take-down of their site.**
- **Unknown route:** no ownership or take-down terms at all.
- **The guarantee line** is identical on all three.
- **"What you get":**
  - Build: "A new website, built and hosted by us."
  - Optimise: "Clearer pages on your own website … Your website stays yours."
- **The pack's route:** what they paid on, else the agreement link (`resolveAgreementRoute`).
- **SEO letter grade removed from the pack** (`seoStyle: 'issues'`). This is the plan's default pending
  **Paul's ruling**. One line restores it if he wants the grade.

## 8. Agreement route integrity (M-021 / B-11)

**`src/lib/agreementRoute.ts`:**
- **What they paid on outranks the link.** The public agree page, the hub status and the pack all use
  `resolveAgreementRoute`.
- **The route locks at the first binding fact:** a stamped contract **or any acceptance** (checkout
  included). After that `agreement_set_route` may only re-set the same route. Any other request answers
  `409 route_locked` with a sentence naming the Stripe step a real correction needs.
- If the binding records disagree, nothing can be switched in the app.
- The client page disables the other button and shows the reason.

Unchanged and asserted:
- acceptances are write-once (live triggers `acceptances_no_update_delete` and `acceptances_no_truncate`, read
  back);
- the hub never writes an acceptance;
- the signed PDF is rebuilt from the stored record.

**Not built:** a "correct the route" admin action. A genuine correction needs the Stripe schedule and the
immutable `contract_total_payments` changed together, which is Paul's Stripe action plus a reviewed SQL
statement. The refusal says so.

## 9. Refund / commission / late payment — verified

- **Refunded revenue excluded:** `isPaidLead` is unchanged; replay can no longer un-refund. Covered in §1.
- **Late replay doesn't re-count revenue:** ledger unique key; state not moved. Covered in §1.
- **Ended-client invoice earns no commission:** covered in §3.
- **QA / test recurring payments excluded:** covered in §3, E-16.
- **Refund creates no future expected revenue:** commission projection 0 for refunded clients; no
  subscription for refunded clients. Covered in §2 and §3.

## Also in this branch

- **M-023:** `create_manual` refuses a matched lead that already carries money, or is ended or refunded
  (`409 already_paid`).
- **Not done:** the UI's £49.99 default; the search excluding paid leads.

---

## Tests

- **New:** `scripts/payment-client-state.test.ts` — 126 assertions in six sections, all passing. It uses
  `scripts/fake-supabase.ts`, a small in-memory PostgREST stand-in that is not a suite itself.
- **Updated** (they pinned the old code shape; each still asserts the same intent):
  - `paid-client-automation`
  - `payment-email-guard`
  - `sales-notifications`
  - `sales-readiness`
  - `service-route-terms`
  - `welcome-pack-content` (now per-route key points, plus "no ownership terms when the route is unknown")
- **`npm run check`:** typecheck 9 = baseline 9, edge syntax OK, edge names OK, import graph OK, build OK,
  **296/296 suites passed**.
- **Best-effort Deno-free type pass** over the touched edge files (strict tsc with a Deno/esm shim):
  - it caught one real narrowing error in the webhook, now fixed;
  - the remaining errors are the same set `main` has.
  - Deno itself is not installed, so the deploy's own `deno check` is still the real gate.

## Files changed

**New:**
- `src/lib/paymentState.ts`
- `src/lib/firstContact.ts`
- `src/lib/agreementRoute.ts`
- `supabase/functions/_shared/payment-state.ts`
- `supabase/migrations/20261007030000_payment_client_state.sql`
- `scripts/payment-client-state.test.ts`
- `scripts/fake-supabase.ts`
- this document

**Changed:**
- **Edge functions:** `stripe-webhook/index.ts`, `paid-client-hub/index.ts`, `client-agreement/index.ts`
- **Shared edge modules:** `_shared/delayed-subscription.ts`, `_shared/client-setup.ts`, `_shared/earnings.ts`,
  `_shared/payment-ledger.ts`, `_shared/welcome-pack-render.ts`
- **Rules:** `src/lib/commission.ts`, `deliveryStage.ts`, `handoffReadiness.ts`, `manualOnboarding.ts`,
  `newClientEmail.ts`, `welcomePackHtml.ts`
- **Screens:** `src/components/ClientSetupCard.tsx`, `ManualOnboardingDialog.tsx`, `MonthlyUpdatePanel.tsx`,
  `src/pages/ClientHub.tsx`
- **Tests:** the six updated suites above

## Deploying it (when Paul says so — nothing here was deployed)

1. **SQL first**, one statement at a time, then read back:
   - `20261007030000_payment_client_state.sql`: five additive columns, one CHECK, two re-created functions;
     nothing dropped, no row changed;
   - read back with `information_schema.columns` and `pg_get_functiondef` (look for `service_ended`).
   - ⚠️ It is dated **7 Oct**, not 6 Oct. It re-creates two functions from `20261006100000`, so it must sort
     after it.
2. **Backend before the SPA.** Redeploy every function that reaches a changed module. Eleven, from
   `check-import-graph --reached-by`:
   `stripe-webhook`, `paid-client-hub`, `client-agreement`, `render-welcome-pack`, `quick-close`,
   `sales-earnings`, `sales-performance`, `admin-overview`, `business-summary`, `findable-onboarding`,
   `paid-baseline`.
   - `quick-close` is WS-2's function. Deploy it from merged `main` so WS-2's changes ride along.
   - `stripe-webhook` must not go live before the SQL: the subscription claim fails closed without its
     column, so every new payment would get "no monthly schedule".
3. **SPA** (push `main`).
4. **First genuine payment:** a watched event. Read back lead, ledger, `subscription_claim`, subscription and
   agreement within the hour.

## Overlap and merge warnings

- **WS-2 (Quick Close):**
  - I did **not** edit `quick-close`, `quickClose.ts`, `QuickCloseDialog`, `MyHandoffs` or `findableOffer.ts`.
  - `quick-close` imports `_shared/client-setup.ts`, whose readiness and stage I changed, so **its rendering
    of a client's setup changes** (Build no-site blockers gone; first-contact step).
  - **Owed by WS-2:** the seller's view showing the same first-contact date, and "Paul will be in touch within
    two working days" in `quickClose.ts`'s paid text (B-30).
  - The "email the link" path (M-015) should also refuse an ended client.
- **WS-4:**
  - I own `deliveryStage.ts` and added only the first-contact branch (in setup, after Discovery and
    baseline). WS-4's "baseline failed" render should slot in beside it.
  - The pack's SEO change lives in `welcomePackHtml.ts` (mine); `aiAuditReportHtml.ts` (WS-4) is untouched.
- **WS-5:** `sales-performance` reaches `commission.ts` / `earnings.ts`, so it needs redeploying with this.
- **WS-6:** `ClientHub.tsx` is mine; I touched only the agreement route buttons.
- **Constraints left alone on purpose:** `lead_activity_kind_check` (reused `contact_logged`) and
  `notifications_kind_check` (reused `client_paid`). Other workstreams may widen these.
- **Shared types:** `StageResult` gained `firstContact`. `SetupView` and the hub's `setupView` gained
  `first_contact`. Both are additive.
- **CLAUDE.md:** not edited, to avoid a parallel-merge conflict.
  - Rule to add when merging: "Payment state is monotonic: only `establishLeadPayment` writes the paid
    state; a closed client never gets a subscription or a live status back."
  - §0's "two paying customers" is stale (M-063).

## Not done (owned by WS-3 in the plan, outside this brief or needing Paul)

- **M-022:** Quick Close rows still trigger the "not paid" notifier.
- **M-025:** questionnaire wording, both repos. Needs a findable-site deploy.
- **M-046 to M-049:** page contradictions, comms, email traces, pack details.
- **An in-app "send setup link" email.** The app records the contact; it does not send it. Sending
  client-facing copy needs Paul's wording.
- **Paul's decisions:**
  - the SEO grade ruling (removed by default);
  - whether `FIRST_CONTACT_SINCE = 2026-10-05` is the right cut-off;
  - the MCL Stripe look.
