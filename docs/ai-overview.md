# Google AI Overview on every new audit (2026-10-11)

**Rule:** new AI audits (hook, Discovery, baseline — every purpose) show three answers per search: ChatGPT, Google AI
(Gemini) and Google's AI Overview. The overview is **display only** — never in SCORED_ENGINES / HOOK_ENGINES, any count,
the percentage, the hook pick, the 6/6, the guarantee or the call script. Hook surfaces keep calling Gemini "Google AI"
(Paul, 2026-10-11); the overview is "Google AI Overview".

## What was true before (measured live 2026-10-11)
- The notes said AI Overview was "no longer collected". Wrong: the actor's full-scrape toggle is off, but the overview
  Google shows on the results page comes back in the base output anyway. Last 30 days: present on 61% (hooks) to 81%
  (Discovery) of questions, full answers (median ~1,900 chars).
- When Google showed none, the cell was just absent — indistinguishable from "never looked" — and the hook surfaces
  (Inbox card, audit window, quick report) never showed it.

## What changed
- `_shared/enrichment/ai-search.ts` `aiOverviewStamp`: the queue stamps every new question `_ai_overview` =
  `shown` / `not_shown` (only when the results page came back; otherwise nothing — never a guess). Leading-underscore
  meta key, like `_google_serp`. **Actor input unchanged** → cost per audit unchanged.
- `src/lib/aiOverview.ts` is the ONE reader (state, words, summary line). No stamp = an old audit → drawn exactly as before.
- `scoreHookRun` returns `overviews` (display only); Inbox card (one line + per-question pill), the audit window (third
  tile), the quick public report (featured question card + table column + method line), the full report
  ("No overview shown" instead of "Didn't appear") and the client question list (an "AI Overview" column, footnoted
  not counted) all read it.
- Test: `scripts/ai-overview-three-engines.test.ts`.

## Cost
First version (morning of 2026-10-11): no change — the Apify input was byte-identical and the overview snippet was
already in every billed run. One small knock-on that already existed: extract-competitors reads AI Overview answers too.

## The full overview add-on (2026-10-11, later the same day — Paul approved)
- Without it the actor returns only the snippet Google shows before "Show more" (S P Electrical, `fga54n`: the first
  line and a heading, so no business was ever in it). `buildAiSearchInput` now sends
  `aiOverview: { scrapeFullAiOverview: true }` EXPLICITLY. Never rely on the actor default: an API run takes the
  actor's schema default for any key it does not send, and the toggle on the Apify console page changes neither (it is
  the console's own input form, not the API).
- Only `process-ai-audit-queue` starts this actor, so it is the one redeploy; it serves hook, Discovery, baseline and
  the weekly check. `directory-presence` runs the same actor with plain organic input (no AI keys) and is unaffected.
  Nothing in findable-site or findable-directory calls it.
- Price (Apify public): $2.00 per 1,000 captured overviews on Starter ($1.50 on Scale) — about +$0.002 a question when
  one is shown. The measured cost of a live run is recorded below.
