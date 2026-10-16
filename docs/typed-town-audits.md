# Typed-town audits (2026-10-15)

**Problem.** Ethan's CSV import (`import_batch`, no Google place id, no `lead_source`) was refused 409 `town_unverified` on 94 of 95 leads:
the town gate only trusted a Google-confirmed town, and the hand-added exemption read `lead_source`, which imports leave empty. Failed
audits cost nothing (nothing was asked, no place lookup).

**Rule.** One predicate, `auditTownGated` (`supabase/functions/_shared/typed-town.ts`), read by bulk-jobs (before any call) and
create-ai-audit (the authority): a lead with NO place id that was hand-added (`lead_source`) or imported (`import_batch`) passes when its
typed `search_location` / `address` is a real town. A Google-resolved lead is never exempt. A messaging gate never uses it.

**What is a town** (`src/lib/typedTown.ts`, `cleanTypedTown`): first segment before `;`, bracketed landmark dropped
("Kuala Lumpur (Sunway Velocity 2)" -> "Kuala Lumpur"), a neighbourhood list ending in the city -> the city, never "Online" / "Remote" /
"Worldwide" / a sentence. A derived town that is not a place (Google answered "Online") is not verified (`townVerdict`) and
`pickAuditTown` skips it. No real town -> refused before a call (`skipped_town_unverified`, "No usable town ...") or, at create-ai-audit,
400 `local_scope_needs_town` with a message.

**Questions.** `hookPlaceFor` (seedGuard) pins the top-up hook place with the country for every listed country: "Kuala Lumpur, Malaysia",
Singapore not pinned twice, UK byte-identical. `malaysia` joins `NATIONAL_LOC_TERMS` (a country-only location is not a town).

**Limits are read from code, never retyped:** `src/lib/auditLimits.ts` (`AUDIT_RUN_CAP_USD`, `AUDIT_BULK_JOB_MAX_LEADS`,
`prospectingRemainingUsd`, `auditLimitsSentence`) + `auditBudget.ts` (`POOL_DAILY_CAP_USD.prospecting`, `APIFY_RESERVE_PCT.prospecting`).
The Outreach "Run AI audits" box used to say "Capped at $3/audit + $15/day" - no such cap ever existed.

Test: `scripts/typed-town-audit.test.ts`.

## Sequential hook audits (2026-10-15)

**Rule.** A hook audit (Outreach bulk audit with the score marker, Inbox "Run AI audit") asks ONE question at a time on ChatGPT + Gemini
(1 run). Question 2 is asked only if EVERY engine that answered named the lead in question 1; question 3 only if it did again. The first
answer that did not name the lead stops it and is the proof. The 3 / 4 / 5 picked is the most asked; the Inbox hook is 3.
Score = named answers / answers asked (whole %); any failed answer = no score; named in every answer = refused (no absence to message
about); competitor names only from answers where the lead was not named (the existing hook pick).

**Where.** State: v2 hook state gains optional `sequential`, `next_index`, `executed`, `stop_reason` (`src/lib/hookScore.ts`,
`advanceSequentialHook`, `askedHookQuestions`). `create-ai-audit` queues only the first question; `process-ai-audit-queue` has a step
beside the old v1 adaptive one that queues the next, claimed exactly once on `results->hook->>next_index`. A spend-capped run stops as
`capped` (no score). A re-run by `audit_id` keeps the old all-queued marker. Paid baseline, free check and every older audit are unchanged.

**Estimate.** `estimateBatchCost` prices questions only ("up to"): the $0.04 scan line is gone (no hook audit runs a scan). The per-question
rate is still `AUDIT_EST_USD_PER_QUESTION` in `marketView.ts` (0.014, at least the ledger rate). Caps unchanged: $1 per run, $12 daily
prospecting pool, 100 leads per job, 85% Apify reserve.

**Trade-off.** A lead that is named keeps all its questions in turn, so wall-clock time is roughly the number of questions asked times one
scrape (a few minutes each), not one scrape in total. Per-row age guard (12 min) is per question, so it is unaffected.

Test: `scripts/sequential-hook-audit.test.ts`.

## A person vouches for the town (2026-10-16)

**Root cause of "town_unverified" on Ethan's list** (read from the live row, "Majesty Event"): the import ran with the Batch name blank, so `import_batch` was NULL and `townWasTyped` (lead_source / import_batch) was false; 851 leads imported that day had no batch. A lead with no Google place is never looked up (`resolveDerivedTown` stamps `no_place_id` without a call), so the audit was never about Google re-verifying; it was this marker.

**Fix.** `outreach_leads.town_confirmed_by` ('researcher' = the import tick box, 'operator' = Confirm town in the audit popup) + `town_confirmed_at`. `townConfirmedByPerson` joins `townWasTyped` inside `auditTownGated`; the real-town text check (`cleanTypedTown`, which now also refuses "Not established" / "not found" / "no town given") still applies, so blank / "Online" / "Not established" stay blocked. `import_leads_v4` = v3 + batch defaults to the file name + `_confirmed_rows` (file rows the client says are real towns; only leads CREATED by that call are stamped). `lead_confirm_town` uses `_require_work` (same rule as `lead_set_details`). The audit popup (`LeadHookPanel`) turns the refusal into plain words (`src/lib/townRefusal.ts`) with Confirm town. `sales-prospect-check` now uses the same `auditTownGated` as the audit it calls. Caps unchanged. Test: `scripts/town-confirm-import.test.ts`.

**Leads imported before this (no batch):** they stay gated until given a batch or confirmed. Backfill (a fill of NULLs, run by Paul): set `import_batch` from the file name in the lead's `lead_added` activity (`data->>'file'`, `source = 'csv_import'`) where `import_batch is null and place_id is null`.
