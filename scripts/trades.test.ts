/* ============================================================
   THE FIXED TRADE LIST.

   ⛔ business_type is stored as typed, so the same trade appears under several spellings. Measured
   2026-08-08 across ai_audits: 52 "plumber" / 10 "plumbers", 19 "accountant" / 9 "accountants",
   15 "driving instructors" / 2 "driving instructor", 12 "electrician" / 4 "electricians". Any
   per-trade view keyed on the raw string shows Kettering twice for the same trade.

   ⚠️ Every alias below is a string that REALLY EXISTS in the database, not one I invented — an
   alias list fitted to imagined inputs is how a real stored value ends up unmapped.
   ============================================================ */
import {
  TRADES, canonicalTrade, tradeKey,
  TOWN_BAND_DEFAULT_MIN, TOWN_BAND_DEFAULT_MAX, TOWN_SEED_MIN, TOWN_SEED_MAX,
} from "../src/lib/trades.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── ⛔ EVERY SPELLING IN THE DATABASE MAPS ──");
/* The exact strings and counts from ai_audits.business_type. */
const REAL: Array<[string, string]> = [
  ["plumber", "plumber"], ["plumbers", "plumber"],
  ["locksmiths", "locksmith"],
  ["accountant", "accountant"], ["accountants", "accountant"],
  ["driving instructors", "driving-instructor"], ["driving instructor", "driving-instructor"],
  ["electrician", "electrician"], ["electricians", "electrician"],
  ["mobile mechanics", "mobile-mechanic"], ["Mobile mechanics", "mobile-mechanic"],
  ["mobile valeting and detailing", "mobile-valeting"],
];
for (const [stored, slug] of REAL) {
  const t = canonicalTrade(stored);
  ok(t?.slug === slug, `${JSON.stringify(stored).padEnd(34)} -> ${t?.slug ?? "UNMAPPED"}`);
}

console.log("\n── THE SINGULAR/PLURAL SPLIT COLLAPSES ──");
ok(tradeKey("plumber") === tradeKey("plumbers"), "plumber and plumbers are ONE trade");
ok(tradeKey("accountant") === tradeKey("accountants"), "accountant and accountants are one");
ok(tradeKey("electrician") === tradeKey("electricians"), "electrician and electricians are one");
ok(tradeKey("driving instructor") === tradeKey("driving instructors"), "driving instructor(s) are one");
ok(tradeKey("  PLUMBERS  ") === "plumber", "case and whitespace do not matter");

console.log("\n── ⛔ AND TRADES THAT SHOULD STAY APART, STAY APART ──");
const slugs = new Set(TRADES.map((t) => t.slug));
ok(slugs.size === TRADES.length, "no duplicate slugs");
ok(tradeKey("plumber") !== tradeKey("electrician"), "plumbers are not electricians");
ok(tradeKey("locksmiths") !== tradeKey("mobile mechanics"), "locksmiths are not mobile mechanics");
/* No alias may serve two trades — that is the fuzzy-merge failure the fixed list exists to prevent. */
const seen = new Map<string, string>();
let clash = "";
for (const t of TRADES) for (const a of t.aliases) {
  if (seen.has(a) && seen.get(a) !== t.slug) clash = `${a} -> ${seen.get(a)} and ${t.slug}`;
  seen.set(a, t.slug);
}
ok(!clash, `no alias maps to two trades${clash ? ": " + clash : ""}`);

console.log("\n── ⛔ UNKNOWN MEANS UNKNOWN, NEVER THE NEAREST NEIGHBOUR ──");
/* "kava cafe, pool bar" is a real audit — Paul's own bar. Folding it into a trade he sells to would
   be the absence-as-answer fault again: guessing where the honest reply is "I do not know". */
ok(canonicalTrade("kava cafe, pool bar") === null, "an unrecognised trade returns null, not a guess");
ok(canonicalTrade("") === null, "empty returns null");
ok(canonicalTrade(null) === null, "null returns null");
ok(canonicalTrade("plumbing supplies wholesaler") === null, "a near-miss is NOT force-fitted to plumbers");
ok(tradeKey("kava cafe, pool bar") === "kava cafe pool bar", "  but it still gets a stable key so it can be listed separately");

console.log("\n── THE SIZE BAND ──");
/* Norwich is 200,770 and has been worked. A 200k ceiling would have hidden it. */
const NORWICH = 200_770;
ok(NORWICH <= TOWN_BAND_DEFAULT_MAX, `Norwich (${NORWICH.toLocaleString()}) is inside the ${TOWN_BAND_DEFAULT_MAX.toLocaleString()} default`);
ok(TOWN_BAND_DEFAULT_MIN >= TOWN_SEED_MIN && TOWN_BAND_DEFAULT_MAX <= TOWN_SEED_MAX,
  "the default band sits INSIDE the seeded range, so the filter can always widen without a re-seed");
ok(TOWN_SEED_MIN === 12_000 && TOWN_SEED_MAX === 250_000, "the table holds 12k–250k, as seeded");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
