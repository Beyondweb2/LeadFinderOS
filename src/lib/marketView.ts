/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHAT THINGS COST. Five figures the operator is shown before spending money, plus the pence
   formatter that renders them.

   🔴 THIS FILE WAS 1,519 LINES AND THE MARKET VIEW IT SERVED IS GONE (2026-09-09).
   MarketPanel, MeasureMarket, useMarketView and the per-town market read were deleted on
   2026-09-09; the `market-view` edge function's `view` and `options` actions went with them.
   Eighty-six exports were left behind — pool states, tiers, fragmentation verdicts, off-trade
   marks, measure-slot arithmetic, uncleaned-name folds — and the SPA imported FIVE of them, all
   costs. Verified before cutting: the surviving `niche` fold referenced none of the seventeen
   symbols the edge function used to import from here.

   ⛔ THE FILE KEEPS ITS NAME AND ITS PATH ON PURPOSE, AND THE NAME IS NOW WRONG.
   `scripts/check-cross-repo-sync.mjs` reads three of these constants OUT OF THIS EXACT PATH by
   parsing the file — `AUDIT_EST_USD_PER_QUESTION`, `SEO_SCAN_USD` and `MARKET_COOLDOWN_MS` — and
   that script exists in BOTH this repo and findable-site, each reading across to the other.
   Moving or renaming this file breaks the price guard in two repos at once, which has already
   happened once (CLAUDE.md §6h). A misleading filename is cheaper than a silently dead guard on
   what a customer is charged. Rename it only with findable-site open and both scripts repointed.

   ⛔ EVERY FIGURE HERE IS MEASURED FROM BILLED ROWS, NEVER COPIED FROM A PRICE LIST. Four
   constants in this app have been wrong that way (CLAUDE.md §4), so each one below carries the
   product, the tier and the measurement it came from. Do not "correct" one upward to be safe —
   inventing a margin on top of a measurement is the same error in the other direction.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/* ── PER-QUESTION AUDIT COST ─────────────────────────────────────────────────────────────────
   ⛔ RE-MEASURED 2026-08-06 against 60 completed runs / 206 questions of real
   ai_audit_runs.actor_cost_usd: mean $0.01095, median $0.01038, range $0.0052–$0.0135.
   It was 0.0125, which over-stated every estimate in the app by about 20%.
   ⚠️ THE MEDIAN, NOT THE MEAN, and deliberately: 8 × 0.0104 = $0.083, the measured cost of a
   market audit. The mean would put it at 0.0110; on a 25-audit batch the difference is 8p, not
   worth the inconsistency. Both figures are recorded so the next person need not guess which was
   intended.
   ⚠️ GUARDED: must equal AI_SEARCH_USD_PER_QUESTION in _shared/enrichment/sources.ts, which
   RESERVES against it in the cap pre-check. A mismatch means the estimate on screen is not the
   spend being enforced. */
export const AUDIT_EST_USD_PER_QUESTION = 0.0104;

/* ── APIFY ON-PAGE SEO SCAN, per audited business that HAS a website ─────────────────────────
   ⛔ WAS 0.12, AND IT WAS THE ONLY CONSTANT IN THE APP DERIVED FROM A PRICE LIST RATHER THAN
   FROM SPEND ("$40 per 1,000 pages × MAX_PAGES=3"). Measured 2026-08-06 against 218 real
   enrichment_usage rows: $0.02 (×65), $0.04 (×41), $0.08 (×4), $0.20 (×1) — plus 57 rows at
   exactly $0.12, which is THIS CONSTANT echoed back by the fallback in process-ai-audit-queue
   when Apify reports no usage figure. A constant must never be validated against data it wrote.
   ⚠️ THE HONEST READING IS A RANGE, NOT A NUMBER: a typical scan costs $0.02–$0.04. Set to the
   top of the band rather than the $0.031 mean, because this figure also reserves headroom in the
   cap pre-check and under-reserving is the worse error. The tell that $0.12 is the constant and
   not a measurement: $0.06, $0.10 and $0.14 never occur once in 218 rows.
   ⚠️ GUARDED against SEO_SCAN_USD_PER_SCAN in _shared/enrichment/sources.ts. */
export const SEO_SCAN_USD = 0.04;

/* ── GOOGLE GEOCODE + TEXT SEARCH FOR ONE TOWN ───────────────────────────────────────────────
   Measured from api_usage_log: $0.005 geocode plus 3 pages at the Text Search rate.
   ⛔ RE-PRICED 2026-08-06 AGAINST THE SKU TABLE, and it was under-stated. The code logs $0.032,
   which is Text Search PRO — but the field mask requests `websiteUri`, an ENTERPRISE field, and
   Google bills a request ONCE at the highest tier any requested field touches. Enterprise is
   $35.00/1,000, so a page is $0.035 and a typical three-page search is $0.110, not $0.101.
   Range across recent searches $0.040–$0.145.
   Shown on Coverage's "Find leads" button so the press states its own price. */
export const MARKET_SEARCH_USD = 0.110;

/* ── THE AI COMPETITOR-NAME CLEANER, per run ─────────────────────────────────────────────────
   extract-competitors re-reads every answer of a run and rewrites the competitor names.
   MEASURED on the real Norwich run, not estimated: 8 queue rows, ~79,600 characters of answers,
   ~19,900 input tokens at $2.50/M plus ~2k output at $10.00/M = $0.070 per run.
   ⚠️ Was quoted in the Push-to-Instantly dialog (deleted 2026-09-16). The cleaner itself is
   automatic at finalisation and is never a button (docs/state-coverage-market.md §6e). */
export const CLEANER_USD_PER_RUN = 0.070;

/* ── THE MARKET-AUDIT COOLDOWN ───────────────────────────────────────────────────────────────
   ⛔ THE SERVER OWNS THIS. create-ai-audit refuses a second market audit for the same trade and
   town inside this window and returns `market_cooldown`. Client state resets on reload, and
   "pressed it repeatedly" almost always means reload-and-press, so a client-side guard is the one
   that does not hold. Matches findable-onboarding's SUBMIT_COOLDOWN_MS, and is longer than the
   ~5 minute typical run so it cannot fire against a run that has already finished.
   ⚠️ KEPT THOUGH THE PANEL THAT STATED IT IS GONE: the price guard in BOTH repos parses this
   declaration and compares it to create-ai-audit's own copy, which is still ENFORCED on every
   market audit. Deleting it here would disable that comparison, not retire the rule. */
export const MARKET_COOLDOWN_MS = 10 * 60 * 1000;

/* ── DISPLAY ─────────────────────────────────────────────────────────────────────────────────
   ⚠️ A DISPLAY RATE, NOT AN ACCOUNTING ONE. The bill is in dollars; this is a label. Dollars on
   a button aimed at a UK operator reads as noise. */
export const USD_TO_GBP_DISPLAY = 0.79;

/** Pence, rounded, for a button label. ⛔ Never hand-type a pence figure beside a spend control —
 *  derive it from the constant, or the label and the charge drift (CLAUDE.md §4). */
export const asPence = (usd: number): string => `${Math.round(usd * USD_TO_GBP_DISPLAY * 100)}p`;
