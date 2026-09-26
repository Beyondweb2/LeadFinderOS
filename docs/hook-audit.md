# The hook audit: 3 questions × 2 engines = 6 results (2026-09-25)

Branch `feat/hook-audit-visibility-score`. Replaced the adaptive (early-stop) hook for new audits.

## Before (version 1, 2026-09-20 → 2026-09-25)
- `create-ai-audit` planned up to 3 questions and queued **only Q1**. `process-ai-audit-queue`
  queued the next only while **Gemini** kept naming the business, and stopped on the first Gemini miss.
- Measured over 145 finished v1 hooks (live DB, 2026-09-25): 120 stopped after 1 question, 14
  after 2, 11 ran all 3 (6 of them `max_questions_reached`). That averages **1.25 questions and
  $0.0132 measured actor spend per hook**.
- Auto Not Interested fired on Gemini 3/3 (ChatGPT ignored).

## Now (version 2)
- `results.hook = { version: 2, planned: [3 questions], engines: ['chatgpt','gemini'] }`. **All three
  rows are queued at creation.** One queue row asks both engines in one scrape, so the same three
  questions are measured on both, and the queue cannot express anything else.
- The run finalises like any ordinary audit. The v1 step code still exists, but only for a v1 run
  that was in flight at deploy. None were in flight when checked.
- **One score, one ruler:** `src/lib/hookScore.ts` `scoreHookRun(state, rows, ctx)`, with `cellNamed`
  and the report's NamedContext (business, trade, town). The report (`buildHookReportSummary` v2),
  the deep-crawl gate (`shouldDeepCrawl`), the send guard (`sixResultHookForbidsAbsenceCopy`), the
  6/6 rule (`autoMarkSixOfSixNotInterested`) and the Inbox card (`src/lib/hookVisibility.ts`) all call it.
- **Complete = every expected result is a valid answer.** A failed row, or an engine with no answer,
  is `failed`, never "not named". Incomplete means no percentage and no hook. A failure is not retried
  beyond the queue's existing row retries.
- **Hook pick:** strongest Google AI miss, else strongest ChatGPT miss, else none. The rank is
  `hookBreadthScore` (commercial and local wording), plus the core trade, plus up to 3 competitor names.
  The competitors are **that cell's own list**, never merged across questions or engines.
- **6/6 → Not Interested**, the manual button's patch under the v1 conditional write (protected
  statuses, starred leads skipped). It runs **after the run is released**, beside `readyRuns`, so
  extract-competitors' `self_named` verdicts exist and the rule reads what the card and the report
  read. The reason `Hook audit: named in 6/6 ChatGPT + Google AI results` is stored on
  `results.hook.auto_not_interested`. Nothing is deleted or sent. Any miss (5/6 … 0/6) keeps the lead.
- **Report:** a complete v2 hook renders the hook section with the pick as the gap. The headline is
  engine-specific ("Gemini didn't name you for this search."). The report keeps its own label, Gemini.
  An incomplete v2 hook falls back to the ordinary rendering.
- **Historical audits keep their denominators:** a v1 hook is scored on executed questions × engines
  (a Q1 stop reads 1/2), and an ordinary audit with no marker on its queued rows. v1 reports render
  exactly as before.

## Inbox card (`src/components/HookVisibilityCard.tsx`, `src/hooks/useHookVisibility.ts`)
- Under the report bar in the open conversation. Read-only: one lead's audits plus one run's queue
  rows, polling every 10 s only while that run is in flight. The newest ordinary audit wins, even
  while running.
- Shows: `67% named (4/6)`, the ChatGPT / Google AI split, the best outreach search with that
  engine's competitors, the other missed searches by engine ("Named in all three … searches" when
  none), and a collapsed list of all six results with answer excerpts. In flight it shows
  "Checking AI results k/6" and per-engine "n/3 checked". Incomplete reads "Incomplete … no final score".
- Visual QA was done in a throwaway harness at 1440/390/375 (no overflow, long text wraps). The
  harness was deleted. Real authed Inbox rendering has not been seen by anyone.

## Cost
- New hook: 3 questions × `AI_SEARCH_USD_PER_QUESTION` (one scrape covers both engines). v1's measured
  3-question runs cost $0.0305–$0.0343. Expect **about $0.031 per hook vs $0.013 before (≈2.4×)**,
  and 2.4× the Apify question volume on the shared monthly cap.
- The estimate `create-ai-audit` returns is now true. Before, it priced 3 questions while queueing 1.

## Not changed, and known gaps
- Question generation is unchanged: the same generator, 3 questions, ordered by `planHookQuestions`.
- Deploy order: every function except `create-ai-audit` first (so the send guard, report and 6/6 rule
  understand v2), `create-ai-audit` last.

## Final corrections (2026-09-26, before merge)
- **WhatsApp rivals = the hook result's own competitors.** `resolveAuditReplyVars` uses
  `data.hook.gap.namedInstead` (the pick's cell: same question, same engine, report suppression/junk
  gates) whenever the audit has a hook gap, and never `topCompetitors`. An incomplete v2 hook is refused
  (`hook_incomplete`), never backfilled. Audits with no hook are unchanged. The vars carry
  `hookQuestion` and `hookEngine`.
- **Single-engine bodies:** `audit_followup`'s Meta body says "I asked chatgpt". `TEMPLATE_SINGLE_ENGINE_CLAIM`
  (`rivalHook.ts`) makes the resolver refuse it (`hook_engine_mismatch`) for a Google AI hook. Senders
  pass `{ templateName }`. A test scans every registered body for "asked <one engine>".
- **Google AI everywhere on hook surfaces:** `HOOK_ENGINE_LABELS` / `hookEngineLabel` feed the hook report
  (headline, evidence box, "Measured on" footer when `d.hook`), the cold-call playbook script, the
  Inbox card and the Inbox list pill. Ordinary (non-hook) reports still say Gemini.
  ⚠️ competitor_hook's **Meta-registered** body says "ChatGPT and Gemini" and explain_offer_v2's says
  "chatgpt and gemini". Code cannot change those. Re-registering them at Meta is Paul's call.
- **Exactly three questions:** `topUpHookQuestions` adds generic "best / reliable / recommended local
  <trade> in <place>" questions (the trade via `articleTrade`, the place UK-disambiguated). A v2 plan
  still short of three is `questionShortfall` → never complete: no X/6, no hook, no 6/6, the resolver refuses.
- Found in passing, not fixed: `generateQuestions`' `locQ` regex in create-ai-audit contains literal
  backspace characters where `` was meant, so it never detects "UK" already in the town.
