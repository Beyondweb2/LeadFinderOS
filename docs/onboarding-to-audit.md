# Onboarding → payment → audits, self-serve (2026-11-15, branch `v1-onboarding-to-audit`)

Paul: "Make onboarding → payment → audits fully self-serve inside V1. I should never need outside help to write questions." First real client through it: London Domestic Maintenance (Rob).

## The flow as it is (recon, before this change)

| Step | What happens |
|---|---|
| Onboarding (pre-pay) | `findable.live/onboarding/?lead=<id>` (findable-site `OnboardingFlow.tsx`) → `findable-onboarding` `submit`. Contact, website, plan, domain/agency, consent. Prefilled from the lead (`prefill`). |
| Agreement | `findable-checkout` refuses a Stripe session without a signature → `findable.live/agree/<token>` (`client-agreement`), then pay. |
| Stripe | `stripe-webhook`: `markOnboardingPaid`, `establishLeadPayment`, service terms, ledger, plan count, `payment_received` event; "new client" email to Paul (`notifyOfFindablePayment`); bell "Introduce yourself" (`first_contact:<lead>`); WhatsApp confirmation to the client; `startPaidBaseline` → waits (`awaiting_questionnaire_2` / `awaiting_operator_run`). |
| After payment | Q2 on the same page ("Your services and areas") → `complete_q2`: main town + services required; areas, not offered, top requests optional. Or Paul's `findable.live/details/<token>` form (`client-onboarding`). |
| Baseline | Nothing runs by itself. Paul opens **Prepare baseline** (ClientHub): Hook Audit → Discovery (AI writes per approved town, `generateDiscoveryPool` → `create-ai-audit`) → recommendation → review/edit → approve exactly 20 → run. |

## What changed

- **Two new optional answers** (`onboarding_responses`, migration `20261215090000`, applied and read back 2026-11-15):
  `services_not_wanted` ("Anything you do but don't want more of?", e.g. emergency call-outs) and `coverage_area` ("What area do you cover?", their own words). Asked on findable.live Q2; the towns box is now "Priority towns or areas" (mirrored in `manualOnboarding.ts`).
- **One exclusion rule:** `excludedServicesOf` (`src/lib/onboardingAnswers.ts`) = not offered + not wanted. paid-baseline gives it to Discovery and the final-20 checks, so a question about either never reaches the 20 without a typed override. The two lists are still stored and shown apart. Not applied to page generation (a not-wanted service is still something they do).
- **Paul is told:** the client's first Q2 submit (per onboarding row) writes a bell (`client_onboarding`, dedupe `setup_answers:<onboarding id>`) and, only when that insert won, emails the answers (`sendOperatorAlert`). Link: `/paid-clients/<lead>?baseline=open`.
- **One click:** ClientHub "Client's setup answers" card → **Run Discovery** (opens Prepare baseline and writes the Discovery questions if there are none) or **Create baseline** (writes the recommended 20 draft if the draft is empty). Measuring Discovery still asks for the cost confirm; nothing freezes before approval.
- The client record (intake card answers) shows "Does not want pushed", "Area covered", "Most asked for".
- `q2_prefill` returns their own earlier optional answers (`answered`) so a reopened form is filled. Still an explicit column list: no email, contact name or address.

## Not done / known limits

- `coverage_area` is still context only: questions are written per approved town (`areas_list`). **Since 2026-11-16** Prepare baseline → Client context has **Expand into towns (AI)** (`coverage-towns` edge function, admin only, gpt-4o-mini, rule `src/lib/coverageTowns.ts`): the area in their words → up to 40 real towns / boroughs as clickable suggestions into Service areas, editable, saved only by Save client context. Nothing is written or measured from the suggestion.
- **Since 2026-11-16** the `findable.live/details/<token>` form (client-onboarding; links made by paid-client-hub) asks both optional questions (`services_not_wanted`, `coverage_area`, same words as Q2), only when blank, never counted as "still missing".
- Quick-close form untouched (Paul, 2026-11-15).

Tests: `scripts/onboarding-answers.test.ts`; `scripts/onboarding-simple-fields.test.ts` (q2_prefill columns).
