# V1 leftovers (2026-11-16, branch `v1-leftovers-1116`)

| # | What | Where |
|---|---|---|
| 1 | Per-audit verdict counts stored (`ai_audits.verdict_counts`) for every finished Discovery on rules v3/v4, from the report's own split (`pooledSummary`); backfilled by the same job; the Opportunity score's "winnable searches" input is on. | `src/lib/auditVerdictCounts.ts`, `supabase/functions/audit-watch`, migration `20261218090000_audit_watch.sql`, `src/hooks/useOpportunityInputs.ts`, `src/lib/opportunityForLead.ts`, `docs/OPPORTUNITY_SCORE.md` |
| 2 | robots.txt-blocks-AI and the viewport check left as they were (`OPP_EXACT_READS`). | — |
| 3a | A skipped check says why on the Outreach row; the Apify reserve is its own reason `monthly_limit` ("Monthly search limit reached, ask Paul to raise it"), the day's pool stays `budget_used` ("Daily budget used, try tomorrow"). | `src/lib/salesCheck.ts`, `_shared/sales-check.ts`, `sales-prospect-check`, `src/lib/outreachRowCheck.ts`, `OutreachAiCheck.tsx` |
| 3b | One bell + email when the newest Apify reading is at/over 80% of its monthly limit, once per Apify billing cycle (dedupe `apify_usage_80:<cycle start>`). | `src/lib/apifyUsageAlert.ts`, `audit-watch` |
| 4 | The lead panel's Copy link follows the lead's report style (app.leadfinderos.com/r/<code> for LeadFinderOS-style campaigns). | `HookVisibilityCard.tsx`, `HookVisibilityView.tsx` |
| 5 | "Expand into towns (AI)" in Prepare baseline; the two Q2 questions on the details form. | `coverage-towns`, `src/lib/coverageTowns.ts`, `CoverageTownsSuggest.tsx`, `src/lib/clientOnboardingForm.ts`, `_shared/client-onboarding.ts`, `docs/onboarding-to-audit.md` |

**audit-watch** runs on pg_cron `audit-watch` every 5 minutes through `invoke_audit_watch()`, which posts only when there is work
(a finished v3/v4-era Discovery with no counts, or re-scored since; or Apify ≥ 80% with this cycle's alert not raised). It sends
nothing to prospects or clients and starts no audit.

**Not redeployed on purpose:** `salesCheck.ts` is also reached by process-ai-audit-queue, twilio-webhook and whatsapp-status (HELD),
and `clientOnboardingForm.ts` by send-whatsapp-message, process-sms-queue, twilio-sms-send and quick-close. They import only
unchanged exports (`AUDIT_RUN_IN_FLIGHT`, `SALES_CHECK_AUDIT_REUSE_DAYS`, `isReusableAudit`, `runIsUsable`; `onboardingFormUrl`), so
their live behaviour is identical. Sending code was not touched.

**Known limit:** the queue's own Apify-reserve refusal (process-ai-audit-queue marks the answer `apify_reserve`, the run ends
`capped`) still reads "The AI check didn't run" on the row — changing it means redeploying the audit engine.

Test: `scripts/leftovers-1116.test.ts`.
