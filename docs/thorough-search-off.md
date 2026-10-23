# Thorough search is switched off (2026-10-23, Paul)

Standard is the only Find Leads / Coverage search mode, in every country. No Thorough button, no "up to" price on the Find leads buttons, nothing a person can pick.

**Why.** Thorough splits a town into up to 9 tiles (`THOROUGH_MAX_TILES`) and searches each. On the small Australian towns it was meant for (Dubbo, Sunbury, Wodonga, Queanbeyan: 1 to 4 results each) most tiles came back empty, and it costs about 4x a Standard search for the same few businesses.

**What stays.** Standard is untouched, including the widened Australian town box (`townSearchBox`), the nearby pass, the Not a match line, Coverage settings, cost logging and every other country. The tile code in `src/lib/townSearchArea.ts`, `searchDepthWords.ts`, `SearchDepthToggle.tsx` and the edge function's `thoroughTownSearch` are kept, not deleted.

**The one switch.** `THOROUGH_SEARCH_ENABLED` in `src/lib/townSearchArea.ts` (now `false`). Everything routes through `usableSearchDepth()`: a saved value, an old link (`?depth=thorough`) or the search body falls back to Standard, no error. `defaultSearchDepth` is Standard for Australia while it is off.

**To switch it back on.** Set `THOROUGH_SEARCH_ENABLED = true`, run the tests (`scripts/find-leads-coverage.test.ts` covers both states), deploy the SPA. No backend change: the edge function still accepts `depth: 'thorough'`. Remember to restore Thorough as Australia's default only if Paul wants it (it returns with the switch).
