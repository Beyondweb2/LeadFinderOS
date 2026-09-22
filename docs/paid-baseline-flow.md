# The paid-baseline state flow — approve once, claim once, one poller (2026-09-22)

Record of the MCLocksmiths "Prepare Baseline" fault and its fix. CLAUDE.md §4 carries the two rules
this taught; §10 points here. Methodology unchanged: **Discovery is separate research; the paid
baseline is exactly `BASELINE_QUESTIONS` (20) approved questions × `BASELINE_RUNS` (3) runs on ChatGPT +
Gemini; the day-28 replay repeats the ASKED set verbatim** (`docs/measurement.md` §19).

## What Paul saw

Prepare Baseline for MCLocksmiths: a white spinner; "loading starts, stops, starts again" a few
times; the questions then appear frozen and the screen asks for approval/run again; pressing it puts
him back on the same screen. Approve at 01:23 UTC on 2026-09-22 had written `baseline_status =
'approved'` with 20 questions, `audit_id` NULL, `baseline_audit_id` NULL. No baseline audit existed
and none was ever duplicated. The two Discovery scans (`dff25511`, `50986aa3`) and the 2026-09-03
hook audit (`e1b3acb4`) were the lead's only audits.

## Root cause — three faults, one screen

1. **The dialog was unmounted by its own parent, three times per click.** `BaselineSetupDialog.act`
   ended every server call with `await onChanged()`, which was `ClientHub.load`; `load` set the
   page-level `loading` flag, so the whole page swapped to a spinner and the dialog UNMOUNTED. On
   remount it fetched the row again (spinner). `approveAndRun` chained save → approve → run, so the
   page flickered three times while the original chain ran on detached from any screen. That is the
   loop. A refusal on the run step reached a toast only; the remounted dialog showed the frozen
   questions and a "Run approved baseline" button with no explanation.
2. **Approve never asked the engine's own start gate, so run was silently deferred forever.**
   `startPaidBaseline` waits for `confirmed_location` **and** at least one service
   (`missingQuestionnaireFields`, the post-payment questionnaire rule) and answers
   `ok: true, skipped: "awaiting_questionnaire_2 (services)"` — the right answer for the webhook,
   whose customer may still be filling the form in. MCLocksmiths' onboarding row has no services
   anywhere (onboarding `services`/`services_list` NULL, lead `services_included` NULL, crawl
   `siteInfo` NULL, both Discovery audits `specialism` NULL). The operator's Approve did not check
   this, so the row froze at `approved`; every Run came back "approved but waiting" with the raw
   token; the UI locked section A at `approved`, so the missing service could not even be added.
   A deadlock that looked like a loop.
3. **Three starters and no claim.** The operator's Run, the 30-second queue backstop
   (`ensureBaselinesForPaidOnboardings`, which reaches the same `approved` row every tick — the
   paid-baseline comment saying "its approval guard blocks those callers" was false: the guard
   blocks them only UNTIL approval) and the Stripe webhook all read "does this lead already have a
   baseline?" and then paid. Two inside the same second both read "no". Nothing recorded — the audit
   never existed — but it is the 2026-09-12 ten-duplicates shape with a smaller window.

Also found on the way: `paid-client-hub` selected `ai_audit_runs.completed_at`, a column that does
not exist (schema read back 2026-09-22). PostgREST refused the whole query, `runs` came back empty,
and every running baseline showed "Run 1: waiting · Run 2: waiting · Run 3: waiting".

## The fix — the state machine, written once

`src/lib/paidBaselineState.ts` is the one place for statuses, transitions and words:

```
needs_questions → needs_approval → approved → starting → running → complete
                                                 ↑           │
                                                 └── revert ──┘   (create-ai-audit refused)
```

- **`starting` is the claim.** `startPaidBaseline` does every check as a read, then ONE conditional
  write — `approved` (or a `starting` older than `START_CLAIM_STALE_MS`, 5 min: a crashed starter)
  → `starting` — via `startClaimFilter`; exactly one caller wins. The loser returns
  `start_in_progress` and the screen shows "Starting baseline" and polls. A refused create releases
  the claim back to `approved` (never `failed`, which used to unlock the frozen questions); a throw
  releases it in the catch (`claimHeld` is declared outside the `try` — `edge-catch-scope`). An
  existing audit repairs the row to `running` instead of returning silently. `onBaselineFrozen`
  marks `starting` rows complete as well.
- **Approve asks the start gate** (`contextRefusal` in `paid-baseline`): missing location/services,
  business type or location → `422 baseline_context_incomplete` with a sentence naming the field.
  The exact-20 rule stays. Approving an already-approved row is a no-op.
- **Run's skips are refusals**, returned as `409 baseline_start_refused` + `describeStartSkip(...)`
  in operator English; `start_in_progress` answers `starting`; `!ok` answers `502` with the
  engine's reason and leaves the row `approved`.
- **Section A stays editable on an `approved` row** (questions frozen, context not) — the server
  always allowed it; the UI locked it. That is what lets MCLocksmiths be completed without any data
  correction: type the services, Save client context, Start baseline.
- **The dialog** (`ClientHub.tsx`) runs approve → run through `src/lib/paidBaselineFlow.ts` (a pure
  controller: approve once, run once, the server's sentence on refusal) behind a single-flight guard
  (`createSingleFlight` — a second press while busy makes no request), shows one status line
  (`paidBaselineStatusLabel` + the in-flight verb), shows every refusal inline with `role="alert"`,
  refreshes the parent ONCE at the end, and the parent's `refresh` never touches `loading`.
  Save-before-approve is gone (approve freezes exactly what it is sent). A dirty section A is saved
  first in the same chain.
- **One poller.** `ClientHub` re-reads `paid-client-hub` every `HUB_POLL_MS` (15 s) only while the
  status is `starting` or `running`, and stops on its own. It is a read; it cannot start anything.
- **Spinner**: `text-primary` on the page and dialog spinners (they were bare `animate-spin`, white
  on the dark theme). Same class every other accented spinner in the app uses.
- **Autofill**: `mergeClientContext` gains a `discovery` source — the newest Discovery scan's stored
  `business_type`, `location_text`, `website`, `specialism` (operator-typed, so it ranks above the
  crawl and below the onboarding/lead facts); its QUESTIONS are never read. Section A says where
  each fact came from and that a blank field has no verified source. For MCLocksmiths today that
  yields category, town and website (all already on the lead) and no services — nothing is invented.

## Tests

`scripts/paid-baseline-state-flow.test.ts` (55 checks): approve fires once and run fires once
under a double press (fake server, real controller); a lost claim shows `starting`; a thrown server
refusal and a legacy "approved but waiting" skip both surface as sentences; the refresh never flips
`loading`; exactly one poller and it only reads; the claim simulation (first claims, second cannot,
stale reclaimable, running/complete never); the claim precedes the spend and is released on refusal
and throw; the spinner classes; Discovery graded `discovery` and never a baseline, its select never
reads questions; 20 × 3 at every layer; legacy completed baselines read `complete`. Four older
suites that asserted the save → approve → run sequence were updated to the controller.

Left as found, both pre-existing on `origin/main` and unrelated: three new type errors
(`Inbox.tsx` ×2, `OutreachTable.tsx`, Lucide `title` props) that make `typecheck:baseline` red, and
`check-edge-undefined` on `page-generator/index.ts:898,903` (`user`). `onboarding-audit-fields`
fails on findable-site text (also pre-existing).

## Deploy

SQL: none. `baseline_status` is unconstrained text; `starting` needs no migration. Edge functions to
redeploy (transitive closure of `_shared/audit-baseline.ts` and `src/lib/paidBaselineState.ts`, plus
the two edited directly): **`paid-baseline`, `paid-client-hub`, `process-ai-audit-queue`,
`stripe-webhook`, `render-remeasure-results`**. Order: the shared-module functions
(`process-ai-audit-queue`, `stripe-webhook`) BEFORE or WITH `paid-baseline`, so no caller runs the
old unclaimed start beside the new claimed one. `paid-client-hub` has its `config.toml` entry now.

## MCLocksmiths — what to do after deploy

Open the hub → Start baseline → section A → type the services (nothing verified holds them) →
Save client context → Start baseline. No row needs correcting. The backstop will also start it
within 30 s of the services being saved; whichever wins, the other sees `start_in_progress`.
