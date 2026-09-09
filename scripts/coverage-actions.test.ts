/* ============================================================
   THE ONE ACTION ON A COVERAGE ROW: FIND LEADS.

   ⛔ IT USED TO BE THREE, AND ONE OF THEM DID THE WRONG JOB. "Find leads" once carried
   `mode=market`, so the control labelled Find leads never ran a lead search — it opened the market
   read, and on an untouched town it opened a spend confirm on top of that (split 2026-08-11). The
   market view itself was deleted on 2026-09-09 (96 market audits ever, none since 24 August), so
   the Market view and View buttons went with it and this is the only row action left.

   ⛔ THE PROPERTY THAT MUST HOLD FOREVER: the Find-leads href carries NO `mode=market` and NO
   `confirm=search`, on every rung. Kept even though nothing can serve `mode=market` any more —
   that is precisely when a stale param becomes invisible, and this href is built in coverageState
   rather than inline in the JSX so it cannot drift back.

   ⛔ AND THE ARRIVAL RUN IS GUARDED ON WHAT IT WAS ASKED FOR, not on what the form happens to hold.
   keyword, location and mode are all PERSISTED per user, so the form arrives holding the PREVIOUS
   search until the URL seeds land a render later. Firing then would run the last town's search from
   a button naming this one — money spent, and the right town painted above the wrong results.
   ============================================================ */
import { findLeadsHref, COVERAGE_STATES, type CoverageState } from "../src/lib/coverageState.ts";

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


{
  const p = q(findLeadsHref("mobile valeting and detailing", "King's Lynn"));
  ok(p.get("keyword") === "mobile valeting and detailing", "a multi-word trade survives the round trip");
  ok(p.get("location") === "King's Lynn", "so does an apostrophe — URLSearchParams decodes what it encoded");
}

console.log("\n── ⛔ THE ARRIVAL RUN: EVERY WAY IT CAN BE ASKED TO FIRE ──");
/* SearchForm's effect, restated exactly. The interesting axis is not "is the guard right" but
   "which states can reach it" — the persisted form values are the trap. */
interface FormState { keyword: string; location: string; seeded: boolean }
const fires = (asked_: boolean, asked: { keyword?: string; location?: string }, form: FormState) => {
  if (!asked_ || !form.seeded) return false;
  if (asked.keyword && form.keyword.trim() !== asked.keyword.trim()) return false;
  if (asked.location && form.location.trim() !== asked.location.trim()) return false;
  if (!form.keyword.trim() || !form.location.trim()) return false;
  return true;
};
const ASKED = { keyword: "locksmiths", location: "Wisbech" };
const seededForm: FormState = { keyword: "locksmiths", location: "Wisbech", seeded: true };

ok(fires(true, ASKED, seededForm), "seeds applied -> RUNS the search");
ok(!fires(false, ASKED, seededForm), "no intent -> never runs (a plain visit to Find Leads spends nothing)");
ok(!fires(true, ASKED, { ...seededForm, seeded: false }),
  "before the seeding effect has run -> does not fire");
/* THE ONE THAT WOULD HAVE COST MONEY ON THE WRONG TOWN. */
ok(!fires(true, ASKED, { ...seededForm, keyword: "plumber", location: "Bourne" }),
  "⛔ form still holding the PREVIOUS search -> does NOT fire (this is the caught bug)");
ok(!fires(true, ASKED, { ...seededForm, location: "Bourne" }),
  "⛔ right trade, stale TOWN -> does not fire");
ok(!fires(true, ASKED, { ...seededForm, keyword: "plumber" }),
  "⛔ right town, stale TRADE -> does not fire");
/* ⚠️ The mode case is GONE because the mode is. It used to matter a great deal: `mode` was
   persisted, so an operator whose last visit was a market view would have fired a MARKET VIEW from
   a button labelled Find leads. With one mode left there is nothing to mismatch — but the keyword
   and town guards above are the same shape and still carry the whole weight. */
ok(!fires(true, ASKED, { ...seededForm, keyword: "" }), "empty keyword -> nothing to search for");
ok(!fires(true, ASKED, { ...seededForm, location: "   " }), "whitespace location -> nothing to search for");
ok(fires(true, {}, { keyword: "sparks", location: "Ely", seeded: true }),
  "no asked values at all (a hand-typed run intent) -> falls back to whatever the form holds");

console.log("\n── AND IT IS ONCE-ONLY, WHICH IS WHAT KEEPS A REFRESH FREE ──");
/* The ref in the component; restated so the property is recorded. The URL param is also stripped on
   arrival, so there are two independent reasons a refresh cannot re-run a paid search. */
{
  let ran = 0;
  const once = { done: false };
  for (let i = 0; i < 5; i++) {
    if (once.done) continue;
    if (!fires(true, ASKED, seededForm)) continue;
    once.done = true;
    ran += 1;
  }
  ok(ran === 1, `five renders, one search (${ran})`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
