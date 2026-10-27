# Google AI (AI Overview) coverage — investigation 2026-10-27

**Measured (queue rows, last 30 days, status done, 1,144 questions):** 262 (22.9%) have no Google AI answer.
UK 23.1%, Australia 17.9%, Malaysia 18.8%. By purpose: audit 24.7%, baseline 36.7%, discovery 11.8%. By trade: roofers 19-50%,
electricians 32%, locksmiths 29%, driving instructors 22%, plumbers 22-43%. "best/who is the best" questions 27%.
By week 15-30% (no trend). Of the 262: 166 stamped `not_shown` (results page came back, no overview block), 91 older rows with
no stamp but a results page, 5 with no results page at all.

**Fetch:** one `apify~google-search-scraper` run per question, `aiOverview.scrapeFullAiOverview: true`, `countryCode`, async start/poll,
`MAX_ATTEMPTS` 3 only for FAILED/ABORTED/TIMED-OUT runs. A run that SUCCEEDS without an overview block is final (`not_shown`); it is never retried.
The raw actor item is not stored, so "Google showed none" vs "the scraper missed it" cannot be told apart from stored data.

**Evidence it is partly the fetch:** the same question asked twice in one audit gave a different answer on Google AI in 36 of 99 repeats.

**Accuracy (checked):** the score counts Google AI only where it answered (`scored.googleAi.shown`); the hook only ever picks ChatGPT or Gemini
(`HOOK_PICK_ENGINE_ORDER`), so it cannot say "I asked googleAI" about a missing overview (but see report: the hook's "googleAI" word means Gemini).
Fixed 2026-10-27: the call-card line said "(not scored)" on every audit and the prospect audit tile said "In the score" even when every search showed none —
both now go through `overviewScoreNote` (`aiOverview.ts`).
