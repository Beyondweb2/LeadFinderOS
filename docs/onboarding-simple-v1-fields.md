# Simple findable.live onboarding — what LeadFinderOS stores for it (2026-10-16)

The simple onboarding on findable.live (findable-site branch `feat/onboarding-simple`, commit `4dbc978`) sends three
things V1 used to drop silently. This change makes V1 keep them. Nothing about the agreement, Stripe prices, commission
or existing Build / Optimise rows changed.

## Columns (migration `20261103090000_onboarding_simple_fields.sql`, applied 2026-10-16, read back)

| Column on `onboarding_responses` | Type | Written by |
|---|---|---|
| `design_choice` | text, CHECK `keep` / `improve` / null | findable-onboarding submit (and the sales-held resume, fill-if-empty) |
| `agency_contract_ends` | date | findable-onboarding submit (and the resume, fill-if-empty) |
| `access_ack_at` | timestamptz | findable-checkout, when the request carries `access_ack: true` |

## Rules

- Values are read by ONE leaf, `src/lib/onboardingSimpleAnswers.ts`: an unknown design value or a date that is not a
  real `yyyy-mm-dd` day stores **null**, never a guess (same rule as findable-site's `cleanContractEnd`).
- findable-onboarding builds its insert from explicit key lists — both new keys are in **all three** (answers object,
  `NEWER_COLS`, `optional`). `agency_contract_ends` sits before `agency_contract` in `optional` (substring rule).
- The agency-contract hold notice (`selfServeBuildHold`) adds "They say their agency contract ends on …" when a date
  was given. The hold rule itself is unchanged.
- `access_ack_at` is a **record, never a gate**: stamped once (only while null), only on strict `true`, after the
  already-paid refusal, inside a try — a failure is logged and checkout carries on exactly as before.
- `q2_prefill` now also returns `confirmed_location` (the row's own answer, same paid-row gate) so the post-payment
  town box can be filled on another device. ⚠️ findable-site does not read it yet — a one-line follow-up there.
- ⛔ `prefill` / `q2_prefill` still do **not** return the lead's email, contact name or address. That needs Paul's OK
  (the link is the only capability).
- Shown on the client page (Onboarding stage + Client details), Website Build (simple screen header) and the lead
  card's Questionnaire section, all through `simpleOnboardingLines`. paid-client-hub selects the three columns.
- Test: `scripts/onboarding-simple-fields.test.ts`.
