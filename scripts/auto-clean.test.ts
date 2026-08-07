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
   ============================================================ */
import { shouldAutoClean, JUNK_RATIO_PER_AUDIT, CLEANER_USD_PER_RUN, asPence } from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

type Conc = { distinctPerAudit: number; runIds: string[] };
/** autoCleanIfDirty's decision, restated exactly as the component now makes it. */
const decides = (c: Conc | null) => !!c && shouldAutoClean(c.distinctPerAudit ?? 0, c.runIds.length);

// The two views that exist at the moment the callback runs.
const BEFORE: Conc = { distinctPerAudit: 0, runIds: [] };                    // first measurement
const AFTER: Conc = { distinctPerAudit: 125.5, runIds: ["r1", "r2"] };       // Wisbech, as measured

console.log("── ⛔ THE BUG: WHICH VIEW THE DECISION IS MADE FROM ──");
ok(!decides(BEFORE), "the PRE-measurement view says do not clean (0 runs) — this is what it used to read");
ok(decides(AFTER), "the POST-measurement view says CLEAN — 125.5 per audit over a threshold of 15");
ok(decides(BEFORE) !== decides(AFTER),
  "THE TWO DISAGREE, so which one is read is the whole bug — and no type distinguishes them");

console.log("\n── THE THRESHOLD ITSELF (unchanged, and correct) ──");
ok(!shouldAutoClean(125.5, 0), "runs = 0 never cleans, however dirty — there is nothing to re-read");
ok(!shouldAutoClean(0, 2), "a clean market with runs does not clean");
ok(!shouldAutoClean(JUNK_RATIO_PER_AUDIT, 2), `exactly ${JUNK_RATIO_PER_AUDIT} does not clean (strictly above)`);
ok(shouldAutoClean(JUNK_RATIO_PER_AUDIT + 0.5, 2), "just above does");
ok(shouldAutoClean(125.5, 2), "Wisbech driving instructors cleans");

console.log("\n── A SECOND MEASUREMENT MUST NOT RE-CLEAN WHAT IS ALREADY CLEAN ──");
/* ⚠️ THE LIVE CONSEQUENCE OF FIXING THIS, and it is Paul's call not mine. The Wisbech cleaner took
   the market from 125.5 to 16.5 distinct names per audit — every prose fragment gone, 36 real
   driving schools left — and 16.5 IS STILL ABOVE THE THRESHOLD OF 15. So with the auto-clean
   working, the next measurement of that market pays to clean it again for nothing.
   Asserted as CURRENT BEHAVIOUR rather than silently changed: the threshold is a judgement about
   money, and 28 of 42 measured markets sit above it. */
const CLEANED: Conc = { distinctPerAudit: 16.5, runIds: ["r1", "r2"] };
ok(decides(CLEANED),
  `KNOWN: an already-cleaned market (16.5) still re-cleans at ${asPence(2 * CLEANER_USD_PER_RUN)} — threshold is ${JUNK_RATIO_PER_AUDIT}`);

console.log("\n── THE ABSENT CASE ──");
ok(!decides(null), "a view that failed to load never cleans — absence is not dirt");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
