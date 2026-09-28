/* ============================================================
   "HAVE I PULLED LEADS FROM THIS TOWN?" — the count, and the search result line.

   ⛔ THE RUNG COULD NOT ANSWER IT, AND THAT IS THE GAP. coverageStateFor returns the FURTHEST rung
   only, so a town at `measured` or `worked` said nothing about whether leads had ever been pulled
   there — and `measured` does not imply leads at all, because a market audit needs none. The count
   is therefore a SECOND marker on the row, not a fifth rung: the rung says how far this went, the
   count says whether there are leads.

   ⛔ COUNTED FROM THE SAME pairs.leads THE RUNG IS DERIVED FROM. One fetch, one truth. A second
   query for counts could answer differently from the one that graded the row, and the two would
   disagree silently on the page whose whole job is deciding where to spend next.
   ============================================================ */
import {
  countLeadsByPair, coverageKey, coverageStateFor, COVERAGE_STATES,
  type CoverageFacts,
} from "../src/lib/coverageState.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const town = (name: string) => ({ id: name, name, region: "East of England", population: 30000 });

console.log("── THE COUNT COMES OFF THE PAIRS, ONE ENTRY PER LEAD ──");
{
  const pairs = [
    { trade: "locksmiths", town: "Wisbech" },
    { trade: "locksmiths", town: "wisbech " },          // same town, sloppier
    { trade: "locksmith", town: "Wisbech, UK" },         // singular trade + country suffix
    { trade: "plumber", town: "Wisbech" },
  ];
  const counts = countLeadsByPair(pairs);
  ok(counts.get(coverageKey("locksmiths", "Wisbech")) === 3,
    `⛔ all three locksmith spellings fold into ONE town's count (${counts.get(coverageKey("locksmiths", "Wisbech"))})`);
  ok(counts.get(coverageKey("plumber", "Wisbech")) === 1, "a different trade in the same town counts separately");
  ok(counts.get(coverageKey("locksmiths", "Ely")) === undefined, "a town with no leads has no entry (renders nothing)");
  ok(countLeadsByPair([]).size === 0, "no leads at all -> an empty map, not a map of zeroes");
}

console.log("\n── ⛔ THE CASE THE RUNG COULD NOT SHOW ──");
/* A measured town with leads, and a measured town without. Identical rung, different reality — which
   is the whole reason the count exists. */
{
  const k = coverageKey("locksmiths", "Norwich");
  const facts: CoverageFacts = {
    measuredCounts: new Map([[k, 2]]), leadPairs: new Set(), workedPairs: new Set(),
  };
  const state = coverageStateFor("locksmiths", town("Norwich"), facts);
  const withLeads = countLeadsByPair([{ trade: "locksmiths", town: "Norwich" }, { trade: "locksmiths", town: "Norwich" }]);
  const without = countLeadsByPair([]);
  ok(state === "measured", "both towns grade `measured`");
  ok((withLeads.get(k) ?? 0) === 2 && (without.get(k) ?? 0) === 0,
    "  but one shows 2 leads and the other shows none — visible at a glance, no clicking in");
}

console.log("\n── EVERY RUNG CAN CARRY A COUNT (the two are independent) ──");
for (const state of COVERAGE_STATES) {
  ok(typeof state === "string", `${state} is a rung; the count is orthogonal to it`);
}
{
  /* A `leads` town obviously has leads; the interesting assertion is that `worked` and `measured` can
     too, and that `untouched` cannot be given one by this code path. */
  const k = coverageKey("locksmiths", "Wisbech");
  const counts = countLeadsByPair([{ trade: "locksmiths", town: "Wisbech" }]);
  const untouched = coverageStateFor("locksmiths", town("Ely"), {
    measuredCounts: new Map(), leadPairs: new Set([k]), workedPairs: new Set(),
  });
  ok(untouched === "untouched", "a town with no pairs of its own stays untouched");
  ok((counts.get(coverageKey("locksmiths", "Ely")) ?? 0) === 0, "  and shows no count");
}

/* The search result line (summariseSearchResults) was deleted 2026-09-28 with the Find Leads banner it
   drew (Paul); the Search Results heading and its "Showing X of Y" line replace it (sales-flow-reliability). */

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
