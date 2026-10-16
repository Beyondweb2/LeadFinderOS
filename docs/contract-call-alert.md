# Contract call alert (2026-10-16)

Paul's addendum: when a lead answers **"not sure"** (agency contract) or **"tied in"**, on any route, he gets ONE email and
the lead shows on his **Needs your attention** list. Nothing goes to the prospect.

## Routes (each calls `_shared/contract-alert.ts` `alertContractAnswer`)

| Route | Where | Answer from |
|---|---|---|
| findable.live sign-up (and the copied Full Setup link) | findable-onboarding submit (lead path, and a cold sign-up once its lead exists) | `website_manager` + `agency_contract` (`contractAlertAnswerFromRow`) |
| Client correcting a sales-held sign-up | findable-onboarding `sales_confirm` | the effective Quick Close answers |
| Agreement page (v5 clause 1.6) | client-agreement sign | "No, tied in" → tied in; "Yes, free to leave" closes |
| Quick Close and the Call screen | quick-close `save`, when manager or contract changed | `contractAlertAnswerFromQuickClose` |
| Paul's manual onboarding | paid-client-hub `save_onboarding` | `agency_manages` + `agency_contract` |

The answer is THE rule (`agencyContractRule.ts`): tied in → `in_contract`, not sure → `not_sure`, free / no agency →
`free`, unanswered → nothing.

## Once per answer

Table `contract_call_alerts` (migration `20261105090000`, service role only) is the ledger and the dashboard marker.
`contract_alert_claim` takes a per-lead lock: the same answer as the newest row → nothing (a refresh, a second save);
a changed answer → a new row; `free` is recorded only when it closes an earlier alert. Only a claimed `not_sure` /
`in_contract` row is emailed; `emailed_at` / `email_error` record the outcome (a failure also goes to
`client_error_reports`). The step never throws and never blocks the save.

## The email

`src/lib/contractAlert.ts` `contractAlertEmail`, sent by `_shared/operator-alert.ts` `sendOperatorAlert` (to
`OPERATOR_ALERT_TO`, Paul's alert inbox, the Resend key every operator alert uses; `opts.html` carries the tap-to-call
link). Subject `CALL: [business] not sure about agency contract` / `NO-GO: [business] tied into agency contract`. Body:
business, contact, phone (tel: link), email — **from the lead record** — what they ticked (agency, provider name when
given, not sure / tied in, contract end date), the route, and `app.leadfinderos.com/inbox?lead=<id>`.

## Needs your attention

`adminMetrics.ts` `contractAttention`: the newest answer per lead; not sure → **Today** ("Call them before any
payment"), tied in → **Review** ("Set a follow-up for when it ends"). It leaves the list when a person acts on the lead
after the answer (the same acted kinds as reply triage), the answer becomes free to leave, or the lead pays. Archived and
excluded (test) leads never show.

## Tests

`scripts/contract-call-alert.test.ts`. Live check: a ZZ QA fixture lead, Paul's own inbox only, archived after.
