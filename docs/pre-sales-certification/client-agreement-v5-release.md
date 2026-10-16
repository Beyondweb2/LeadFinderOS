# Client Service Agreement v5 (2026-10-16)

Branch `release/client-agreement-v5` in both LeadFinderOS and findable-site.
Source of truth: `Findable_Client_Service_Agreement_v5_clean.docx` (Jess approved 2026-10-16; Paul chose four weeks only
for the re-measurement). Marked copy against v4: `agreement-v5-final-marked.docx`.
Held in `src/lib/clientAgreement.ts` as `V5`, **generated** by `scripts/generate-client-agreement-v5.mjs <docx> --write`
(also writes `scripts/fixtures/client-agreement-v5-source.txt`). Pinned by `scripts/client-agreement-v5.test.ts`, which also
pins the v1, v3 and v4 template fingerprints. findable.live: `src/lib/clientAgreementV5.ts` from
`scripts/generate-agreement-v5.mjs`; `/agreement/` shows v5 and `/agreement/v4/` keeps v4 readable.

## v4 to v5

| | v4 | v5 |
|---|---|---|
| Plans | Build (12) and Optimise (6) | Build only. Optimise withdrawn |
| After payment 12 | Build ends; £29.99 opt-in | Same, and the website transfers (4.3); reminder before payment 12 (9A.5) |
| Re-measurement | 4 weeks, or 8 on a brand-new domain | 4 weeks only (5.3) |
| Current providers | told us about them (7.2) | confirmed before acceptance: provider (if any) + free to leave (1.6). Tied in = we do not enter the agreement. Wrong answer: pause / end, no guarantee, no refund (7.6, 5.8(d)) |
| Terms stamp | `csa_v4_option_b` | `csa_v5_option_b` (same Option B timing) |

## In code

* `versionRoutes` / `versionOffersRoute`: v5 offers Build only. The agreement page refuses an open sign-up still on
  Optimise ("no longer offered", Paul re-sends) and `checkoutAgreementGate` refuses a v5 Optimise signature (`route_withdrawn`).
* Clause 1.6 on the page: provider box (blank = "None" in the agreed text) and a required Yes / No, nothing pre-selected.
  "No" = 422, nothing stored, `client_error_reports.error_id = 'agreement_declined_tied_in'` for Paul. The gate refuses a v5
  signature without `free_to_leave_provider = true` (`not_free_to_leave`), and so does the table (migration below).
* `SALEABLE_ROUTES = ['build']` (`findableOffer.ts`) is what sales may sell. 'optimise' stays in `ServiceRoute` for v3/v4 clients
  and their subscriptions only. Quick Close: a tied-in client is declined; "not sure" waits.
* The term is counted in payments everywhere a client pays: `cardSavedNoticeFor`, the Stripe line name, `termLineFor`,
  `offerSummaryFor`, the monthly-starting email, the welcome pack ("12 payments in total", not "a 12-month minimum").
* ⚠️ 9A.5 ("We will remind you before payment 12 that you can opt in"): NOTHING SENDS IT TODAY. The Paid Client timeline
  only prompts Paul, 30 days before the month after payment 12, which can fall a day AFTER payment 12. Paul, 2026-10-16:
  not built in this release; it is its own piece of work.
* Commission: v5 is Option B, so the trailing count is `COMMISSION_RECURRING_COUNT_V3` (5 recurring payments), as for
  v3/v4. Paul, 2026-10-16: keep commission.ts exactly as it is.
* Cross-repo sync: the Optimise payment-count pair is dropped in both copies of `check-cross-repo-sync.mjs`.

## Migration

`20261104090000_client_agreement_v5.sql`: adds `current_provider`, `free_to_leave_provider` to
`client_agreement_acceptances`; `agreement_first_acceptance_is_complete` covers v5 and requires `free_to_leave_provider is
true` on v5; `client_service_terms_commercial_terms_check` accepts `csa_v5_option_b`. Additive; no row rewritten.
⛔ Apply it BEFORE deploying any function: `_shared/client-agreement.ts` selects the two new columns.

## Cut-over

1. Read open sign-ups: unpaid `onboarding_responses` with a v4 acceptance (they must re-sign on v5), any on
   `plan_tier = 'keep'` (Optimise: refused after the switch; Paul re-sends as Build), and any Stripe Checkout session opened
   but not completed (a v4-metadata session paid after the deploy is HELD by `payment-hold.ts` for Paul).
2. Apply the migration and read it back (columns + both constraints).
3. Deploy the functions (below), then the SPA, then findable.live (`/agreement/` = v5).
4. Live ZZ QA: a ZZ QA Build fixture signs v5 (provider + Yes) and reaches payment (simulated); "No" is refused with nothing
   stored; an Optimise sign-up is refused; historical v4 and v3 records still render and their PDFs download.

## Functions to redeploy (never `whatsapp-status`)

Walk `node scripts/check-import-graph.mjs --reached-by <file>` for every changed shared module (`clientAgreement.ts`,
`agreementPageHtml.ts`, `agreementPdf.ts`, `signupGate.ts`, `signupSummary.ts`, `clientTimeline.ts`, `findableOffer.ts`,
`welcomePackHtml.ts`, `planTerms.ts`, `quickClose.ts` and the other sales-flow modules, `_shared/client-agreement.ts`,
`_shared/payment-hold.ts`) plus the directly changed `client-agreement`, `findable-checkout`, `stripe-webhook`,
`paid-client-hub`, `quick-close`, `findable-onboarding`. The deploy list is recorded in the release record below.

## Release record

(filled in at release)
