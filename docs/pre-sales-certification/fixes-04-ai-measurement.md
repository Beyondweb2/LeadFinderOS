# Fix workstream 4 — AI measurement + delivery reliability

- **Date:** Sunday 4 October 2026. **Branch:** `fix/04-ai-measurement` off `origin/main` `c0e85078` (LeadFinderOS) and
  `fix/04-ai-measurement` off `origin/master` `4486079` (findable-site, the questionnaire only).
- **Not merged. Not deployed. No SQL run.** Three migration files are written, not applied.
- **Inputs:** `cert/master-launch-plan` (WS-4: M-010, M-026..M-033, report-CTA half of M-049, parts of M-060/M-061),
  `cert/c-delivery-ai` (C-02..C-34), `cert/e-security-reliability` (E-05).
- **Ronnie:** not touched. No client row, date, baseline or pointer was read for writing or changed.
- **Live database:** read only (column and constraint read-back to design the migrations).

The standard being protected: **20 approved customer questions × 3 runs × ChatGPT + Gemini = 120 answers**, frozen at
approval, replayed word for word at the re-measure, no gaming, no branded padding, no cherry-picking.

---

## 1. Service truth — business truth outranks generated ideas (C-04, C-08, M-028, M-030)

**What was wrong.** Discovery wrote "car keys and auto locksmith in Canterbury UK" for a locksmith who does not do car
keys. Nothing checked it, approval seeded it into the client's backlog, and MCLocksmiths' real frozen baseline already
carries "Who offers auto locksmith services in Canterbury?". Services were also *concatenated* from four sources
(onboarding + verified build facts + what Sales typed + Discovery's own previous input), and "Save client context" wrote
that merged list back onto the onboarding row as if the client had said it.

**What changed.**
- **New leaf `src/lib/serviceScope.ts`** — the one rule for "is this question about something the client does?":
  - `resolveServiceTruth` — the highest-ranked **non-empty list wins whole** (client onboarding → a build fact Paul
    verified → what Sales recorded). Lower lists come back as `unconfirmed`, shown, never measured. Discovery's
    `specialism` is **never** a source of services. Only onboarding / verified build facts count as client-confirmed.
  - `questionScope` — `core` (about the business in general), `service` (every specific word traces to a confirmed
    service, matched by meaning: "break-in" = "Burglary repair and make safe", "key duplication" = "Key cutting"),
    `not_offered` (every word of a client negative is present), or `unsupported` (names something nobody confirmed).
    It is deliberately strict: "car keys" is unsupported even with no negative list, because "car" traces to nothing.
- **Explicit negatives** — new onboarding column `services_not_offered` (migration `20261007040100`). It feeds the
  Discovery prompt, the pool filter, the final-20 checks and the backlog seeding.
- `mergeClientContext` (`src/lib/clientContext.ts`) follows the winner-takes-whole rule and returns
  `services_client_confirmed`, `unconfirmed_services`, `unconfirmed_areas`.
- `paid-baseline` `save_context` now writes **only what Paul sent** (never the merged list) plus the two new answers.
- Generated ideas are never written back as client facts: Discovery output goes to the pool only; out-of-scope questions
  are listed in the pool's `rejected` list ("kept out — not a confirmed service"), never measured, never backlogged.

## 2. Discovery questions read like customers (C-02, M-029 style)

- **New leaf `src/lib/customerQuestion.ts`.** `toCustomerQuestion` turns a keyword string into the question a person
  asks an AI — "mortice lock replacement in whitstable uk" → "Who offers mortice lock replacement in Whitstable, UK?";
  "fuse board upgrades Electricians in Nailsea UK" → "Which electrician in Nailsea, UK can do fuse board upgrades?".
  Idempotent; only re-cases an **approved** town; invents no town. The place keeps its country (", UK") — that is what
  stops an engine answering about Canterbury, New Zealand.
- `create-ai-audit` has an opt-in **customer style** (`question_style: "customer"`), honoured only for internal Discovery
  calls: whole questions ending in "?", the trade word in each, the client's NOT-OFFERED list and `must_not_say` in the
  prompt. Hook audits, market scans, replays and every other caller generate byte-for-byte what they did before.
- `_shared/baseline-discovery.ts` reshapes every generated question (and every template top-up) and filters by scope.

## 3. Final-20 safeguards (C-03, C-05, M-028, M-029)

- **New leaf `src/lib/baselineQuality.ts`** — the checks Paul sees before freezing, the same on screen and at approval:
  - **Blocking** (approval refused until the question is replaced or a written reason ≥ `QUALITY_OVERRIDE_MIN_REASON`
    characters is given; reasons kept on `baseline_meta.quality_overrides`): branded question (spelling-tolerant),
    not-offered service, unconfirmed service, no approved town (invented location), **no core home-town question**.
  - **Warnings** (never block): one service in more than `MAX_QUESTIONS_PER_SERVICE` questions, fewer than half the
    confirmed services covered, keyword-style phrasing, near-duplicates, an urgent question when no emergency service is
    confirmed, services only Sales recorded.
  - The Hook Audit's questions get the same checks (still kept verbatim unless replaced with a reason).
- **The recommended 20** (`baselineRecommendation.ts`): the **two mandatory core questions** ("Can you recommend a good
  locksmith in Canterbury, UK?" / "Which locksmiths in Canterbury, UK have the best reviews?" — different intents, so
  the duplicate check never refuses the pair) are admitted right after the Hook questions; out-of-scope questions are
  NOT RECOMMENDED with the reason; **at most two per service**, counted by meaning, held even when it leaves the set
  short (the screen says how many to add). "Core" is said only of a core question (C-03's mislabel is gone).
- Exactly 20 is still enforced where it always was. Paul remains the final approver.
- No thin prompt pages: nothing here creates pages; the questionnaire no longer promises one page per town (below).

## 4. Onboarding questions (Session C client-facts audit, C-07 / M-025)

- Two optional questions on the client questionnaire's services screen (findable-site `OnboardingFlow.tsx`, its own
  branch): **"Anything you don't offer?"** ("We'll never measure you on it or describe you as offering it.") and **"What
  do customers contact you for most?"**. Sent as `services_not_offered` / `top_requests`, accepted by
  `findable-onboarding` in all three lists (answers / NEWER_COLS / optional) and in the Q2 path, saved in drafts.
- The same two fields are in the hub's Section A for Paul.
- Wording no longer promises a page per town, in both repos: "Each main service gets its own clear page. The towns you
  list tell us where to measure you and where real local pages make sense." (`manualOnboarding.ts` mirrors it verbatim;
  `manual-onboarding.test.ts` passes against the findable-site branch.)
- ⚠️ The master plan lists M-025 under WS-3 as well. If WS-3 also edits these lines, whichever merges second reconciles.

## 5. Freeze / reopen

Preserved: approval freezes; the baseline runs the frozen set; the replay asks the baseline's asked set verbatim.
Added:
- Reopen still requires a written reason and keeps the history (unchanged); a re-approval after a reopen re-runs the
  quality checks.
- **No backlog contamination (C-19):** at approval, an untouched `new` Discovery backlog row whose question is now IN the
  frozen set moves to `not_pursuing` with a history note — never deleted. Seeding is scoped, so a reopen can never seed
  an unsupported service.
- **Legacy rows (C-26):** a lead with a baseline pointer is refused `generate / save / approve / discovery_*`
  server-side (`baseline_already_measured`), not only hidden in the hub.

## 6. Budget separation (M-010, E-05, C-14)

- **New leaf `src/lib/auditBudget.ts`** — three pools chosen by the audit's stored purpose:
  `guarantee` (baseline, remeasure) · `client` (measurement, discovery, weekly_check) · `prospecting` (everything else,
  including any unknown or missing purpose). Each has its own rolling-24h ceiling (`POOL_DAILY_CAP_USD`; prospecting
  keeps the old ceiling). Each also has an **Apify reserve** (`APIFY_RESERVE_PCT`): prospecting stops early, client work
  a little later, the guarantee may run to Apify's own cap. The percentage is recomputed from used / cap.
- `_shared/enrichment/runner.ts`: spend is booked to its pool (`enrichment_usage.budget_pool`, migration
  `20261007040000`), the cap sums **only that pool**, the read pages past PostgREST's 1,000-row cap, and it is
  migration-tolerant (before the SQL: the guarantee is never refused by prospecting spend; the ledger insert retries
  without the column so no spend is lost).
- `process-ai-audit-queue`: each question start is capped by its own pool; the Apify reserve is enforced at start
  (row error `apify_reserve`); the single shared $12 constant is gone; start slots go to the guarantee first (one ranked
  scan of pending rows instead of an unbounded read of every multi-run audit ever made). SEO scans are booked to their
  audit's pool.
- `create-ai-audit`: a person starting a prospecting audit when the pool or its reserve is used gets the plain sentence
  "Today's checking budget is used — your leads are still here, try tomorrow or ask Paul." (internal callers unchanged;
  the queue still enforces).
- **Observable:** `paid-baseline get` returns `budget` (every pool's spend, ceiling, decision, and the Apify reading);
  the hub shows the client-measurement line under the baseline.

## 7. Failure visibility (C-11, M-027)

- **New leaf `src/lib/measurementHealth.ts`** — six states, distinguishable everywhere: `running`, `complete`, `partial`,
  `capped`, `failed_retryable`, `failed_permanent`, with a label ("118 of 120 answers — 2 missing (…)") and the action.
- **Root cause found and fixed:** `advanceBaseline` answered "waiting for runs" whenever every run had *started*, even
  with nothing in flight, so a run that failed (Apify's cap, a provider outage) left the chain waiting for ever and the
  give-up below it was unreachable. For a guarantee measurement with nothing in flight it now retries or holds.
- The engine records why it stopped on the audit (`baseline_error`, existing column); `deliveryStage` shows
  "Baseline stopped — open it to retry or accept" / "Re-measure stopped …" as Paul's step, so it lands in **Needs
  attention**; "Remeasure done — send results" appears only once the replay has frozen. (Small edit in WS-3's
  `deliveryStage.ts` / `client-setup.ts` — data only plus one branch each.)
- The stalled-baseline sweep rotates by last attempt instead of oldest-first, so held measurements cannot starve new ones.
- The hub's **MeasurementHealthPanel** shows each guarantee measurement's state with its buttons.

## 8. Completion rule

A guarantee measurement (baseline or re-measure) **freezes only at 120 of 120 answers** (questions × runs × engines),
or when Paul accepts it as partial with a written reason. Missing answers are never fabricated and never counted as
"not named"; the snapshot records `coverage` (complete, or the accepted-partial note). Every other multi-run audit
(free checks, Discovery, full measure) freezes exactly as before.

## 9. Retry / recovery

- **`retryMissingCells`** (`_shared/audit-baseline.ts`) re-asks ONLY failed queue rows, inside the runs that already
  exist. The claim is the conditional `failed → pending` update — a double press or the cron plus Paul re-queue each row
  once. No new run, no new audit, no second baseline pointer, the frozen question text untouched, attempts reset so the
  per-run cost cap counts the retry's own spend. A frozen measurement is never retried.
- One automatic retry round (`MAX_AUTO_CELL_RETRIES`), then the measurement is held for Paul.
- Hub actions (`paid-baseline`): **Retry missing answers**, **Accept as partial…** (only when nothing can be re-asked;
  reason kept on `baseline_meta.partial_accepted`), **Send four-week results**.
- **Known limit:** a cell where one engine returned nothing on an otherwise answered question is *not* retried
  (re-asking would re-ask the engine that did answer). It shows as partial; Paul accepts with a reason. Session C saw 0
  such cells in 12,950.

## 10. Re-measure safety (C-09, C-10, C-12, M-031..M-033)

- **Ended clients:** `isRemeasureDue` now refuses `service_terminated_at` itself (`service_ended`), not only the query.
- **Same frozen questions:** unchanged and re-tested — the replay asks the baseline's asked set verbatim.
- **Two cron invocations:** unchanged guarantee — the pointer trigger + one-replay-per-lead index; the loser reads
  `already_remeasured` as a race resolved.
- **Failure cannot consume success:** the results sender refuses a replay that has not **frozen**.
- **The verdict** (`measurementCompare.ts`) totals **matched questions only**, counts each engine on each side and flags
  an engine answering below `ENGINE_BALANCE_MIN_RATIO` of the other side; `remeasureResultsDecision` **holds** on that
  (and on a comparison with no engine count). The sender reads only each side's **frozen runs**.
- **Held results are no longer final:** a 15-minute sweep re-offers unsent frozen replays to the same claim-first sender
  (quietly — a standing hold is not re-emailed); Paul has a "Send four-week results" button. Still held while
  `REMEASURE_RESULTS_COPY_APPROVED` is false.
- **The date:** the cockpit picker is `required`, an empty selection is ignored, moving a stored date asks first, the
  "(8 wks)" label is gone; migration `20261007040200` makes the database refuse clearing the date of a lead with a
  baseline unless `app.allow_remeasure_clear` is set in the same transaction. No existing date is touched.

## 11. Scoring integrity (C-32)

The client-facing ruler is unchanged. Internal surfaces that read the model's verdict first now pass the business,
trade and town so the answer text is the ruler for a judgeable name, exactly like the client report: the frozen snapshot
(`aggregateRuns`), every run's stored `mention_rate`, the page generator's "already named" signal and the action plan.
Untouched (not paid-client measurement): hook state v1, market view, the AI Audit page's pooled view.

## 12. Competitors (C-16, C-17)

- The client can no longer be listed as its own rival: the self check uses the spelling-tolerant `nameMatches`
  ("MC Locksmiths" = "MCLocksmiths Centre").
- Obvious duplicate spellings of one firm are merged ("Keytek" / "Keytek Locksmiths") only when what remains after the
  trade word, the town and a legal suffix is identical and at least four characters — two different firms are never
  merged, nothing but a repeat is dropped.
- A failed competitor cleanup already released the run with an honest receipt; the answer cells stay valid and counted
  (re-tested). Not changed: the OpenAI rate tier (C-17) — a Paul decision.

## 13. Results claims (C-06, C-28, C-34)

- Four-week results: the gone-up branch no longer says "The pages and listings we built are what the engines are now
  reading". It says what was measured and that the work stays live and measured. No guaranteed recommendation,
  ranking or citation language (tested).
- Hook (sales) report: "Your guarantee is judged on a full 20-question measurement we run after you join, not on this
  quick check." before the byte-locked refund sentence; the footer no longer says "the same questions" on a quick check.
- A paying client's own baseline / re-measure report no longer carries the "Want to be one of the names? Request a call"
  pitch.

---

## Tests

New: `scripts/ai-measurement-truth.test.ts`, `scripts/ai-measurement-reliability.test.ts`. They cover: no unsupported
service; explicit negative respected; natural customer format; location not invented; duplicate, branded, coverage,
repetition and keyword warnings; core business question; the two core questions in the recommended 20; ≤ 2 per service;
no car keys in the backlog; approved set immutable / reopen reason / no duplicated backlog / remeasure same questions
(wiring); 120/120 complete; partial; capped; failed retryable / permanent; retry claim; duplicate-run prevention; two cron
invocations; prospecting exhaustion does not block a baseline or a re-measure (**through the real runner against a fake
ledger**, before and after the SQL); client budget state observable; ended client never re-measured; engine imbalance
holds; matched-only totals; results copy claims no cause.

Updated (each pinned behaviour this workstream changes on purpose, with a dated note): `client-context`,
`paid-baseline-state-flow` (Discovery no longer a source of services), `balanced-baseline` (customer core questions),
`baseline-methodology` (scoped seeding; larger approve window), `abuse-cost-protection` (ranked candidate scan).

Gate: see the final response for the `npm run check` result. findable-site: its own tests pass except the
`offer-terms` "eight-week" check and three `astro check` errors, all present on `origin/master` before this change.

## Files

LeadFinderOS — new: `src/lib/serviceScope.ts`, `customerQuestion.ts`, `baselineQuality.ts`, `auditBudget.ts`,
`measurementHealth.ts`, `supabase/functions/_shared/audit-budget.ts`, `src/components/MeasurementHealthPanel.tsx`,
3 migrations, 2 tests, this file. Changed: `process-ai-audit-queue`, `create-ai-audit`, `paid-baseline`,
`extract-competitors`, `findable-onboarding`, `page-generator`, `_shared/audit-baseline.ts`, `baseline-discovery.ts`,
`remeasure-results.ts`, `client-setup.ts`, `action-plan.ts`, `enrichment/runner.ts`, `src/lib/baselineMix.ts`,
`baselineRecommendation.ts`, `clientContext.ts`, `deliveryStage.ts`, `manualOnboarding.ts`, `measurementCompare.ts`,
`paidBaseline.ts`, `remeasureDue.ts`, `remeasureResults.ts`, `aiAuditReportHtml.ts`, `ClientHub.tsx`,
`OfficialBaseline.tsx`, `BaselineDiscovery.tsx`, `LeadDeliveryCockpit.tsx`, five tests.
findable-site — `src/components/OnboardingFlow.tsx`.

## Deploy order (for the deploy session — nothing here was deployed)

1. **SQL, one statement file at a time, read back:** `20261007040000_audit_budget_pools.sql`,
   `20261007040100_onboarding_service_truth.sql` (both additive); `20261007040200_remeasure_date_guard.sql` (adds a
   trigger to `outreach_leads` — show Paul first).
2. **Edge functions** (everything that reaches a changed shared module, from `check-import-graph --reached-by`):
   admin-overview, backfill-lead-towns, business-summary, check-website, conversation-triage, create-ai-audit,
   enrich-business, extract-competitors, findable-onboarding, market-view, niche-sample, page-generator, paid-baseline,
   paid-client-hub, process-ai-audit-queue, process-whatsapp-queue, prospect-preview, quick-close, render-audit-report,
   render-remeasure-results, render-welcome-pack, run-seo-scan, scan-site-details, send-whatsapp-message,
   stripe-webhook, submissions, voice-note-script, warm-lead-reply, weekly-visibility.
3. SPA (main → Cloudflare). 4. findable-site `npm run deploy` from a clean `master` worktree after merge.
5. The results sweep sends nothing until Paul approves the copy (`REMEASURE_RESULTS_COPY_APPROVED` stays false).

## Decisions for Paul (not made here)

- The pool ceilings (`POOL_DAILY_CAP_USD`: guarantee 10, client 8, prospecting 12 USD a day) and the Apify reserve
  (`APIFY_RESERVE_PCT`: prospecting 85%, client 95%) are first values to confirm. The Apify **monthly** cap itself
  (C-14) is still his call.
- Approve the four-week results copy (the causal sentence is gone).
- The OpenAI rate tier for competitor cleaning (C-17).

## What Session 7 needs from this branch

- `src/lib/auditBudget.ts`: `budgetPoolForPurpose`, `budgetDecision` (with the optional per-rep `repAllowance`),
  `POOL_DAILY_CAP_USD`, `APIFY_RESERVE_PCT`, `PROSPECTING_REFUSAL_MESSAGE`, `refusalRowError`.
- `_shared/enrichment/runner.ts`: `rollingSpendUsd(service, ownerId, pool)` (paged, migration-tolerant).
- `_shared/audit-budget.ts`: `latestApifyUsage`, `budgetState`.
- The `prospecting_budget_used` refusal shape from `create-ai-audit` (429, `detail` = the sentence, `reason`).
- Sales audits are `audit_purpose = 'audit'` → prospecting pool automatically; guarantee work is never affected.
- Session 7 still owns per-rep spend attribution (`actor_user_id` on audits) and the bulk path itself.

## Not done here (named, with the owner)

- C-23 opportunity-check start claim, C-25 pointer triggers into migrations, C-24 run pooling by surface, C-29 OpenAI
  spend in the ledger, C-33 the ledger's per-question rate — M-060/M-061 "later" items.
- C-13 (handoff into the build brief) — WS-6. C-15 (manual add-client overwrite) — WS-3.
- No hook-audit question style change: the hook's three questions are locked into the 20 verbatim (Paul, 30 Sep), and
  changing how they are written is a sales decision.
