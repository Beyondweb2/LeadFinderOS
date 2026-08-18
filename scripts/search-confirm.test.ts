/* ============================================================
   THE MODAL THAT OPENED OVER THE THING YOU CLICKED.

   Coverage's "Find leads" link carried `confirm=search` on EVERY row, so clicking through to a town
   already measured opened "Run the lead search? ~$0.14" on top of the market numbers that were the
   reason for the click. Nothing was spent — but the page Paul uses all day answered a click by
   covering itself with a dialog he had not asked for.

   ⛔ TWO GUARDS, AND THE SECOND IS THE ONE THAT DECIDES. The link is a hint from a page that grades
   `measured` off a COMPLETED run; the market panel refuses off the market's own AUDIT count, which
   is wider. So the interesting case is not "does the rule work" but WHICH GUARD EACH CASE REACHES —
   CLAUDE.md's rule after Soham: ask not whether the guard is correct, but whether the case it guards
   can reach it.

   ⛔ AND THE SUPPRESSION NEEDS A KNOWN POSITIVE. A view that has not loaded reports null audits, and
   null is not zero and not "measured" — it must OPEN the confirm, because the confirm spends nothing
   until it is pressed. This is the absent-value shape CLAUDE.md records six times, guarded in the
   direction that keeps the intent alive rather than the direction that swallows it.
   ============================================================ */
import {
  wantsSearchConfirm, COVERAGE_STATES, coverageStateFor, coverageKey,
  type CoverageState, type CoverageFacts,
} from "../src/lib/coverageState.ts";
import {
  openArrivalSearchConfirm, suppressArrivalSearchConfirm, auditsInView,
} from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** Coverage.tsx's link, restated exactly as the page builds it. */
const linkFor = (trade: string, town: string, state: CoverageState) =>
  `/find-leads?mode=market&trade=${encodeURIComponent(trade)}&town=${encodeURIComponent(town)}`
  + (wantsSearchConfirm(state) ? "&confirm=search" : "");

/** MarketPanel's arrival decision, restated exactly as the component makes it: the intent off the
 *  URL, and the audit count off the view `load` RETURNED. */
const panelOpens = (intent: boolean, view: { concentration?: { audits?: number } } | null) =>
  openArrivalSearchConfirm(intent, auditsInView(view));

const facts = (o: Partial<CoverageFacts> = {}): CoverageFacts => ({
  measuredCounts: o.measuredCounts ?? new Map(),
  leadPairs: o.leadPairs ?? new Set(),
  workedPairs: o.workedPairs ?? new Set(),
});
const town = (name: string) => ({ id: name, name, region: "East of England", population: 30000 });

console.log("── THE LINK: WHICH RUNGS ASK FOR THE CONFIRM ──");
ok(wantsSearchConfirm("untouched"), "untouched asks — nothing measured, no pool, this is what the link is for");
ok(wantsSearchConfirm("leads"), "leads found asks — leads exist but nothing is measured and the pool has expired");
ok(!wantsSearchConfirm("measured"), "⛔ measured does NOT ask — this is the bug: a modal over the numbers you clicked");
ok(!wantsSearchConfirm("worked"), "⛔ worked does NOT ask either");

console.log("\n── EVERY RUNG IS DECIDED, AND A NEW ONE FALLS TO THE HARMLESS SIDE ──");
/* Enumerated off COVERAGE_STATES rather than listed by hand: a fifth rung added later shows up here
   as a count mismatch instead of silently inheriting whichever branch it happened to land in. */
{
  const asks = COVERAGE_STATES.filter(wantsSearchConfirm);
  ok(COVERAGE_STATES.length === 4, `four rungs known to this test (${COVERAGE_STATES.length})`);
  ok(asks.length === 2 && asks.includes("untouched") && asks.includes("leads"),
    `exactly two rungs ask: ${asks.join(", ")}`);
  /* The direction of the test is the point. `state === 'untouched' || state === 'leads'` puts an
     unknown rung on the no-modal side; `state !== 'measured'` would put it on the modal side. */
  ok(!wantsSearchConfirm("brand_new_rung" as CoverageState),
    "⛔ an unrecognised rung does NOT auto-open a dialog — positive test, harmless default");
}

console.log("\n── THE PANEL: A KNOWN POSITIVE SUPPRESSES, AN ABSENT VALUE DOES NOT ──");
ok(!suppressArrivalSearchConfirm(null), "⛔ null audits (view not loaded / failed) does NOT suppress — absence is not a measurement");
ok(!suppressArrivalSearchConfirm(0), "zero audits does not suppress — that market genuinely needs the search");
ok(suppressArrivalSearchConfirm(1), "one audit suppresses");
ok(suppressArrivalSearchConfirm(16), "sixteen audits suppress");
ok(!suppressArrivalSearchConfirm(Number.NaN), "NaN does not suppress — an unreadable count is not a count");

console.log("\n── auditsInView: A MISSING FIELD READS null, NEVER 0 ──");
/* `?? 0` here would turn a payload from an older market-view deploy into "no audits in this market"
   and re-open the exact modal this work removes. */
ok(auditsInView(null) === null, "no view at all -> null");
ok(auditsInView({}) === null, "view with no concentration -> null");
ok(auditsInView({ concentration: {} }) === null, "concentration with no audits field -> null");
ok(auditsInView({ concentration: { audits: 0 } }) === 0, "a real zero is a real zero");
ok(auditsInView({ concentration: { audits: 7 } }) === 7, "a real count comes through");

console.log("\n── THE FULL MATRIX: INTENT × WHAT THE VIEW SAID ──");
ok(!panelOpens(false, null), "no intent, no view -> nothing opens");
ok(!panelOpens(false, { concentration: { audits: 0 } }), "no intent on an unmeasured market -> nothing opens (the link decides that)");
ok(panelOpens(true, { concentration: { audits: 0 } }), "intent + zero audits -> OPENS, which is the whole feature");
ok(!panelOpens(true, { concentration: { audits: 2 } }), "⛔ intent + audits -> REFUSED, whatever the URL says");
ok(panelOpens(true, null), "intent + a view that failed to load -> opens; we never learned it was measured");

console.log("\n── ⛔ THE TWO GUARDS DISAGREE ON PURPOSE, AND THE PANEL WINS ──");
/* A market whose audits ALL FAILED has no completed run, so Coverage grades it below `measured` and
   the link still carries the param. The panel then refuses it off the audit count. Neither guard is
   wrong; the second is simply the one holding the decision — which is why the refusal has to say so
   on screen and carry its own override, rather than looking like a dead click. */
{
  const k = coverageKey("locksmiths", "Eastbourne");
  const state = coverageStateFor("locksmiths", town("Eastbourne"), facts({ leadPairs: new Set([k]) }));
  ok(state === "leads", `two failed audits + leads in the CRM still grades "${state}"`);
  ok(linkFor("locksmiths", "Eastbourne", state).includes("confirm=search"), "  so the link DOES carry the intent");
  ok(!panelOpens(true, { concentration: { audits: 2 } }), "  and the panel refuses it anyway — 2 audits, 0 completed");
}

console.log("\n── END TO END, THE FOUR RUNGS, CLICK TO DIALOG ──");
{
  const k = coverageKey("locksmiths", "Wisbech");
  const cases: { label: string; facts: CoverageFacts; audits: number; expectDialog: boolean }[] = [
    { label: "untouched town, empty market", facts: facts(), audits: 0, expectDialog: true },
    { label: "leads in the CRM, nothing measured", facts: facts({ leadPairs: new Set([k]) }), audits: 0, expectDialog: true },
    { label: "measured town (16 audits)", facts: facts({ measuredCounts: new Map([[k, 2]]) }), audits: 16, expectDialog: false },
    { label: "worked town (16 audits)", facts: facts({ workedPairs: new Set([k]) }), audits: 16, expectDialog: false },
  ];
  for (const c of cases) {
    const state = coverageStateFor("locksmiths", town("Wisbech"), c.facts);
    const url = linkFor("locksmiths", "Wisbech", state);
    const intent = url.includes("confirm=search");
    const opened = panelOpens(intent, { concentration: { audits: c.audits } });
    ok(opened === c.expectDialog,
      `${c.label} [${state}] -> ${opened ? "dialog" : "no dialog"} (param ${intent ? "sent" : "not sent"})`);
  }
}

console.log("\n── AND THE PANEL IS THE BACKSTOP FOR A LINK THAT PREDATES THIS ──");
/* A bookmark, a pasted URL, or a Coverage tab whose React Query cache was filled before the market
   was measured all still carry `confirm=search`. The link fix alone would not cover any of them. */
ok(!panelOpens(true, { concentration: { audits: 16 } }),
  "a stale bookmarked confirm=search on a 16-audit market still opens nothing");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
