# Audits always finish (v1-audits-always-finish, 2026-11-18)

## What happened

- 18 Nov from ~08:40 UTC every AI-search run on Apify (`apify~google-search-scraper`, one run per question asking ChatGPT +
  Gemini + Google AI Mode together) hung. 36 questions in a row: 3 tries x 12 min each (`run_age_exceeded`), 0 finished.
  Same pattern on 16 Nov 11:30 (12 of 15 Quick checks).
- Not billing, not limits: Apify spend froze at $1.39 of a $50 cycle (new cycle 17 Nov) while ~10 runs sat "active"
  (10 GB of 64 GB memory, 10 of 32 concurrent runs). The runs started, used nothing, returned nothing.
- No code change on our side between 17 Nov 23:19 and the outage. So: Apify actor / engine side.
- Why it spun for hours: each hung question cost 37 min (3 x 12 + ticks), and the WhatsApp first-reply audit lane
  (`_shared/first-reply-audit.ts`, up to `FIRST_REPLY_AUDIT_MAX_ATTEMPTS` = 5 fresh audits with backoff) started a new
  audit every ~40 min for the same 12 Reading driving schools (Valentin's campaign) — every one failing the same way.
- Before 18 Nov the same weakness showed as retries: 192 of 300 questions on 11 Nov and 189 of 286 on 14 Nov needed a
  second run (they finished on retry).

## What changed

- `_shared/enrichment/ai-search-lanes.ts` (pure, tested in `scripts/audits-always-finish.test.ts`):
  - the first run is the normal one (all engines, cheapest);
  - when it fails or hangs, the question is NOT asked the same way again: it splits into one Apify run per engine
    ("lanes"), keeping anything the failed run returned (its dataset is read after the abort); a lane gets one more try
    (`LANE_MAX_TRIES`); only missing engines are ever asked again;
  - settled lanes merge into one dataset item the normal path reads unchanged; an engine that never answered is absent
    (`_missing_engines`), which the report already shows as "Couldn't measure";
  - `ROW_DEADLINE_MS` (60 min from queueing, only for questions that were started): the question ends with what it has,
    or `deadline_exceeded`;
  - every failed attempt keeps Apify's `statusMessage` + log tail in `_failures` on the row — the next outage names the
    engine that hung.
- Every start sends Apify's own `timeout` (`APIFY_RUN_TIMEOUT_SECS` = 13 min) so a hung run stops itself even if our
  abort never lands. The 12-minute age guard is unchanged.
- Lanes count against `AUDIT_IN_FLIGHT_CEILING`; lane starts are claimed by `updated_at` (one tick only); they pass the
  same run cap, pool cap, Apify reserve and paid-action mode as any start.
- `deadline_exceeded` / `no_items` count as provider failures (Quick check auto-retry, "did not finish in time" alert).
- Lead workspace wording: "Audit incomplete: the AI search didn't finish in time, so there is no report. Run it again later."

## Not changed

- Apify memory (1 GB per question run) and plan concurrency (32): the outage was not a capacity problem.
- Budgets, caps and keys.

## "Couldn't start the audit — Edge Function returned a non-2xx status code" (same day)

- A rep pressing Audit on a Reading driving school got this. Cause: create-ai-audit allows a salesperson
  `SALES_HOOKS_PER_LEAD_PER_DAY` (3) hook audits per lead per 24 h and counted EVERY audit on the lead — including the
  automatic reply-chain audits that had all failed (HSM had 6). Refused with 429 `hook_limit_for_lead`.
- The screen hid the server's sentence because Inbox / AiAudit called `supabase.functions.invoke` directly (a non-2xx
  gives only the SDK's generic message).
- Fixed: `src/lib/hookLeadLimit.ts` — an audit whose every run failed or was cancelled does not count (in-flight and
  no-run-yet audits still count). Inbox and AiAudit start audits through `invokeCreateAudit` (`src/lib/createAuditCall.ts`,
  `invokeEdge` + `edgeErrorMessage`), so a refusal shows its reason.
- `src/lib/reAudit.ts` still calls `supabase.functions.invoke` (it takes an injected client); admin-only path, left.

## Result (18 Nov, read back 14:30 UTC)

- Before (09:00–12:59 UTC): 46 questions ended, 46 failed (`run_age_exceeded`), 0 done.
- After the fix (13:00–14:30 UTC): 17 questions ended, 17 done, 0 failed. Each one: normal run hung
  ("Nothing extracted yet"), then ChatGPT + Gemini lanes answered, Google AI lane hung again
  (`_missing_engines: ["ai_overview"]`). Google AI is display-only, so every score was complete.
- The 10 re-opened audits (newest failed audit per lead today, re-run free via `late_retry.kind = manual`) all
  finished `complete`. No question left running or pending.
- Still to watch: the Google AI Mode add-on of `apify~google-search-scraper`. Until it comes back, every question
  pays one hung 12-minute normal run before the lanes start (~15–20 min per audit instead of ~5).

## Google AI apart + the hedge (18 Nov, v1-ai-mode-separate)

Paul: audits took 15–20 min because the combined run waited 12 min on the broken Google AI Mode before splitting.

- **Every question now starts two Apify runs side by side:** the normal run asks ChatGPT + Gemini only
  (`buildScoredInput` in `_shared/enrichment/ai-search-lanes.ts`, Google AI switched off explicitly), and the
  `ai_overview` lane asks Google AI alone (one try, display only). Each question takes two slots against
  `AUDIT_IN_FLIGHT_CEILING`.
- **A question finishes when ChatGPT and Gemini are settled** (`scoredSettled`). Google AI is folded in if it is back;
  otherwise its run is aborted, the lane is marked `cut_at_finish`, the overview stamp is removed and `_aio_reason` reads
  `google_ai_cut_at_finish` — never "Google showed none" (the results page alone would have implied that).
- **Timeouts — a hedge, not a shorter cap.** `MAX_RUN_AGE_MS` stays 12 min (at 5 min it once culled healthy runs into a
  retry storm). After `HEDGE_AFTER_MS` (4 min) an unanswered scored engine is ALSO asked on its own run while the normal
  run keeps going; whichever answers first counts and the other is aborted. A scored single-engine lane is retried after
  `LANE_RUN_AGE_MS` (5 min), two tries. An engine that is down ends the question with what came back, or
  "Audit incomplete" when neither answered.
- Measured before (154 clean single-question audits, 11–18 Nov, queue start to last answer): median 3.75 min, p75 5.5,
  about 1 in 5 past 5 min. So the hedge fires on roughly the slow fifth.
- Each finished question records `_timing: { finished_secs, normal_secs }` (normal_secs = Apify's own run time).
- Only `process-ai-audit-queue` reaches the changed code (ai-search.ts untouched on purpose).
- **Proof (18 Nov 14:48 UTC, 3 ZZ QA audits × 3 questions, re-run through the normal start path):** whole audit
  3.5, 4.1 and 6.5 min (median 4.1). Normal runs (ChatGPT + Gemini) took 87–206 s; 8 of 9 questions finished on
  the normal run; 1 was hedged at 4 min and finished from its own-engine runs at 6.4 min. Google AI came back in
  time on 7 of 9 and was cut on 2 (`google_ai_cut_at_finish`) without delaying anything. ⚠️ These QA audits are
  Overview-era (older method), so their Google AI run asks the Overview, not the broken AI Mode — the scored-engine
  timings are what this proves. Before: median 3.75 / p90 9.6 min on clean days (11–17 Nov); 18 Nov morning median
  37.5 min, after the lanes fix ~15–20 min.
