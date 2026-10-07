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
