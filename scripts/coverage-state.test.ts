/* ============================================================
   WHICH TOWNS HAVE I WORKED, FOR THIS TRADE?

   ⛔ THE TWO THINGS THAT MUST HOLD, because the whole page is a decision aid for where to spend:
     * state is DERIVED, so it cannot go stale — no ticking, no status column
     * state is per trade AND town, because Wisbech is finished for locksmiths and untouched for
       driving instructors, and a per-town status would have to be wrong about one of them
   ============================================================ */
import {
  coverageStateFor, coverageKey, coverageTownKey, summarise, applyFilters, countMeasuredByPair,
  COVERAGE_STATES, applySuppressionPatch, type CoverageRow, type CoverageFacts, type CoverageTown,
  type SuppressibleTown,
} from "../src/lib/coverageState.ts";
import { TOWN_BAND_DEFAULT_MIN, TOWN_BAND_DEFAULT_MAX, TOWN_SEED_MIN, TOWN_SEED_MAX } from "../src/lib/trades.ts";
import { MARKET_AUDIT_MIN_AUDITS } from "../src/lib/marketAuditThreshold.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const town = (name: string, region: string | null = "East of England", population: number | null = 30000): CoverageTown =>
  ({ id: name, name, region, population });
const facts = (o: Partial<CoverageFacts> = {}): CoverageFacts => ({
  measuredCounts: o.measuredCounts ?? new Map(),
  leadPairs: o.leadPairs ?? new Set(),
  workedPairs: o.workedPairs ?? new Set(),
});
/** A pair measured to the full bar (>= MARKET_AUDIT_MIN_AUDITS completed audits). */
const measuredAt = (key: string): Map<string, number> => new Map([[key, MARKET_AUDIT_MIN_AUDITS]]);

console.log("── THE LADDER, RUNG BY RUNG ──");
{
  const wisbech = town("Wisbech");
  ok(coverageStateFor("locksmiths", wisbech, facts()) === "untouched", "nothing known -> untouched");
  ok(coverageStateFor("locksmiths", wisbech, facts({ leadPairs: new Set([coverageKey("locksmiths", "Wisbech")]) })) === "leads",
    "leads in the CRM -> leads found");
  ok(coverageStateFor("locksmiths", wisbech, facts({ measuredCounts: measuredAt(coverageKey("locksmiths", "Wisbech")) })) === "measured",
    "two completed market audits -> measured");
  ok(coverageStateFor("locksmiths", wisbech, facts({ workedPairs: new Set([coverageKey("locksmiths", "Wisbech")]) })) === "worked",
    "somebody contacted -> worked");
}

console.log("\n── ⛔ MEASURED NEEDS THE PANEL'S BAR (BUG-2, 2026-08-19) ──");
/* Coverage's row used to say "Measured" at ONE completed audit while the panel needs two, so View
   on a 1-audit town looked like it re-ran the audit. The row and the panel now share one constant. */
{
  const wisbech = town("Wisbech");
  const k = coverageKey("locksmiths", "Wisbech");
  /* One completed audit is NOT measured — it falls to whatever lower rung applies. */
  ok(coverageStateFor("locksmiths", wisbech, facts({ measuredCounts: new Map([[k, 1]]) })) === "untouched",
    "one completed market audit is NOT measured (half a measurement)");
  ok(coverageStateFor("locksmiths", wisbech,
      facts({ measuredCounts: new Map([[k, 1]]), leadPairs: new Set([k]) })) === "leads",
    "  and a 1-audit town with leads shows as leads, never Measured");
  /* The full bar is measured. */
  ok(coverageStateFor("locksmiths", wisbech, facts({ measuredCounts: new Map([[k, MARKET_AUDIT_MIN_AUDITS]]) })) === "measured",
    `${MARKET_AUDIT_MIN_AUDITS} completed audits -> measured`);
  ok(coverageStateFor("locksmiths", wisbech, facts({ measuredCounts: new Map([[k, MARKET_AUDIT_MIN_AUDITS + 5]]) })) === "measured",
    "  and re-measuring (more audits) stays measured");
}

console.log("\n── ⛔ THE COUNT FOLDS CASE-DRIFT ON THIS SIDE (real Eastbourne case) ──");
/* The endpoint sends one entry per completed audit, raw. Two sibling audits typed 'Locksmiths' and
   'locksmiths' are ONE 2-audit market, and counting through coverageKey is what folds them — a raw
   server count would split them into two 1-audit halves and call the market unmeasured. */
{
  const counts = countMeasuredByPair([
    { trade: "Locksmiths", town: "Eastbourne" },
    { trade: "locksmiths", town: "Eastbourne" },
  ]);
  ok(counts.get(coverageKey("locksmiths", "Eastbourne")) === 2, "Locksmiths + locksmiths fold to one 2-audit market");
  ok(coverageStateFor("locksmiths", town("Eastbourne"), facts({ measuredCounts: counts })) === "measured",
    "  so the drifted market reads Measured, not two unmeasured halves");
  /* One audit of each of two different towns must NOT combine into a measurement. */
  const split = countMeasuredByPair([
    { trade: "locksmiths", town: "Eastbourne" },
    { trade: "locksmiths", town: "Hastings" },
  ]);
  ok(split.get(coverageKey("locksmiths", "Eastbourne")) === 1 && split.get(coverageKey("locksmiths", "Hastings")) === 1,
    "one audit each of two towns stays 1 and 1, never merged");
}

console.log("\n── ⛔ PER TRADE AND TOWN, NOT PER TOWN ──");
/* The case that makes the pair the key. A per-town status would call Wisbech "done" and hide an
   entire untouched trade in a town Paul has already worked. */
{
  const wisbech = town("Wisbech");
  const only = facts({ workedPairs: new Set([coverageKey("locksmiths", "Wisbech")]) });
  ok(coverageStateFor("locksmiths", wisbech, only) === "worked", "Wisbech is worked for locksmiths");
  ok(coverageStateFor("driving instructors", wisbech, only) === "untouched",
    "  and untouched for driving instructors, in the same breath");
}

console.log("\n── ⛔ THE FURTHEST RUNG WINS, AND THE COUNTS STILL SUM ──");
/* worked implies leads and usually measured. Showing a town at every rung it has reached would make
   "6 of 87" meaningless because the columns would double-count. */
{
  const k = coverageKey("locksmiths", "Wisbech");
  const all = facts({ workedPairs: new Set([k]), measuredCounts: measuredAt(k), leadPairs: new Set([k]) });
  ok(coverageStateFor("locksmiths", town("Wisbech"), all) === "worked", "a town at every rung shows as worked");
  const rows: CoverageRow[] = [
    { ...town("Wisbech"), state: "worked" },
    { ...town("Norwich"), state: "measured" },
    { ...town("Ely"), state: "leads" },
    { ...town("Diss"), state: "untouched" },
    { ...town("Thetford"), state: "untouched" },
  ];
  const s = summarise(rows);
  ok(s.total === 5, "total is every town in the filtered list");
  ok(Object.values(s.counts).reduce((a, b) => a + b, 0) === s.total, "the state counts sum to the total — no double counting");
  ok(s.started === 3, `"3 of 5 done" reads off started (${s.started})`);
}

console.log("\n── ⛔ THE TRADE IS CANONICALISED ON BOTH SIDES ──");
/* business_type is stored as typed: 52 "plumber" and 10 "plumbers" are one trade. A raw-string key
   would show Kettering twice and call each half untouched. */
ok(coverageKey("accountant", "Chichester") === coverageKey("accountants", "Chichester"),
  "accountant and accountants are one key");
ok(coverageKey("plumber", "Kettering") === coverageKey("plumbers", "Kettering"), "plumber/plumbers too");
ok(coverageKey("plumbers", "Kettering") !== coverageKey("locksmiths", "Kettering"),
  "  but two real trades never share a key");
/* An unrecognised trade shows as itself rather than being dropped or folded into a neighbour. */
ok(coverageKey("kava cafe", "Wisbech") !== coverageKey("plumbers", "Wisbech"),
  "an unmapped trade keeps its own key rather than joining another trade's coverage");

console.log("\n── AND THE TOWN NAME IS NORMALISED THE SAME WAY EVERYWHERE ──");
ok(coverageTownKey("Cambridge (Cambridge)") === coverageTownKey("Cambridge"),
  "the ONS parenthetical matches what an audit stores");
ok(coverageTownKey("Bourne UK") === coverageTownKey("Bourne"), "a trailing country is dropped");
ok(coverageTownKey("Bury Saint Edmunds") === coverageTownKey("Bury St Edmunds"), "Saint and St are one town");
ok(coverageTownKey("  wisbech  ") === coverageTownKey("Wisbech"), "case and whitespace do not matter");

console.log("\n── THE SIZE BAND ──");
{
  const rows: CoverageRow[] = [
    { ...town("Norwich", "East of England", 200770), state: "measured" },
    { ...town("Soham", "East of England", 11000), state: "untouched" },
    { ...town("Birmingham", "West Midlands", 1100000), state: "untouched" },
    { ...town("Unknown", "East of England", null), state: "untouched" },
  ];
  const kept = applyFilters(rows, { region: null, minPopulation: TOWN_BAND_DEFAULT_MIN, maxPopulation: TOWN_BAND_DEFAULT_MAX });
  ok(kept.some((r) => r.name === "Norwich"), `Norwich (200,770) is inside the ${TOWN_BAND_DEFAULT_MAX.toLocaleString()} default`);
  ok(!kept.some((r) => r.name === "Soham"), "Soham (11k) is below the band");
  ok(!kept.some((r) => r.name === "Birmingham"), "a city far above the band is out");
  /* ⛔ A NULL POPULATION IS EXCLUDED, not treated as zero. A town of unknown size cannot honestly
     be said to be inside a 15k-210k band, and this list decides where money goes. */
  ok(!kept.some((r) => r.name === "Unknown"), "a town with no population is excluded, never counted as zero");
}
ok(TOWN_BAND_DEFAULT_MIN >= TOWN_SEED_MIN && TOWN_BAND_DEFAULT_MAX <= TOWN_SEED_MAX,
  "the default band sits inside the seeded range, so widening the filter never needs a re-seed");

console.log("\n── THE REGION FILTER ──");
{
  const rows: CoverageRow[] = [
    { ...town("Norwich", "East of England", 200770), state: "worked" },
    { ...town("Hastings", "South East", 90000), state: "untouched" },
  ];
  const east = applyFilters(rows, { region: "East of England", minPopulation: 0, maxPopulation: 1e9 });
  ok(east.length === 1 && east[0].name === "Norwich", "region narrows to one region");
  ok(applyFilters(rows, { region: null, minPopulation: 0, maxPopulation: 1e9 }).length === 2,
    "  and a null region means all of them");
}

console.log("\n── ⚠️ EVERY STATE HAS A LABEL AND AN ORDER ──");
/* A state with no label renders as its slug; a state missing from the order sorts unpredictably.
   Both are the kind of thing that only shows up once a new state is added. */
{
  const { COVERAGE_LABEL, COVERAGE_ORDER } = await import("../src/lib/coverageState.ts");
  for (const s of COVERAGE_STATES) {
    ok(!!COVERAGE_LABEL[s], `${s} has a label`);
    ok(typeof COVERAGE_ORDER[s] === "number", `  and a sort position`);
  }
  ok(new Set(Object.values(COVERAGE_ORDER)).size === COVERAGE_STATES.length, "the orders are distinct");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   THE MUTATION'S CACHE PATCH — the half CLAUDE.md §6c says to prove before migrating a hook.
   A wrong patch here does not lose your place; it shows you a list that disagrees with the
   database, which is the failure Paul called worse.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
console.log("\n── SUPPRESSION CACHE PATCH ──");
{
  const rows: SuppressibleTown[] = [
    { id: "a", suppressed_at: null, suppressed_reason: null },
    { id: "b", suppressed_at: "2026-01-01T00:00:00Z", suppressed_reason: "conurbation fragment" },
  ];

  // SUPPRESS: the server's timestamp and reason are what land, not anything invented here.
  const sup = applySuppressionPatch(rows, "a", {
    id: "a", suppressed_at: "2026-08-10T09:00:00Z", suppressed_reason: "part of Manchester",
  });
  ok(sup?.[0].suppressed_at === "2026-08-10T09:00:00Z", "suppress takes the SERVER's timestamp");
  ok(sup?.[0].suppressed_reason === "part of Manchester", "suppress takes the server's reason");
  ok(sup?.[1].suppressed_at === "2026-01-01T00:00:00Z", "the other rows are untouched");
  ok(rows[0].suppressed_at === null, "the input array is not mutated");

  // UNSUPPRESS: nulls must land as nulls, not be skipped by a truthiness test.
  const un = applySuppressionPatch(rows, "b", { id: "b", suppressed_at: null, suppressed_reason: null });
  ok(un?.[1].suppressed_at === null, "unsuppress clears the timestamp");
  ok(un?.[1].suppressed_reason === null, "unsuppress clears the reason");

  // A suppression with no reason given — optional, and must store null rather than undefined.
  const noReason = applySuppressionPatch(rows, "a", { id: "a", suppressed_at: "2026-08-10T09:00:00Z" });
  ok(noReason?.[0].suppressed_reason === null, "a missing reason becomes null, never undefined");

  /* ⛔ THE ABSENT CASES, EACH ONE EXPLICIT. Every one of these means "refetch", and none of them
     may mean "nothing changed" — that is the branch that would leave a stale row on screen after
     a write that really happened. An endpoint deployed older than the hook produces exactly the
     first two. */
  ok(applySuppressionPatch(rows, "a", undefined) === null, "no town returned -> null (refetch)");
  ok(applySuppressionPatch(rows, "a", null) === null, "explicit null -> null (refetch)");
  ok(applySuppressionPatch(rows, "a", {}) === null, "town with no id -> null (refetch)");
  ok(applySuppressionPatch(rows, "a", { id: null }) === null, "null id -> null (refetch)");
  ok(applySuppressionPatch(rows, "zz", { id: "zz", suppressed_at: null }) === null,
     "an id matching no cached row -> null (refetch), never a silent no-op");
  ok(applySuppressionPatch([], "a", { id: "a" }) === null, "empty cache -> null (refetch)");
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILED`);
