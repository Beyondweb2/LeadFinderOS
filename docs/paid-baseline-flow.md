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

## Follow-up the same day: 401s on /paid-clients while signed in, and "No paid clients yet."

Paul opened /paid-clients at 02:16 UTC (53 minutes after his 01:23 approval) and got one 401 each
from `paid-client-hub` and `submissions`, an unhandled rejection, and the empty-state card. The
gateway log showed exactly those two 401s, one request each. Nothing about the deploy caused it:
neither function's auth code changed and `paid-client-hub` was already `verify_jwt = true` by
platform default. The exact response body could not be recovered (the analytics endpoint retains
only minutes), so the mechanism is established from the installed libraries and reproduced by hand:

- supabase-js `_getAccessToken` = `auth.getSession().session?.access_token ?? supabaseKey`. When the
  stored access token has EXPIRED, auth-js `__loadSession` refreshes it first; if that refresh fails
  for a *retryable* reason (this project's token endpoint runs 1–35 s; a backgrounded/mobile tab
  runs no refresh ticker) auth-js keeps the session, fires no SIGNED_OUT, and answers
  `session: null`. supabase-js then sends the **anon key**. The gateway accepts it (a valid JWT);
  the handler's `getUser()` finds no user; 401 — `{"ok":false,"error":"unauthorized"}` from
  paid-client-hub and `{"ok":false,"error":"Auth required"}` from submissions, both reproduced by
  sending the anon key. React still holds `user` from useAuth, so the operator looks signed in.
  A gateway rejection has a different body (`UNAUTHORIZED_LEGACY_JWT / Invalid JWT` for a bad or
  expired token, `UNAUTHORIZED_INVALID_JWT_FORMAT` for a non-JWT bearer).
- `PaidClients.load` had no catch (the unhandled rejection) and rendered `clients.length === 0`
  as "No paid clients yet." — a failure painted as an empty list.
- Its list spinner was a bare `animate-spin` Loader2 — the remaining white loader.

**Fix.** `src/lib/edgeInvokeCore.ts` (pure) + `edgeInvoke.ts` (bound): every protected call
resolves the session first (one explicit refresh if it is missing), sets `Authorization` itself so
the anon key can never travel, refreshes once and retries once on a 401, and treats a 401 that
survives a fresh token as a genuine sign-out (`signOut({scope:'local'})` → the existing
ProtectedRoute → /auth flow). A refresh that cannot complete is a *transient* error to retry, never
a sign-out and never "no data". Used by PaidClients, ClientHub, useSubmissions (with `retry` off
for auth errors — the repeated-401 loop) and invokePaidBaseline. PaidClients waits for `useAuth`,
has loading / error-with-retry / loaded states, and its spinner is `text-primary`.
`scripts/edge-invoke-auth.test.ts` (21 checks) drives the invoker with a fake client.

## Second follow-up: "401 then 500" on the detail page, the word `server_error` on screen

Reproduced with a one-off operator token (Auth admin magic link on the data account, revoked
straight after): `paid-client-hub get` 200, `paid-client-hub list` **500 `server_error`**, and
`paid-baseline get` **401 `unauthorized` after 19.6 s on the same valid ES256 token** that then
answered 200 twice. The handler log held the 500's cause: supabase-js threw the **Cloudflare 522
"Connection timed out" HTML page** it received from PostgREST — the API did not answer; the
function's `catch` turned it into a bare `server_error`. The 401 is the same fault on the other
call: the handler's own `getUser()` did not answer, `data.user` was null, and the function said
"unauthorized" about a token the auth service never looked at. Under the session-safe invoker that
reads as: send → 401 → refresh → retry → 522 → 500, which is exactly what Paul saw; one more
transient 401 and the invoker would have signed him out.

**Fix.** `_shared/operator-auth.ts`: `resolveOperator` bounds `getUser()` (`OPERATOR_AUTH_TIMEOUT_MS`)
and answers **503 `auth_unavailable`** with a sentence for anything that is not a definite refusal
of the token (`classifyAuthFailure`: 401/403 or an invalid/expired-JWT message → `unauthorized`;
timeout, 5xx, HTML, fetch failure → unavailable). Both operator functions use it. Their `catch`
classifies the API not answering (`isUpstreamOutage`: 522/5xx page, fetch failed, timed out) as
**503 `upstream_timeout`** with a sentence; the 500 fallback carries a sentence too. The hub's
`client_pages` select named three columns that do not exist (`existing_url`, `recommendation`,
`priority`) and swallowed the 42703, so pages were always empty — fixed and every query error is
now thrown. `edgeErrorMessage` maps known tokens to sentences and quotes an unknown one inside a
sentence, so no screen prints `server_error`; ClientHub gets an error panel with Try again.
`scripts/paid-client-hub-resilience.test.ts` (28 checks). Redeployed `paid-baseline`,
`paid-client-hub`.

## MCLocksmiths — what to do after deploy

Open the hub → Start baseline → section A → type the services (nothing verified holds them) →
Save client context → Start baseline. No row needs correcting. The backstop will also start it
within 30 s of the services being saved; whichever wins, the other sees `start_in_progress`.
