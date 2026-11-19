# Audits heal themselves (v1-audits-self-healing, 2026-11-19)

## What happened (19 Nov, 16:13–16:23 UTC)

- 15 audits went in together (Kingston electricians, one question each). Each question takes 2 Apify runs (ChatGPT +
  Gemini, and Google AI beside it), so the batch held ~30 of the Starter plan's **32 concurrent runs** (64 GB memory).
  Apify's own readings today: 24–29 active at the 10:55–11:25 batch; spend $2.91 of $50, so not billing.
- At 4 minutes the hedge asked ChatGPT/Gemini again on their own runs: up to 30 more starts. Apify refused them.
  `startLaneRun` booked each refusal as a failed try (`start_failed`, Apify's body was dropped), two refusals seconds apart
  used up Gemini, and `scoredSettled` then **ended the question without Gemini, aborting the normal run that was still
  going** and would have answered. 6 audits finished with Gemini missing; Rein Electrical lost both engines (failed).
  AGM GoDrive (16:05) is the other kind: Gemini's own run hung ("Nothing extracted yet") twice.
- One line: **the 4-minute hedge pushed us over Apify's 32-run limit, and a refused hedge was counted as Gemini failing.**
- Same shape at the 10:45 batch (41 questions: 4 failed, 4 `start_failed`).

## What changed

- **Run scheduler** (`_shared/enrichment/apify-slots.ts`, pure): one slot budget per tick = fewer of (24 − our live runs)
  and (Apify's live free runs − 4 for other actors, and free memory − 8 GB). Apify's live count is read every tick
  (`readApifyLive`, `/v2/users/me/limits`); unreadable → our own count. Every start takes a slot first; none = the lane
  stays pending, its tries untouched (`waiting_for_slot`). Hedges go last (`hedgeMayStart`: no question waiting for its
  first run, 2 slots spare). New questions share the same budget (2 slots each).
- **Plan full is never a try**: starts go through `startApifyRunExplained` (`_shared/enrichment/apify-start.ts`), which keeps
  Apify's error type + message; `isCapacityRefusal` (429, or a 402/403 naming memory / concurrent runs) → wait. Out of
  credit is still a real failure (the refusal alert must see it). The note goes into `_failures` (`apify_full`).
- **A failed hedge never settles its engine while the normal run is alive**: `scoredSettled(lanes, normalAlive)`.
- **Self-heal** (`src/lib/auditSelfHeal.ts`, sweep in `_shared/quick-check-retry.ts`, replaces the Quick check's one
  retry): an ordinary audit (purpose `audit`, one run, 1–12 asks) that is incomplete because the AI search did not answer is
  re-opened 30 min, 2 h and 6 h after it last settled. Only missing answers: a failed ask → pending (one start); a partial
  ask → running with only its missing engines as lanes, its result kept in `_heal_base` and merged back (`healMerge`;
  ChatGPT's answer is never replaced). Run stamp `results.self_heal { rounds, gave_up }`; after round 3 the plain reason
  ("Gemini didn't answer after 3 automatic re-runs…"). Same audit and run → never charged to a rep. `competitor_cleaning`
  is dropped so the firm reading reads the new answers. **A healed run sends nothing** (`isHealRun`: no free-check result,
  completion pitch, stalled flag or baseline step). Budget refusals, baselines, Discoveries, measurements are never healed.
- **Alerts**: AI-search causes (`search_timeout` / `search_failed`) no longer alert per audit (`causeAlertsPerAudit`).
  Instead `checkRateDrop` (queue tick, every 5 min, `_shared/ai-search-health.ts`, rules `src/lib/providerHealth.ts`):
  ChatGPT or Gemini answering < 80% of ≥ 8 asks in the last hour → one bell + email per engine per 6 h. Refusals and
  unread answers still alert per audit.
- **Admin view**: `apify-usage-status { health: true }` (admin only) → `AiSearchHealthLine` on the AI Visibility Audit
  page: last-24h success by engine and what the heal did.
- **Lead workspace**: the incomplete line says "Re-running the missing answers automatically at HH:MM (try n of 3)" or the
  give-up reason, instead of only "Run it again later".
- Fallback via the OpenAI / Gemini APIs: **plan only**, `docs/ai-search-api-fallback-plan.md`.

## Not changed

- Apify plan, billing, keys. The plan does not need upgrading: queueing keeps us inside 32 runs. (Starter → Scale would
  raise the concurrency limit; not needed.)
- `MAX_RUN_AGE_MS` (12 min), the hedge time (4 min), lane tries, the 60-minute deadline.

## Before / after

- Before (19 Nov, settled asks by day): 78 audits, **18 incomplete (23%)**; ChatGPT answered 90%, Gemini 81%. 18 Nov: 46 of
  70 (Google AI Mode hang). 12–17 Nov: 0.
- After: see the deploy proof below.
