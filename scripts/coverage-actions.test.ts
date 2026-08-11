/* ============================================================
   TWO ACTIONS ON A COVERAGE ROW: FIND LEADS, AND MARKET VIEW.

   ⛔ ONE BUTTON WAS DOING THE WRONG ONE OF TWO JOBS. "Find leads" carried `mode=market`, so the
   control labelled Find leads never ran a lead search — it opened the market read, and on an
   untouched town it opened a spend confirm on top of that. Split 2026-08-11.

   ⛔ THE PROPERTY THAT MUST HOLD FOREVER: the Find-leads href carries NO `mode=market` and NO
   `confirm=search`, on every rung. That is why both hrefs are built in coverageState instead of
   inline in the JSX — an inline template string is how the two drift back together.

   ⛔ AND THE ARRIVAL RUN IS GUARDED ON WHAT IT WAS ASKED FOR, not on what the form happens to hold.
   keyword, location and mode are all PERSISTED per user, so the form arrives holding the PREVIOUS
   search until the URL seeds land a render later. Firing then would run the last town's search from
   a button naming this one — money spent, and the right town painted above the wrong results.
   ============================================================ */
import {
  findLeadsHref, marketViewHref, wantsSearchConfirm, COVERAGE_STATES, type CoverageState,
} from "../src/lib/coverageState.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const q = (href: string) => new URLSearchParams(href.split("?")[1] ?? "");

console.log("── FIND LEADS: THE NORMAL SEARCH, AND NOTHING ELSE ──");
{
  const href = findLeadsHref("locksmiths", "Wisbech");
  const p = q(href);
  ok(p.get("mode") === "leads", `mode=leads (${p.get("mode")})`);
  ok(p.get("keyword") === "locksmiths", "the trade goes in as the KEYWORD, which is what the lead search reads");
  ok(p.get("location") === "Wisbech", "the town goes in as the LOCATION");
  ok(p.get("run") === "search", "run=search — the one-shot arrival intent");
  ok(!href.includes("mode=market"), "⛔ NO mode=market — this is the whole point of the split");
  ok(!href.includes("confirm=search"), "⛔ NO confirm=search — no spend dialog on this path");
  ok(!href.includes("trade="), "no trade= param; that belongs to the market view");
  ok(!href.includes("town="), "no town= param either");
}

console.log("\n── ⛔ AND ON EVERY RUNG, NOT JUST THE ONE THAT WAS EYEBALLED ──");
/* Enumerated off COVERAGE_STATES: a rung added later cannot quietly acquire a market link or a
   spend confirm on the Find-leads button, because this loop covers whatever exists. */
for (const state of [...COVERAGE_STATES, "brand_new_rung" as CoverageState]) {
  const href = findLeadsHref("plumber", "Kettering");
  ok(!href.includes("mode=market") && !href.includes("confirm=search"),
    `find leads is clean for a "${state}" row (the href does not depend on the rung at all)`);
}

console.log("\n── MARKET VIEW: UNCHANGED BEHAVIOUR, ITS OWN BUTTON ──");
{
  const untouched = q(marketViewHref("locksmiths", "Wisbech", "untouched"));
  ok(untouched.get("mode") === "market", "mode=market");
  ok(untouched.get("trade") === "locksmiths" && untouched.get("town") === "Wisbech", "trade and town, the market view's own params");
  ok(untouched.get("confirm") === "search", "and the arrival confirm on an untouched town");

  const measured = q(marketViewHref("locksmiths", "Wisbech", "measured"));
  ok(measured.get("mode") === "market", "still the market view on a measured town");
  ok(measured.get("confirm") === null, "⛔ but NO confirm — last session's fix survives the split");

  for (const state of COVERAGE_STATES) {
    const p = q(marketViewHref("locksmiths", "Wisbech", state));
    ok((p.get("confirm") === "search") === wantsSearchConfirm(state),
      `  ${state}: confirm ${p.get("confirm") ?? "absent"} matches wantsSearchConfirm`);
  }
}

console.log("\n── THE TWO HREFS CANNOT BE CONFUSED ──");
for (const state of COVERAGE_STATES) {
  const a = findLeadsHref("mobile mechanics", "King's Lynn");
  const b = marketViewHref("mobile mechanics", "King's Lynn", state);
  ok(a !== b, `${state}: the two buttons go to different places`);
}

console.log("\n── ENCODING: TOWNS AND TRADES WITH SPACES AND APOSTROPHES ──");
{
  const p = q(findLeadsHref("mobile valeting and detailing", "King's Lynn"));
  ok(p.get("keyword") === "mobile valeting and detailing", "a multi-word trade survives the round trip");
  ok(p.get("location") === "King's Lynn", "so does an apostrophe — URLSearchParams decodes what it encoded");
  const m = q(marketViewHref("mobile valeting and detailing", "Rowley Regis", "untouched"));
  ok(m.get("trade") === "mobile valeting and detailing" && m.get("town") === "Rowley Regis", "market view encodes the same way");
}

console.log("\n── ⛔ THE ARRIVAL RUN: EVERY WAY IT CAN BE ASKED TO FIRE ──");
/* SearchForm's effect, restated exactly. The interesting axis is not "is the guard right" but
   "which states can reach it" — the persisted form values are the trap. */
interface FormState { mode: string; keyword: string; location: string; seeded: boolean }
const fires = (askedMode: string | null, asked: { keyword?: string; location?: string }, form: FormState) => {
  if (!askedMode || !form.seeded) return false;
  if (form.mode !== askedMode) return false;
  if (asked.keyword && form.keyword.trim() !== asked.keyword.trim()) return false;
  if (asked.location && form.location.trim() !== asked.location.trim()) return false;
  if (!form.keyword.trim() || !form.location.trim()) return false;
  return true;
};
const ASKED = { keyword: "locksmiths", location: "Wisbech" };
const seededForm: FormState = { mode: "leads", keyword: "locksmiths", location: "Wisbech", seeded: true };

ok(fires("leads", ASKED, seededForm), "seeds applied, mode leads -> RUNS the normal search");
ok(!fires(null, ASKED, seededForm), "no intent -> never runs (a plain visit to Find Leads spends nothing)");
ok(!fires("leads", ASKED, { ...seededForm, seeded: false }),
  "before the seeding effect has run -> does not fire");
/* THE ONE THAT WOULD HAVE COST MONEY ON THE WRONG TOWN. */
ok(!fires("leads", ASKED, { ...seededForm, keyword: "plumber", location: "Bourne" }),
  "⛔ form still holding the PREVIOUS search -> does NOT fire (this is the caught bug)");
ok(!fires("leads", ASKED, { ...seededForm, location: "Bourne" }),
  "⛔ right trade, stale TOWN -> does not fire");
ok(!fires("leads", ASKED, { ...seededForm, keyword: "plumber" }),
  "⛔ right town, stale TRADE -> does not fire");
/* THE ONE THAT WOULD HAVE RUN THE WRONG FLOW. mode is persisted, so an operator whose last visit
   was a market view arrives with mode already 'market'. */
ok(!fires("leads", ASKED, { ...seededForm, mode: "market" }),
  "⛔ persisted mode still 'market' -> does NOT fire a market view from the Find leads button");
ok(!fires("leads", ASKED, { ...seededForm, keyword: "" }), "empty keyword -> nothing to search for");
ok(!fires("leads", ASKED, { ...seededForm, location: "   " }), "whitespace location -> nothing to search for");
ok(fires("leads", {}, { mode: "leads", keyword: "sparks", location: "Ely", seeded: true }),
  "no asked values at all (a hand-typed run intent) -> falls back to whatever the form holds");

console.log("\n── AND IT IS ONCE-ONLY, WHICH IS WHAT KEEPS A REFRESH FREE ──");
/* The ref in the component; restated so the property is recorded. The URL param is also stripped on
   arrival, so there are two independent reasons a refresh cannot re-run a paid search. */
{
  let ran = 0;
  const once = { done: false };
  for (let i = 0; i < 5; i++) {
    if (once.done) continue;
    if (!fires("leads", ASKED, seededForm)) continue;
    once.done = true;
    ran += 1;
  }
  ok(ran === 1, `five renders, one search (${ran})`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
