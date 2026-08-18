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
import { summariseSearchResults } from "../src/lib/searchOutcome.ts";

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

console.log("\n── THE SEARCH RESULT LINE: DID THE CLICK DO ANYTHING? ──");
{
  const fresh = summariseSearchResults(12, 0, { trade: "locksmiths", town: "Ipswich" });
  ok(fresh.tone === "new" && fresh.newCount === 12, "12 found, none held -> 12 new");
  ok(fresh.headline === "12 found for locksmiths in Ipswich: 12 new to add.", `headline: ${fresh.headline}`);

  const mixed = summariseSearchResults(12, 3, { trade: "locksmiths", town: "Ipswich" });
  ok(mixed.newCount === 9, "12 found, 3 held -> 9 new");
  ok(mixed.headline.includes("9 new to add, 3 already in your CRM"), `headline: ${mixed.headline}`);

  const allKnown = summariseSearchResults(12, 12, { trade: "locksmiths", town: "Ipswich" });
  ok(allKnown.tone === "all_known" && allKnown.newCount === 0, "every result already held -> all_known");
  ok(allKnown.headline.includes("already added, 0 new"), `⛔ Paul's own words for this state: ${allKnown.headline}`);

  const empty = summariseSearchResults(0, 0, { trade: "locksmiths", town: "Nowhereton" });
  ok(empty.tone === "empty", "nothing found -> empty");
  ok(empty.headline.startsWith("Nothing found for locksmiths in Nowhereton"), `headline: ${empty.headline}`);
}

console.log("\n── ⛔ IT NEVER CLAIMS AN ADD HAPPENED ──");
/* A search writes nothing to the CRM. The word "added" may appear only in "already added". */
for (const [found, held] of [[12, 0], [12, 3], [12, 12], [0, 0], [1, 1]]) {
  const o = summariseSearchResults(found, held, { trade: "locksmiths", town: "Ipswich" });
  const claimsAdd = /\badded\b/.test(o.headline) && !o.headline.includes("already added");
  ok(!claimsAdd, `${found}/${held}: says found, not added — "${o.headline}"`);
}

console.log("\n── THE ABSENT AND ABSURD INPUTS ──");
ok(summariseSearchResults(0, 5).newCount === 0, "more held than found -> newCount floors at 0, never negative");
ok(summariseSearchResults(10, 99).alreadyInCrm === 10, "held is bounded by found — a stale CRM list cannot print -89 new");
ok(summariseSearchResults(Number.NaN, Number.NaN).found === 0, "NaN -> 0, never \"NaN found\" on screen");
ok(summariseSearchResults(-4, -1).found === 0, "negatives clamp to 0");
{
  const noWhere = summariseSearchResults(5, 1);
  ok(!noWhere.headline.includes(" for "), `no trade/town -> the sentence omits them cleanly: ${noWhere.headline}`);
  const halfWhere = summariseSearchResults(5, 1, { trade: "locksmiths", town: "" });
  ok(!halfWhere.headline.includes(" for "), "⛔ trade WITHOUT town omits both — \"for locksmiths in\" reads like a bug");
  const trimmed = summariseSearchResults(5, 1, { trade: "  locksmiths  ", town: "  Ipswich  " });
  ok(trimmed.headline.includes("for locksmiths in Ipswich"), "whitespace-padded inputs are trimmed");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
