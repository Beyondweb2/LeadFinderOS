# Client Service Agreement v4 + India cleanup (2026-10-07)

Branch `release/client-agreement-v4-india-cleanup` (LeadFinderOS), `release/client-agreement-v4` (findable-site).
Source of truth for the contract text: `Findable_Client_Service_Agreement_v4_clean.docx`, held verbatim in
`src/lib/clientAgreement.ts` as `V4` (generated clause by clause from the document; fixture
`scripts/fixtures/client-agreement-v4-source.txt`; pinned by `scripts/client-agreement-v4.test.ts`, which also
pins the v1 and v3 template fingerprints so a signed copy still proves itself).

## v3 to v4 (what changed commercially)

| | v3 | v4 |
|---|---|---|
| Optimise | 6 payments, then £29.99 a month until cancelled | 6 payments, the plan ends after payment 6 and the final service period. No continuing charge of any kind |
| Build | 12 payments, then £29.99 a month until cancelled | 12 payments, the service ends after payment 12. £29.99 Hosting and Maintenance is a separate opt-in (9A) and never starts by itself |
| Acceptance | "I agree and sign" | tick "I have read and agree to the Client Service Agreement" + authority confirmation (1.2, 1.4), before payment |
| Re-measurement | about 4 weeks | 4 weeks, or 8 weeks on a brand-new domain (5.3); the Results Date is the day the results are actually sent |
| Payment timing | day after Refund Window | unchanged (5.6) |
| Guarantee | £99 back | unchanged (5.4), outcome-conditional, claim within 14 days of the Results Date |

## Money rules in code

* One rule, written once: `continuingModeFor(terms, route)` in `src/lib/clientTimeline.ts`.
  v3 gives `automatic` (both plans), v4 Build `optional`, v4 Optimise `none`, anything unknown `none`.
* Terms values: `csa_v3_option_b` (unchanged) and `csa_v4_option_b`. `isOptionBTerms` is the one question "agreement-first
  timing?" (payment start, baseline gate, commission, cutover, results sender). `commercialTermsFor(version)` maps a signed
  version to its terms. A client with no stamp (Ronnie, MCL, RG, QA) is never re-ruled.
* Billing timing needed no change: the subscription is created on a hold, the first £99 recurring payment is set to the day
  after the Refund Window, `cancel_at` ends it after 5 (Optimise) or 11 (Build) recurring payments. Proved by
  `client-agreement-v4.test.ts` and `payment-start-schedule.test.ts` for v3 and v4. Nothing creates a £29.99 price.
* Subscriptions are stamped `metadata[commercial_terms]` so emails and alerts say what the client signed.
* End of term (`stripe-webhook`): v3 keeps its manual Continuing Service alert; v4 Optimise alerts "plan complete, nothing
  continues"; v4 Build alerts "hosting is opt-in only". The client gets the term-complete email (Build names the optional service).
* Paid Client timeline: v4 Optimise shows "the plan ends", v4 Build "Optional Hosting and Maintenance, only if the client opts in"
  (buttons "Client opted in / declined").

## Acceptance and the record

* Agreement page shows: version, signing date, plan summary (rows keyed to v4), the full agreement with the client's details
  pre-filled and editable, the agree tick, the authority tick (nothing pre-ticked), button stays off until both are ticked.
  Payment is a separate step that opens only after the signature exists.
* Server gate (`findable-checkout`, `signupGate.ts`): no Stripe session without a v4 acceptance for THIS lead, THIS sign-up,
  THIS plan, with authority, whose stored text re-hashes to its fingerprint. Plan and price come from the row and constants,
  never the request. The webhook backstop (`payment-hold.ts`) holds any payment whose session names other terms.
* Stored: client/business, signer name and role, authority, version, plan, exact timestamp, signup id, IP/UA, the exact agreed
  text and its SHA-256. The table is write-once. One acceptance per sign-up and version (unique index), so a duplicate webhook or
  double submit creates no second record.
* Paid Clients and the welcome pack read the same fold (`signedAgreement.ts`): version, date, plan, linked to the payment, PDF link.
  The welcome pack adds the plan-specific end-of-term key point for v4 only; a v3 client's pack is unchanged.
* Plan summary, its fallback and the checkout/Stripe/billing words all use `afterTermSummaryWords` (`findableOffer.ts`); findable.live
  mirrors it in `continuingLineFor`.

## India removed from active outreach

Cold WhatsApp is UK mobiles only. Australia stays supported for search, phone normalisation, lead handling and AI checks, and is NOT
enabled for cold WhatsApp. `src/lib/ukColdDestination.ts` tests the digits we would send to (not the country column);
`process-whatsapp-queue` and `send-whatsapp-message` refuse any non-UK cold destination (not overridable by `allow_resend`);
the India send window is gone. SQL: `sales_queue_opener` and `campaign_candidates` lose the +91 alternative
(`20261015090000_outreach_uk_only.sql`). Historical Indian leads, messages and metrics are untouched; the India digits branch in
`waNumber.ts` stays only so old threads still normalise.

## Meta templates and the WABA

`findable_signup_link` and `findable_onboarding` are APPROVED by Meta (Paul, 2026-10-07). The code reads Meta's live status
(`_shared/template-status.ts`); if the WhatsApp Business Account cannot be identified the status reads `UNKNOWN` and a send is
still attempted so Meta decides, so nothing is blocked. To read live status set `WHATSAPP_BUSINESS_ACCOUNT_ID` (Supabase function
secret) to the WABA id shown in WhatsApp Manager. Salespeople may send only the signup template on leads they work; the onboarding
template is refused for them. One send per lead unless the operator confirms a resend. `whatsapp-status` is NOT touched.

## Migrations (apply in this order, read back)

1. `20261015090000_outreach_uk_only.sql` (two function bodies, no data)
2. `20261015100000_client_agreement_v4.sql` (constraints: `agreement_first_acceptance_is_complete` replaces the v3-only check;
   `client_service_terms` accepts `csa_v4_option_b`). The existing v3 acceptance and terms row are untouched.

## Functions to redeploy (never `whatsapp-status`)

`client-agreement`, `findable-checkout`, `stripe-webhook`, `paid-client-hub`, `process-whatsapp-queue`, `send-whatsapp-message`,
plus every function reaching a changed shared module (see the deploy list in the final report).

## Known remainders

* A Stripe Checkout session created before deploy (v3 metadata) and paid afterwards is HELD by the webhook backstop (old version) for Paul.
* Salesperson/seller wording elsewhere (call script, Quick Close) was already v4-shaped (`planTerms.ts`).
* Meta-registered bodies of the two blocked legacy templates still quote £29.99; they stay blocked.

## Release record (2026-10-07)

* LeadFinderOS `main` `cd599049` (merge of `release/client-agreement-v4-india-cleanup`), findable-site `master` `052b032`
  (merge of `release/client-agreement-v4`). Neither origin had moved since the branch point; no concurrent work was touched.
* Gates on the merged trees: LeadFinderOS `npm run check` 349/349 suites, typecheck identical to the 9-error baseline; findable-site
  `npm run build` + `npm test` (incl. cross-repo sync, 15 checks) green. The two suites that read findable-site need
  `FINDABLE_SITE_DIR` pointing at a current checkout.
* Migrations applied one at a time and read back: `20261015090000_outreach_uk_only.sql` (both functions: no `91[6-9]`, UK test
  present, execute grants unchanged), `20261015100000_client_agreement_v4.sql` (`agreement_first_acceptance_is_complete` present,
  `v3_acceptance_is_complete` gone, `client_service_terms_commercial_terms_check` accepts v3 and v4).
* 22 edge functions redeployed from `main` (all exit 0): `stripe-webhook`, `findable-checkout`, `client-agreement`,
  `paid-client-hub`, `send-whatsapp-message`, `process-whatsapp-queue`, `legacy-checkout-cutover`, `render-welcome-pack`,
  `cron-run`, `paid-baseline`, `process-ai-audit-queue`, `render-remeasure-results`, `admin-overview`, `business-summary`,
  `conversation-triage`, `sales-performance`, `sales-earnings`, `client-intake`, `client-onboarding`, `findable-onboarding`,
  `quick-close`, `render-audit-report`. Chosen by walking `check-import-graph.mjs --reached-by` for every changed shared module
  and keeping the functions whose behaviour reads a changed export. `whatsapp-status` was NOT deployed: it is still v114
  (updated 2026-09-30). Marker: the `send-whatsapp-message` OPTIONS preflight answers `x-swm-build: 2026-10-15a-uk-only-cold`.
  A later one-line change (the agreement-link email wording in `paid-client-hub`) is redeployed separately (see the final report).
* findable.live deployed from the reconciled `master` (`/agreement` renders v4; /, /pricing, /refunds, /terms, /faq carry no
  "until you cancel" and no "Continuing Service"; Optimise "ends after payment 6" and Build's 29.99 as "optional" appear). The SPA
  is live on `app.leadfinderos.com` and `leadfinderos-next.pages.dev` (the v4 What's New entry is in the served chunk).

### Live ZZ QA (fixtures ZZ QA14 Build, ZZ QA15 Optimise; drama-range phones, paul@move37.fun, excluded, archived after)

* SALESPERSON (Test account): Quick Close for Optimise and Build both reached `ready`; the sign-up link is
  `findable.live/agree/<64 hex>`; `findable_signup_link` went through the canonical sender (simulated, because the fixture is a QA
  lead); a second press was refused (`already_sent`, Resend needed).
* CLIENT: the agreement page showed version v4 and a date, the right plan, the exact label "I have read and agree to the Client
  Service Agreement", the authority tick, nothing pre-ticked, contact / email / phone / address pre-filled, payment locked.
  Optimise summary: "ends after payment 6 and the final service period. There is no automatic continuing charge." (no 29.99
  anywhere above the agreement); Build: "ends after payment 12 ... 29.99 a month Hosting and Maintenance is optional ...
  separately choose it". Payment before signing: the page refused (409) and `findable-checkout` answered `agreement_required`
  even with a tampered `price` and the other plan in the body. Signing without the authority tick: 422, no row. Signing with
  forged `route`, `agreement_version: v3`, `commercial_terms: csa_v3_option_b` and `price`: the stored row is the real route,
  `v4`, `csa_v4_option_b`. Double submit: one acceptance. The copy was emailed (internal address plus Paul's mailbox); the PDF
  downloads.
* PAYMENT (simulated, no money, no Stripe call, delivered twice per fixture): one ledger row, one history row,
  `client_service_terms` stamped `csa_v4_option_b` linked to the v4 acceptance; `contract_total_payments` 6 (Optimise), 12 (Build).
* ADMIN (Paul's account via magic link, signed out after): Paid Clients `agreement_status` shows version v4, signed date, plan,
  "linked to the payment"; the PDF works; `terms_status` shows `continuingMode` `none` (Optimise) and `optional` (Build) and only
  the "confirm Access Date" action: no continuation reminder, decision or set-up action. `findable_onboarding` went out through the
  onboarding share path (simulated), a second press was refused, and a salesperson was refused (403 `admin_only` through the hub,
  403 `forbidden` calling the sender directly).
* INDIA / UK / AU (rolled-back DO block calling the live `sales_queue_opener` as the Test salesperson): a UK mobile queued 1;
  `+91` with country India, `+91` mislabelled UK, and an Australian mobile each skipped `not_a_uk_mobile`, nothing queued.
  The senders' refusal and the removed India window are pinned at source level by `scripts/outreach-uk-only.test.ts`. A live dry
  run of a cold template through `send-whatsapp-message` was attempted and answered 403 for every number (including a UK
  one), so it proved nothing and is not claimed.
* HISTORICAL v3: the one v3 acceptance (`3dd4cb6c...`, sha prefix `a70c3484d228`, 2026-10-06 11:25:29 UTC) and the one v3
  `client_service_terms` row (lead `1f000000...f1`, `csa_v3_option_b`, same acceptance id, same `initial_paid_at`) are identical
  after both migrations and the QA. No stored acceptance was rewritten.
* Welcome pack: not rendered live; it needs a finished paid baseline (which spends Apify money) and the fixtures have none.
  Pinned by `client-agreement-v4.test.ts` (v4 key point for both plans, v3 pack unchanged); it reads the same
  `signedAgreementRecord` the Paid Clients page showed above.
* Fixtures archived through `lead_set_archived`, phone and email cleared, onboarding links revoked; the check query shows
  `is_archived true, no_contact true, excluded true` for every ZZ QA fixture. The acceptance rows are write-once evidence and stay.

### Not provable live, and why

* **Stripe subscription creation, the first 99 recurring date and the Optimise/Build stop dates** need a real card. The simulated
  payment has no customer, so no subscription is made. They are proved by `payment-start-schedule.test.ts` and
  `client-agreement-v4.test.ts` against a fake Stripe (day after the Refund Window; ends after 5 / 11 recurring payments; no
  29.99 price is ever created). The first real v4 payment should be watched.
* **Meta status of the two templates:** `whatsapp_template_status` reads `UNKNOWN` ("no_waba": the app cannot identify the
  WhatsApp Business Account), so a send is attempted and Meta decides. Sending does not need the WABA id; only the status
  display does. Set the Supabase function secret `WHATSAPP_BUSINESS_ACCOUNT_ID` (the WABA id shown in WhatsApp Manager) to make it
  read "Approved". A real delivery of either template to a real phone was not done (fixtures are simulated by design).
* `client_service_events` can receive two `terms_stamped` rows when the same payment event is delivered twice (the terms row
  itself is single and immutable). Pre-existing behaviour, left alone.
