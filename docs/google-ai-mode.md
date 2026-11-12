# Google AI = AI Mode (context only), from 2026-11-12

**Rule.** New audits ask Google **AI Mode** (`aiModeSearch: { enableAiMode: true }` in `buildAiSearchInput`) instead of the AI Overview add-on. The answer is stored in the same `ai_overview` slot (block key `aiModeResult`), so every reader, the "Google AI" box and the competitor extractor keep working. It is **display only and never scored**: ChatGPT and Gemini are the scored engines.

**Why.** Measured 2026-11-12 on 9 LDM and ABLM questions: AI Mode named real local firms on every local search (about 5 each); the Overview showed nothing on 5 of the same 9 and named no firm on several stored ones. On non-local advice searches (gas safety certificate, MTD) it names few firms, which is correct.

**Which audits.** Decided by `GOOGLE_AI_MODE_SINCE` (src/lib/aiOverview.ts) on the audit's method date: its own created_at, except a client's re-measure, which follows its BASELINE (queue `getAudit`, same as the Google AI retry). So a baseline made with the Overview is re-measured with the Overview and scored the same way. Unknown date = the old ask. `scoringMethodFor` is 2 only between `GOOGLE_AI_SCORED_SINCE` and `GOOGLE_AI_MODE_SINCE`; before and after it is 1 (Google AI not in the score).

**Never.** Re-run or rewrite a stored answer, a locked baseline or a report. Do not score AI Mode. Do not drop the filters on its firm names.

**Cost.** Measured 2026-11-12 with everything on: $0.0176 to $0.0196 per question (was about $0.0104). Ledger rate `AI_SEARCH_USD_PER_QUESTION` 0.0184; operator quotes `AUDIT_EST_USD_PER_QUESTION`, `RE_AUDIT_EST_USD_PER_QUESTION`, `DISCOVERY_USD_PER_QUESTION_RUN` 0.022 (observed billed cost plus AI Mode). Apify bills the real figure and `recordCostCorrection` settles the difference. A 20-question baseline asked 3 times costs about 50p more.

**Tests.** scripts/google-ai-mode.test.ts. V2 copy: docs/report-room-rule-v2-copy-note.md.
