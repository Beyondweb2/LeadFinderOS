/* ============================================================
   THE FOUR SOHAM FAULTS.

   Soham: 11,000 people, ZERO locksmiths in Places, and the panel ran two paid audits, printed
   "47 of 0", said "every one is already named by AI" of a pool with nothing in it, and told the
   operator to skip the market because a firm from the next town was called a national chain.

   ⛔ THREE OF THE FOUR ARE THE SAME FAULT: a zero or a missing value flowing into a branch written
   for a different state. That is why they are in one file — the shared lesson is worth more than
   the four separate cases.
   ============================================================ */
import {
  marketPlainRead, NATIONAL_MIN_OTHER_TOWNS,
  type MarketConcentration, type MarketShape,
} from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ── 1. THE GATE ───────────────────────────────────────────────────────────────────────────────
   The gate lives in MeasureMarket's run(), which needs React to exercise. What IS testable — and
   what actually broke — is the decision it makes, so the predicate is restated here exactly as the
   component now applies it, against every state the pool can be in. */
const gateBlocks = (skipGate: boolean, poolFresh: boolean, searched: number | null, poolCount: number | null) => {
  const businesses = poolFresh ? poolCount : searched;
  return !skipGate && businesses === 0;
};
console.log("── 1. THE SEARCH GATE, ON BOTH PATHS ──");
ok(gateBlocks(false, false, 0, null), "a SEARCH returning zero blocks (this always worked)");
/* ⛔ THE SOHAM BUG. Reported twice. The gate sat inside `if (!poolFresh)`, so the one state it
   exists for — a pool we already know is empty — was the one state that could not reach it. */
ok(gateBlocks(false, true, null, 0), "A FRESH POOL OF ZERO BLOCKS (was: skipped the gate entirely, ran two audits)");
ok(!gateBlocks(false, true, null, 12), "a fresh pool with businesses in it runs");
ok(!gateBlocks(false, false, 12, null), "a search finding businesses runs");
ok(!gateBlocks(true, true, null, 0), "the operator override still runs against an empty pool");
/* ⚠️ ABSENCE IS NOT A ZERO. An unknown pool count must pass, or an expired pool would block a
   market that has never been searched. `=== 0`, never `!businesses`. */
ok(!gateBlocks(false, true, null, null), "an UNKNOWN pool count does NOT block");

/* ── 2, 3. THE READ ────────────────────────────────────────────────────────────────────────── */
const conc = (over: Partial<MarketConcentration> = {}): MarketConcentration => ({
  audits: 2, completeRuns: 2, distinctBusinesses: 10, totalMentions: 40,
  topName: "Ely Locksmiths", topSharePct: 30, topThreeSharePct: 60, thin: false,
  distinctPerAudit: 5, likelyJunk: false, truncatedBlocks: 0, engineBlocks: 8,
  runIds: ["r1"], marketAudits: 2, marketAuditsComplete: 2, businessAuditsComplete: 0, ...over,
});
const shape: MarketShape = { kind: "local_leader", headline: "Local leader", reasoning: [] };
/* ⚠️ FOURTEEN POSITIONAL PARAMETERS, and counting them wrong is how this harness produced four
   false failures against correct code — twice. The order is: shape, conc, trade, town, leader,
   citationHosts, prospects, poolSearched, poolFound, poolEntries, chainEntries, completeRuns,
   pendingAudits, noWebsiteProspects. completeRuns MUST be > 0 or the "no audit has finished" branch
   wins and none of the cases below is ever reached — a green-looking harness testing nothing. */
const read = (prospects: number, poolFound: number, poolEntries: number) =>
  marketPlainRead(shape, conc(), "locksmiths", "Soham", { name: "Ely Locksmiths", mentions: 20 },
    [], prospects, true, poolFound, poolEntries, 0, 2, 0, 0).contact;

console.log("\n── 3. AN EMPTY POOL IS EMPTY, NOT CLOSED ──");
const empty = read(0, 0, 0);
console.log(`   "${empty.slice(0, 96)}..."`);
ok(!/already named by AI/i.test(empty), "ZERO FOUND no longer claims every business is already named");
ok(!/Nobody left to contact/i.test(empty), "  nor that there is nobody left — there was never anybody");
ok(/found no locksmiths inside the Soham boundary/i.test(empty), "  it says Places found none, and names the trade and town");
ok(/about the SEARCH, not about the market/i.test(empty), "  and says which of the two it is a fact about");
/* The real closed market must keep its own wording — the fix must not swallow the honest case. */
const closed = read(0, 12, 12);
ok(/already named by AI/i.test(closed), "a pool of 12 with 0 prospects DOES still say everyone is named");
ok(!/found no locksmiths/i.test(closed), "  and does not borrow the empty-pool wording");
ok(/worth contacting/i.test(read(5, 12, 12)), "the normal case is untouched");

console.log("\n── 4. THE NATIONAL THRESHOLD ──");
const isNational = (otherTowns: number) => otherTowns >= NATIONAL_MIN_OTHER_TOWNS;
ok(NATIONAL_MIN_OTHER_TOWNS === 3, `threshold is ${NATIONAL_MIN_OTHER_TOWNS}, from the measured distribution`);
/* ⛔ THE SOHAM VERDICT. Ely Locksmiths scored otherTowns=1 and was called a chain, which produced
   "Skip this one" on a market whose leader is a firm in the next town. */
ok(!isNational(1), "ONE other town is NOT national (Ely Locksmiths — was: 'Skip this one')");
ok(!isNational(2), "two is not either — a firm serving two neighbouring towns is still local");
ok(isNational(3), "three is (Azets, TaxAssist)");
ok(isNational(6) && isNational(8), "and the real chains stay flagged (LockRite 6, Timpson 8)");
ok(!isNational(0), "a name seen nowhere else is local");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
