/* ============================================================
   IS BEING MOST-CITED A REASON TO SKIP A MARKET? MEASURED 2026-08-10: NO.

   The verdict used to skip a market when an AGGREGATOR was its most-cited host. Five towns were
   skipped on that signal — Eastbourne, Chichester, Portsmouth, Loughborough, Kettering. Paul's
   counter-evidence was Eastbourne: Checkatrade top-cited at 14%, and J&J Locksmiths leading the
   naming with 32 mentions.

   ⛔ MEASURED ACROSS EVERY MARKET WITH A COMPLETED RUN. 17 have an aggregator as the most-cited host,
   and in ALL SEVENTEEN AI names local firms anyway:
     * 15 of 17 — the aggregator's own brand is not in the named list at all;
     * 2 of 17  — it IS named, far behind the local leader: Stamford 9 mentions against 68,
                  Eastbourne 13 against 32;
     * local firms hold all three top spots in 10 of the 17, two of three in another 4.

   The decisive one is plumber/WISBECH: Checkatrade takes 27% of citations, the highest share in the
   book, and the three most-named firms are all local — Fen Property Services (52), DC Plumbing (49),
   Mr Gas and Heating (37). That is the town Paul has actually worked. §5 already said being cited is
   not being named; this is the same fact pointing the other way.

   ⛔ SO THE CITATION HALF IS DROPPED, and the naming half is WIDENED from the leader to the top
   three — Paul's own proposal. Colchester is why: LockRite, Lockforce and LockFit hold the top three,
   no local firm anywhere near them, and the leader-only test called that the same thing as a market
   whose leader is a franchise and whose #2 is a local firm.
   ============================================================ */
import {
  marketShape, NATIONAL_MIN_OTHER_TOWNS, NATIONAL_TOP_N,
  type MarketShapeInput, type MarketNamedRow, type MarketCitationHost,
} from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const firm = (name: string, mentions: number, otherTowns: number): MarketNamedRow => ({
  key: name.toLowerCase(), name, variants: [name], mentions, audits: 2,
  tier: "established", auditShare: 1, mentionShare: 1, otherTowns,
});
const CHECKATRADE: MarketCitationHost = { host: "checkatrade.com", citations: 39, isAggregator: true };
const OWN_SITE: MarketCitationHost = { host: "jjlocksmiths.co.uk", citations: 30, isAggregator: false };

const market = (named: MarketNamedRow[], hosts: MarketCitationHost[]): MarketShapeInput => ({
  audits: 2, completeRuns: 2,
  leader: named[0] ? { name: named[0].name, mentions: named[0].mentions } : null,
  leaderRow: named[0] ?? null,
  topNamed: named,
  citationHosts: hosts, citationTotal: 284,
  distinctBusinesses: Math.max(named.length, 20),
  marketAuditsComplete: 2, businessAuditsComplete: 0,
});

console.log("── ⛔ THE FIVE SKIPPED TOWNS, AS MEASURED ──");
{
  /* Eastbourne: Checkatrade top-cited, J&J leading, Checkatrade itself named 13 times. Every reason
     the old rule skipped it, and it is a local-firm market. */
  const eastbourne = market(
    [firm("J&J Locksmiths", 32, 0), firm("Eastbourne Locksmiths", 27, 0), firm("LockRite Locksmiths", 15, 6), firm("Checkatrade", 13, 9)],
    [CHECKATRADE],
  );
  ok(marketShape(eastbourne).kind === "local_leader", "locksmiths/eastbourne: WORKABLE — was skipped");

  /* plumber/Wisbech: 27% Checkatrade, the highest citation share measured, all-local naming. */
  const wisbech = market(
    [firm("Fen Property Services", 52, 0), firm("DC Plumbing & Heating", 49, 0), firm("Mr Gas and Heating", 37, 0)],
    [{ host: "checkatrade.com", citations: 163, isAggregator: true }],
  );
  ok(marketShape(wisbech).kind === "local_leader", "plumber/wisbech: WORKABLE — and it is the town already worked");

  const chichester = market(
    [firm("Chi-Lec Electrical Contractors Ltd", 23, 0), firm("Swift Electrical Sussex Ltd", 19, 0), firm("Arctic Electrical", 16, 0)],
    [CHECKATRADE],
  );
  ok(marketShape(chichester).kind === "local_leader", "electrician/chichester: WORKABLE — was skipped");

  const portsmouth = market(
    [firm("CPC Electrical and Mechanical Ltd", 12, 0), firm("Mayo Electrical Contractors Ltd", 12, 0), firm("MBS Electrical Services Ltd", 10, 0)],
    [{ host: "checkatrade.com", citations: 25, isAggregator: true }],
  );
  ok(marketShape(portsmouth).kind === "local_leader", "electrician/portsmouth: WORKABLE — was skipped");
}

console.log("\n── AND THE ONE THE NEW RULE STILL SKIPS, FOR THE RIGHT REASON ──");
{
  /* Colchester: three national franchises at the top and no local firm. The leader-only test called
     this the same as a market with a local #2; it is not the same market. */
  const colchester = market(
    [firm("LockRite Locksmiths Colchester", 10, 8), firm("Lockforce Locksmith Colchester", 10, 6), firm("LockFit Colchester Locksmiths", 9, 7)],
    [{ host: "checkatrade.com", citations: 15, isAggregator: true }],
  );
  const shape = marketShape(colchester);
  ok(shape.kind === "national_led", "locksmiths/colchester: national brands hold all three top spots");
  ok(shape.reasoning.some((r) => r.includes("LockRite Locksmiths Colchester") && r.includes("LockFit")),
    "  and it NAMES all three rather than asserting a category");
  ok(shape.reasoning.some((r) => r.includes("does not predict who gets named")),
    "  the citation fact is still reported — as intelligence, under a verdict it did not decide");
}

console.log("\n── ⛔ A NATIONAL LEADER WITH A LOCAL RUNNER-UP IS WORKABLE, WHICH IS THE WIDENING ──");
{
  const mixed = market(
    [firm("RED Driving School", 21, 9), firm("DSSSM Driving School", 27, 0), firm("Dare2Drive", 20, 0)],
    [OWN_SITE],
  );
  /* leader by mentions is DSSSM here; put the franchise first explicitly to test the ordering case. */
  const franchiseFirst = market(
    [firm("RED Driving School", 40, 9), firm("DSSSM Driving School", 27, 0), firm("Dare2Drive", 20, 0)],
    [OWN_SITE],
  );
  ok(marketShape(mixed).kind === "local_leader", "local firms in the top three -> workable");
  const s = marketShape(franchiseFirst);
  ok(s.kind === "local_leader", "a NATIONAL leader with local firms behind it -> still workable (was skipped)");
  ok(s.reasoning.some((r) => r.includes("best-named LOCAL firm is DSSSM Driving School")),
    "  and the sentence names the local firm a client would actually be compared against");
}

console.log("\n── THE ABSENT CASES ──");
{
  /* An older caller passes no topNamed at all: fall back to the leader alone, i.e. exactly the
     previous behaviour, rather than reading an empty list as "no local firm at the top". */
  const noTopNamed: MarketShapeInput = { ...market([firm("RAC Mobile Mechanics", 18, 7)], [OWN_SITE]), topNamed: undefined };
  ok(marketShape(noTopNamed).kind === "national_led", "no topNamed -> falls back to the leader (previous behaviour)");

  const noNamed: MarketShapeInput = { ...market([], [CHECKATRADE]), leader: null, leaderRow: null, topNamed: [] };
  ok(marketShape(noNamed).kind === "unmeasured", "⛔ an EMPTY naming list is not 'no local firm at the top' — it is nothing measured");

  const missingTowns = market([{ ...firm("Some Firm", 10, 0), otherTowns: undefined as unknown as number }], [OWN_SITE]);
  ok(marketShape(missingTowns).kind === "local_leader",
    "a row with no otherTowns count is treated as LOCAL — an unknown footprint is not a national one");
}

console.log("\n── THE EVIDENCE GATE STILL WINS, AND AN AGGREGATOR CANNOT SNEAK A SKIP PAST IT ──");
{
  const oneAudit: MarketShapeInput = {
    ...market([firm("Beldom Plumbing and Heating", 16, 0)], [CHECKATRADE]),
    audits: 1, completeRuns: 1, marketAuditsComplete: 0, businessAuditsComplete: 1,
  };
  ok(marketShape(oneAudit).kind === "unmeasured", "one business audit is still not enough to judge anything");
}

console.log(`\nthresholds: national at ${NATIONAL_MIN_OTHER_TOWNS}+ other towns, tested across the top ${NATIONAL_TOP_N}`);
console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
