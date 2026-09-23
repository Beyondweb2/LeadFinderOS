# Discovery progress — a durable server job, counted in measurements (2026-09-23)

## How Discovery runs (unchanged by this work)

- **Run Discovery** (Paid Clients → Prepare baseline → B) posts `paid-baseline` `discovery_run`, which
  calls `create-ai-audit` once: ONE audit (`audit_purpose 'discovery'`, `baseline_target_runs 3`),
  run 1, and one `ai_audit_queue` row per question. Each row asks **both** engines in one Apify call.
- Runs 2 and 3 are started by `advanceBaseline` on the 30-second cron tick, staggered
  `RUN_STAGGER_MS` after the newest run started, replaying run 1's questions verbatim. A failed run is
  replaced up to `MAX_EXTRA_ATTEMPTS`; each row retries up to `MAX_ATTEMPTS` inside the queue.
- When the target is met `advanceBaseline` writes `ai_audits.baseline` + `baseline_completed_at`.
  `onBaselineFrozen` returns at once for any purpose but `baseline` — Discovery hands nothing on.
- The browser was never needed to keep it alive. What was wrong was the READ side.

## What was wrong

- The button said "Discovery running (0/3 runs)": a run only counts when all 49 of its questions land.
  At 154 of 294 measurements it still read 0/3.
- Rows said "named in 1/1 runs" with no hint that 6 measurements were expected.
- The dialog never re-read, so an open dialog looked frozen; reopening re-read (so nothing was lost).
- Start was read-then-write (two tabs could start two paid jobs); a finished pool could be re-run;
  regenerating mid-run detached a running job from the screen while it kept spending.

## What it is now

- `src/lib/discoveryProgress.ts` — pure, edge-safe, no imports. `discoveryProgress()` counts
  measurements = question × engine × run from the stored rows. Per (question, engine) there are exactly
  `targetRuns` slots: answers first (capped), failures fill what is left (capped) — so a replaced
  failed run stops counting and a failure never erases an answer. An engine missing from a `done` row
  is a failed measurement for that engine. Job status is enumerated: complete / complete with failures
  (finalised) · running (open rows or runs, or runs still due) · needs attention (nothing open and a
  recorded `baseline_error`, or nothing moved for `DISCOVERY_STALL_MS`). `stalled` flags open work
  that has not moved.
- `poolVersion()` — stable hash of the pool (order/case/whitespace-free). `poolMatchesJob()` — a job
  is attached to a pool only if every question it measured (run 1's rows) is in the pool; otherwise
  `discovery.mismatch` is reported and nothing is mixed.
- `baseline_discovery` gains `pool_version`, `audit_pool_version`, `run_claimed_at`, `history`.
- `discovery_run`: starting → skip; job running → answers with itself; job finished → 409
  `discovery_already_run` (regenerate to measure again). The start is a **compare-and-set** on the
  row (`generated_at` equal, `audit_id` null/equal, `run_claimed_at` null/equal — PostgREST JSON-path
  filters, verified live); a lost claim returns before any engine is asked; a failed start releases
  only its own claim. A lost audit-id write is covered by the existing fallback lookup.
- `discovery_generate` is refused (409 `discovery_running`) while a job runs; after, the old pool's
  job goes to `history`. No measurement is deleted.
- UI (`BaselineDiscovery.tsx`): progress bar, "N / 294 measurements · %", questions fully measured,
  ChatGPT / Gemini counts, failed, started / last update, per-question "ChatGPT 2/3 · Gemini 1/3",
  "named in N of M answered runs so far (partial)", "Provisional — Discovery still running" on the
  groups. `useDiscoveryPoll` re-reads `get` every `DISCOVERY_POLL_MS` while starting/running, replaces
  ONLY the discovery block (the draft on screen is untouched), stops when the job ends or the dialog
  closes. The hub keeps its own single poller.
- Tests: `scripts/discovery-progress.test.ts`.

## BS4 verification (production, 2026-09-23)

Job `ef764f55` was already running when this shipped; no new job was started, and it stayed the only
Discovery audit for the lead.

- Mid-run, production read 284/294 (96%), 44/49 questions, ChatGPT 142/147, Gemini 142/147, both
  Discovery buttons disabled, groups labelled Provisional, rows "Running · ChatGPT 2/3 · Gemini 2/3"
  and "named in 0 of 2 answered runs so far (partial)".
- Closed the dialog → another page → full reload → reopened: 286/294, restored from the stored rows.
- All 147 rows landed by 13:28 UTC; the runs were then held ~23 min by competitor cleaning hitting
  the gpt-4o 30k TPM limit (429) until `RETRY_CLEAN_CAP` (4) released them with `gave_up_at` (rival
  names withheld on those runs — existing, bounded behaviour). The job correctly read "running".
- Finalised 13:51:37 UTC: 294/294 measurements, 49/49 questions, ChatGPT 147/147, Gemini 147/147,
  0 failed. The open dialog switched itself to "Discovery complete" and stopped polling; the
  Provisional labels went. Final groups: Winnable 41 · Possible 1 · Already named 5 · Weak 2
  (provisional had been 39 · 1 · 5 · 4).
- Baseline untouched: status needs_approval, no approval, no baseline audit, no remeasure date.

⚠️ The long tail of a 49 × 3 Discovery is the cleaning hold under the OpenAI rate limit (~23 min),
not the engines (~49 min of answering).
