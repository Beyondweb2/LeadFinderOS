# Onboarding consistency — one set of questions, one contract rule (2026-10-16)

Paul's brief: every V1 onboarding route matches the new model (Build only, we host, no Optimise, tied-in agency = no-go),
with the same short questions everywhere and nothing asked that the lead already holds. Agreement v5
(`docs/pre-sales-certification/client-agreement-v5-release.md`) already did Quick Close, the Call screen, the client's own
sign-up and checkout. This change did the rest.

## The rule, in one place

`src/lib/agencyContractRule.ts` — `agencyContractOutcome(thirdParty, contract)`:

| Answer | Outcome | Meaning |
|---|---|---|
| no agency / free to leave | `go` | Findable Build |
| tied in | `stop` | declined (v5 clause 1.6); no release lifts it |
| not sure | `hold` | Paul checks before any payment (`quick_close.review_approved_at`) |
| agency, no answer | `unanswered` | ask it |

`quickClose.ts` `agencyContractTiedIn` / `agencyContractBlocksBuild` / `agencyContractUnconfirmed` are thin wrappers over it
(same behaviour as v5 wrote them), so Quick Close, the Call screen, `selfServeContract.ts` (client sign-up,
findable-checkout) and the manual dialog all read the same function. The words stay with the close
(`TIED_IN_DECLINE_REASON`, `QC_REVIEW_TEXT.agency_contract_build`).

## Manual onboarding (Paid Clients → Complete / edit onboarding)

- First panel "Is this right?": values the record already holds are shown as text with one **Fix**; only blanks are
  fields (`ManualOnboardingDialog` `Known`).
- Then the simple onboarding's questions, copy verbatim from findable-site (`SIMPLE_COPY`, pinned by
  `scripts/manual-onboarding.test.ts` §7b against findable-site master): agency or provider → contract (+ optional end
  date when tied in) → happy for us to build (form-only answer, no column — the client page does not store it either) →
  keep / improve design (with a website) → own the domain and can log in (`domainColumnsFor`, the same four columns the
  client page writes) → the confirmations + permission tick on one panel.
- Writes `agency_contract`, `agency_contract_ends`, `design_choice` with the same lifetimes as the client page.
- A client already on Findable Optimise keeps the old website questions (`LEGACY_KEEP_COPY`, not pinned).

## Paid Clients checklist and handoff

- `handoffReadiness`: **Website** and **Website access / control** are required only for a client actually on Optimise
  (paid on 6, plan_tier keep, or website_route optimise_existing with no paid route). Everyone else — an unknown route
  included — is Build: both "not needed". GBP access and the Build items (domain) are unchanged. `ACCESS_REQUIREMENTS`
  (clientTimeline) already listed them for Optimise only.
- The sales handoff prefills the work type from the design answer (keep → "keeping their design fairly close", improve →
  "rebuild"). Nothing in the handoff is required (unchanged).

## Tests

`manual-onboarding` (copy re-pinned to the simple flow), `onboarding-audit-fields` (rewritten for the "Is this right?"
panel: no advance with business name / trade / town blank; blanks open as fields and stay open; a corrected trade is
sent), `payment-client-state` and `self-sourced-handoff` (Optimise cases are explicit 6-payment clients; a Build client is
never asked for a website).
