# Paid baseline workflow: Hook Audit → Discovery → recommended 20 → freeze → re-measure (2026-09-30)

Paul's brief: make the paid-client measurement flow simple, defensible, repeatable. Methodology is
fixed and unchanged in size: **20 approved questions × 3 runs × ChatGPT + Gemini, frozen, replayed
verbatim**. What changed is how the 20 are chosen, what the screen says, and what happens to the rest.

## How it worked before (audit)

- **Hook Audit** (`audit_purpose 'audit'`, 3 q × 1 run, both engines) — never carried into the paid
  baseline anywhere (seeding deleted 2026-09-12). BS4's draft held none of its 3 Hook questions.
- **Discovery** (`paid-baseline discovery_generate` / `discovery_run`) — pool stored on
  `onboarding_responses.baseline_discovery`, measured as one Discovery audit × 3.
- **Classifier** (`discoveryOpportunity.ts` → `classifyWinnability`): Winnable = `open`, Possible =
  `contested`, Weak = `locked` or `no-local-race`, Already named = named in ANY answer.
- **"Add to baseline" / "Generate balanced baseline"** — `buildBalancedBaseline` over the pool, never
  reading winnability. Paul had to read a wall of classifications and pick by hand.
- **Approve** freezes `baseline_questions` (exactly 20, near-duplicate refusal); `startPaidBaseline`
  claims `approved → starting`, create-ai-audit queues them × 3; runs 2–3 replay run 1.
- **Re-measure** (`fireDueRemeasures`) replays the baseline audit's run-1 asked set; the verdict
  (`_shared/remeasure-results.ts` → `compareMeasurements` → `movement === 'improved'`, `NOISE_BAND_PP`)
  pools answered cells of the baseline audit vs the replay audit, keyed by audit id.
- Nothing existed for ongoing improvement after the baseline.

### What was wrong

1. **Classifier: two rulers on one row (a real bug).** "named in N of M runs" counted
   `named || self_named`; the verdict read `cellNamed` of a merged cell whose `self_named` OR-ed to
   `undefined`, falling back to another run's string match. Fixed: one `cellNamed(cell, {business,
   trade, town})` judgement per answer drives the per-engine counts AND the merged cell. Thresholds
   unchanged. **BS4's groups did not move** (41 · 1 · 5 · 2 before and after) — the confusion there was
   the wording.
2. **"3/3" wording.** It meant measurements received. Now always `MEASUREMENTS ChatGPT 3/3 complete ·
   Gemini 3/3 complete` / `NAMED ChatGPT 0/3 · Gemini 0/3` / `OPPORTUNITY …`; hub run progress says
   "measured"; the internal baseline page says "named". Named 0/3 with 3/3 complete is correctly Winnable.
3. **🔴 The day-28 replay could not get past run 1.** `advanceBaseline`'s repeat carried no `lead_id`;
   create-ai-audit refuses a remeasure without one (and would then have refused `already_remeasured`).
   Every replay would stall at run 1 and re-post every 30 s. No replay had fired yet (RG is first,
   2026-10-06). Fixed: lead id sent for a remeasure repeat only; the replay's OWN repeat
   (`reuseAuditId === remeasure pointer`, stored purpose remeasure) passes that gate and is still judged.
4. **Replay gate compared positions the database never recorded.** Every queue row of a run shares one
   `created_at` (read back: 1 distinct timestamp per run on all paid baselines). `judgeRemeasure` now
   compares the SET: exact text, each once, same count. The approved order stays in `baseline_questions`.
5. `save` wrote without the editable-status filter (a save racing approval could unfreeze) — fixed.
6. Area warnings demanded one question per town ("14 areas not covered") — replaced (below).

### Not changed, reported

- The guarantee's BEFORE side pools every run of the baseline audit, not the frozen first 3
  (`loadRemeasureBundle`). Identical for RG, MCL, White Sparks, SC (3 complete runs each). **Ronnie's
  baseline `1a0603aa` is 5 runs asking different questions (3,3,5,5,2)**: his replay will ask run 1's 3
  questions against an 18-question before side. Paul's decision.
- Legacy baselines are 12 (RG, White Sparks), 18 (Ronnie), 10 (SC), 20 (MCL) questions. Untouched.

## Now

- **Official 20 = the Hook Audit's questions (up to 3, locked, verbatim, first) + the rest from
  Discovery** (`src/lib/baselineRecommendation.ts`). Hook = the lead's FIRST ordinary audit, never the
  baseline pointer (`hookQuestionsFor`, `_shared/baseline-discovery.ts`). A Hook question can leave only
  with a written reason (≥ `HOOK_REPLACEMENT_MIN_REASON`); the server refuses `hook_question_removed`
  otherwise; reasons are kept on `onboarding_responses.baseline_meta`.
- **Per-question verdict**: NOT RECOMMENDED (no approved town; named in every answer on both engines;
  no local race) · RECOMMENDED · KEEP AS FUTURE OPPORTUNITY (with why). Selection =
  `buildBalancedBaseline` with the Hook questions `locked` and an opportunity RANK as tie-break only
  after the balance score (not named yet → first). Balance decides; a rank cannot make the 20 the
  easiest questions. "Why these" is computed from the actual 20.
- **Generate recommended baseline** (`generate`) writes that draft; Paul reviews rows (source badge,
  service, area, reason, measurements/named), edits, adds, pastes; approve freezes.
- **Exceptional correction**: `reopen_approved` — only `approved`, not started, reason required,
  history in `baseline_meta.corrections`. Started = never.
- **Warnings are representative**: home area missing, only one geography, a main service missing
  (`MAIN_SERVICE_COUNT` first-listed), one service dominating, near-duplicates. Unused areas are an
  information line and stay in the backlog.
- **Opportunity Backlog / Ongoing improvements**: table `client_opportunities` (RLS on, no policies,
  service-role only via `paid-baseline` `opportunities` / `opportunity_save` / `opportunity_check`).
  Approval seeds it with the Discovery questions not in the 20 (`backlogCandidates`, additive). Statuses
  and the closed action list in `src/lib/opportunityBacklog.ts`. A check = a priced Discovery audit over
  the chosen items (`recheck_audit_id`), excluded from the Discovery-job fallback. ⛔ Nothing in the
  guarantee path reads the table.
- **Collapse**: `src/components/CollapsibleSection.tsx` (`useSectionOpen`, `SectionToggle`,
  `CollapsibleBlock`), remembered per user (local tier, scoped to user id), body unmounted when shut.
  `Panel collapseKey`, `DashboardSection`, every hub `Stage`, the Discovery lists (collapsed by default).
- **Hub summary**: official baseline, baseline visibility (named / expected over the frozen runs,
  `paid-client-hub`), remeasure date, backlog open / active / waiting.

## BS4 dry run (live data, read-only)

3 Hook + 17 Discovery; 7 of 7 towns, 9 of 11 services; 4 broad · 6 service · 8 service+area · 2
emergency; 18 not named yet · 2 partly named; no warnings; 30 questions would seed the backlog. BS4's
stored draft has none of the 3 Hook questions — approval refuses it until the recommendation is used or
a reason is given.

## Tests

`scripts/baseline-methodology.test.ts` (100 checks: Paul's 12 properties + ruler fix + replay fix +
collapse). Updated: balanced-baseline, baseline-replay, discovery-progress, clienthub-baseline-dry-run,
paid-baseline-progress, paid-client-hub-no-writes, ui-cleanup-pass.
