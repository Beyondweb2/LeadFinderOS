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

### Measured live (2026-10-11, QA fixture ZZ QA AIO Roofing, audit `d0f89033`, plus two real audits the same hour)
- Overview text came back in FULL: 1,776–3,538 characters (was ~200 for the snippet). The no-overview search
  ("emergency electrician who can come out today in Leeds UK") was stamped `not_shown` and the run completed normally.
- Apify's own charge per question (`_cost_usd`): **$0.01255 without the add-on, $0.01455 with an overview shown**
  (+$0.0020 = the published $2 / 1,000). A few questions read $0.00005 at fetch time — Apify's charge had not settled
  (the known correction lag), not a price. Average with ~70% of searches showing an overview ≈ $0.0140 a question,
  which is what the app's estimate constants already use (0.014) — left unchanged.
- Per audit (Apify, at $0.01255 + $0.002 × share shown): hook (3 q) ≈ $0.042 (was $0.038); weekly check (20 q) ≈
  $0.28; baseline (20 × 3) ≈ $0.84; Discovery default (40 × 3) ≈ $1.68. Only the hook was run live. Competitor
  cleaning (OpenAI gpt-4o) is separate: $0.019 for this hook.
- Latency: ~163 s a question (async start / poll, so no edge timeout).
- **Extraction:** names came out of 3 of 4 full overviews checked; one long listing-style overview (commercial
  electricians) returned none even after `overviewReadableText` (extract-competitors reads the overview with its
  spaces restored since this day). The actor also drops some business names that were link text on Google's page.
  The report then says "Overview shown, no businesses named" — it is the extractor's verdict, not a guess.

## Report restyle + "Gemini" on screens (2026-10-11)
- Screens say **Gemini** (`HOOK_ENGINE_LABELS`); spoken scripts keep **Google AI** (`HOOK_SPOKEN_ENGINE_LABELS`:
  call script, cold-call playbook, voice-note script). WhatsApp text and refusal reasons in edge shared modules that
  also reach `whatsapp-status` (`rivalHook.ts`, `audit-reply.ts`) were left as they were.
- The six-answer report (`renderQuickCheckReport`, `renderQuickCheckFooter`): near-black #101114 top and bottom, cream
  #f7f5f1 page, white cards, "Named instead of you" as yellow #fcc933 pills, two-line answer snippets, the overview as
  a slim "Shown for context, not scored" row with three states, table cells with the top business pill (green / amber /
  violet / orange / grey / rose — one colour per business, never blue) and "+n more", yellow "Why this matters" tiles,
  the closing band as cards. Same links, call form, guarantee sentence, `preview=1` behaviour.
- The overview text on screens is `overviewSummaryText` / `overviewFullText` (aiOverview.ts): spaces restored, a
  trailing heading / Maps card / Google's copy controls dropped, never a word written.
- The rival count and the table names are one per BUSINESS (`hookAudit.ts` `sameBusiness` / `distinctNames`): two
  spellings of one firm ("Martin Day Electrician" / "Martin Day Commercial Electricians") count once.

## AI Overview everywhere, and older audits show what they captured (2026-10-19)
- **Root cause of "the report does not give the AI Overview answer":** every screen read the overview only through the
  `_ai_overview` stamp, written since 2026-10-11. The overview ANSWER has been stored in the `ai_overview` cell since July
  (measured 2026-10-19: 3,712 stored overview answers across ~1,300 audits, none stamped), so every older audit showed
  nothing. And the client full report never quoted the overview text at all (its per-engine cards are internal-only).
- `aiOverview.ts` `overviewReadingOf` is now the one reading: the stamp where present → else a stored answer = shown →
  else `_google_serp` present (results page came back, since 2026-09-15) = not shown (the same test `aiOverviewStamp`
  uses) → else unknown = "not recorded". Never a guess.
- One chip, one set of words (`overviewTally` / `overviewChipText` / `overviewChipTone` / `overviewChipTitle`): "Google AI
  Overview 1/2" (named of the searches that showed one), "No AI Overview shown" (neutral), "Google AI Overview not
  recorded". React: `src/components/AiOverviewChip.tsx`; panels that quote one engine use `LeadAiResultChips.tsx` (reads
  the cached `useHookVisibility` query, no new request).
- Where it shows: Inbox strip + details, call tab / prospect page (same card), full audit window (chip + "For this call"
  evidence line), Outreach rows (`RowScore.overview`, `scoreLine` stays the two scores), voice-note script panel, both
  drafters' "Why this reply?", quick report (chip under the engine cards, per-question replies), full / paid report
  (chip, an always-on AI Overview column, "Google AI Overview said" folded under each row — prints open).
- ⛔ Still display only: `buildReportData.overview` is never in pct / named / total; hook score unchanged; no prompt and
  no message text changed. Test: `scripts/ai-overview-three-engines.test.ts` section H.
