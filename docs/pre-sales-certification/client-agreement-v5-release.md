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

## Release record (2026-10-16)

* Cut-over check (read-only, just before): 0 signed-v4-unpaid sign-ups, 0 checkout sessions in the last 24 h. Two unsigned,
  unpaid sign-ups were still on Optimise (Driving Ambition, 16 Oct; Adam Plumbing, Heating & Construction, 6 Oct): their
  links now say "no longer offered" and Paul re-sends them as Build.
* Migration `20261104090000_client_agreement_v5.sql` applied once and read back (two columns, both constraints). Historical
  rows untouched: v1 8, v3 1, v4 17, every stored text re-hashes to its fingerprint.
* LeadFinderOS `main` `22808d4c`; findable-site `master` `840f556` (site master's simple onboarding merged in first).
  Gates: LeadFinderOS `npm run check` 400/402 (the two failures, manual-onboarding and onboarding-audit-fields, read
  findable-site's new simple onboarding and fail on main too; owned by the onboarding-consistency session); findable-site
  build + `npm test` green, em-dash clean, WebKit tap / visibility / landing / hero audits green on a served dist and on
  the live origin. `webkit-nav-scrim` is stale (looks for a "Free AI check" hero button removed earlier).
* 41 edge functions redeployed from `main` (all exit 0), the `--reached-by` closure of every changed module, NOT
  `whatsapp-status`. SPA marker `2026-10-16-agreement-v5-one-plan` served on app.leadfinderos.com and leadfinderos-next.
  findable.live deployed (production branch `master`): `/agreement/` v5, `/agreement/v4/` v4.
* Live ZZ QA (ZZ QA17 v5 Build Plumbing, ZZ QA18 v5 Old Optimise; drama phones, QA email, excluded, archived after):
  v5 page with the 1.6 questions, Build only, nothing pre-ticked, payment locked; pay before signing 409; "No, tied in"
  422 with the decline (nothing stored, Paul's report written); unanswered 422; signing with a forged route / v4 / terms
  stored v5, build, csa_v5_option_b, free to leave true; double submit kept one row; the signed PDF downloads; Continue to
  secure payment forwarded to Stripe (session £99 GBP, Build, 12 payments; opened, never paid). QA18 (Optimise sign-up):
  "no longer offered", signing refused 409. Historical v3 and v4 clients: page "Agreement accepted", signed PDF re-renders.
* Not built: the 9A.5 reminder before payment 12 (nothing sends it). Commission unchanged.
