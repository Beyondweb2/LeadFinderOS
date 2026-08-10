/* ============================================================
   THE AUTO-CLEANER, AND WHY IT NEVER FIRED.

   ⛔ THE GUARD WAS CORRECT AND UNREACHABLE — the third time in this codebase (after the market
   cooldown and the search gate). shouldAutoClean() has always been right. autoCleanIfDirty fed it
   the market as it was BEFORE the measurement, because it read `view` out of a React closure
   immediately after awaiting the reload that changes it. A closure cannot see a state update that
   has not re-rendered.

   On the FIRST measurement of a market that pre-state has runIds: [], and shouldAutoClean requires
   runs > 0 — so it returned false every single time, for every market, since the day it shipped.
   Wisbech driving instructors: 125.5 distinct names per audit against a threshold of 15, and the
   operator was still handed the manual button.

   ⚠️ NO TYPE CHECK CATCHES THIS. Both readings are a MarketViewResult; only the timing differs.
   That is why the fix is structural — reload() now RETURNS the fresh view and it is passed in as
   an argument, so the stale one is not reachable from inside the callback at all.

   ⛔ AND THE DIRTINESS TEST HAS SINCE CHANGED, from a ratio to a fact — see
   scripts/uncleaned-names.test.ts for the measurement that killed the ratio. What survives unchanged
   is the `runs > 0` half and the whole lesson above: WHICH VIEW the decision is made from.
   ============================================================ */
import {
  shouldAutoClean, marketNamesUncleaned, CLEANER_USD_PER_RUN, asPence,
} from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

type Conc = { uncleanedCount?: number; runIds: string[] };
/** autoCleanIfDirty's decision, restated exactly as the component now makes it. */
const decides = (c: Conc | null) => !!c && shouldAutoClean(marketNamesUncleaned(c), c.runIds.length);

// The two views that exist at the moment the callback runs.
const BEFORE: Conc = { uncleanedCount: 0, runIds: [] };                 // first measurement
const AFTER: Conc = { uncleanedCount: 33, runIds: ["r1", "r2"] };       // eastbourne, as measured

console.log("── ⛔ THE BUG: WHICH VIEW THE DECISION IS MADE FROM ──");
ok(!decides(BEFORE), "the PRE-measurement view says do not clean (0 runs) — this is what it used to read");
ok(decides(AFTER), "the POST-measurement view says CLEAN — 33 markers in the extracted names");
ok(decides(BEFORE) !== decides(AFTER),
  "THE TWO DISAGREE, so which one is read is the whole bug — and no type distinguishes them");

console.log("\n── THE RUN GUARD (unchanged, and still right) ──");
ok(!shouldAutoClean(true, 0), "runs = 0 never cleans, however dirty — there is nothing to re-read");
ok(!shouldAutoClean(false, 2), "a clean market with runs does not clean");
ok(shouldAutoClean(true, 2), "a dirty market with runs does");

console.log("\n── ✅ THE KNOWN RE-CLEAN LOOP IS GONE, AND THAT IS THE RATIO'S FAULT REMOVED ──");
/* THIS USED TO BE A RECORDED DEFECT. The Wisbech cleaner took that market from 125.5 to 16.5 distinct
   names per audit — every prose fragment gone, 36 real driving schools left — and 16.5 was STILL
   above the threshold of 15, so the next measurement paid to clean it again for nothing. 28 of 42
   measured markets sat above that line.
   With the fact test there is nothing left to fire on: a cleaned fold contains no marker words, so it
   cannot re-clean however many firms it names. A fragmented market is no longer mistaken for a dirty
   one, which is the same error in the opposite direction. */
const CLEANED: Conc = { uncleanedCount: 0, runIds: ["r1", "r2"] };
ok(!decides(CLEANED), `an already-cleaned market does NOT re-clean — no ${asPence(2 * CLEANER_USD_PER_RUN)} for nothing`);

console.log("\n── THE ABSENT CASE ──");
ok(!decides(null), "a view that failed to load never cleans — absence is not dirt");
ok(!decides({ runIds: ["r1"] }), "a view from an older market-view deploy carries no count, and never cleans on a guess");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
