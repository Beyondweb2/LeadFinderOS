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
