/* The 20 targeted searches picked from a Discovery's own answers (V2's pick rule). */
import { pickTargetedSearches, type PickInput } from "../src/lib/targetedPick.ts";
import { winnableOf } from "../src/lib/reportDesign.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const mk = (n: number, tier: string, firms: number): PickInput => ({ question: `q${n} ${tier}`, tier, firms, verdict: tier === "lots" || tier === "some" ? "winnable" : tier === "little" || tier === "nofirms" ? "not_winnable" : null });
const pool: PickInput[] = [
  ...Array.from({ length: 12 }, (_, i) => mk(i, "lots", 10 - (i % 5))),
  ...Array.from({ length: 6 }, (_, i) => mk(20 + i, "some", 6)),
  ...Array.from({ length: 6 }, (_, i) => mk(40 + i, "little", 3 + i)),
  ...Array.from({ length: 5 }, (_, i) => mk(60 + i, "nofirms", 0)),
  mk(80, "notoffered", 4),
];
const hook = ["q40 little", "q1 lots", "not asked in the discovery"];
const p = pickTargetedSearches(pool, hook);
ok(p.length === 20, "exactly 20");
ok(p[0].question === "q40 little" && p[1].question === "q1 lots" && p.filter((x) => x.source === "hook").length === 2, "every hook search the discovery asked comes first, in order, even when not winnable");
const harder = p.filter((x) => x.source === "harder");
ok(harder.length === 4 && harder[0].question === "q45 little", "4 harder main searches with 2 hooks, most firms first");
ok(p.filter((x) => x.source === "winnable").length === 14, "the rest are winnable (14)");
ok(p.findIndex((x) => x.source === "winnable") < p.findIndex((x) => x.source === "harder"), "order: hooks, winnable, harder");
ok(!p.some((x) => /nofirms|notoffered/.test(x.question)), "no search where AI names no firms when there is enough else; never a left-out search");
ok(p.filter((x) => x.source === "winnable").every((x, i, a) => i === 0 || !(/some/.test(a[i - 1].question) && /lots/.test(x.question))), "lots of room before some room");

const small = pickTargetedSearches([mk(1, "lots", 5), mk(2, "nofirms", 0), mk(3, "little", 2)], []);
ok(small.length === 3 && small.at(-1)!.source === "nofirms", "short pool: a no-firms search only as the last resort");
ok(pickTargetedSearches([mk(1, "lots", 5), mk(2, "lots", 5)], ["q2 lots", "q2 lots"]).length === 2, "never twice");

// winnableOf
const q = (tier: string, repeatShare = 0, top = 1, answers = 6) => winnableOf({ tier: tier as never, repeatShare, top, answers });
ok(q("lots") === "winnable" && q("some") === "winnable", "Lots and Some room = Winnable");
ok(q("little") === "not_winnable" && q("nofirms") === "not_winnable", "Little room and no firms = Not winnable");
ok(q("named", 0.2) === "winnable" && q("named", 0.7) === "not_winnable", "already named: winnable unless one or two firms own it");
ok(q("notonsite") === null && q("flagged") === null && q("notoffered") === null, "not on their site / another place / not their service: left out");
// Whole-city searches (Paul, 2026-11-14): not winnable unless AI already names the business there.
const w = (question: string, tier: string, namedYou: number) => winnableOf({ tier: tier as never, repeatShare: 0, top: 2, answers: 6, question, namedYou });
ok(w("best plumber in London", "lots", 0) === "not_winnable" && w("property maintenance for landlords in London", "some", 0) === "not_winnable", "a whole big-city search with room is NOT winnable when AI never names them");
ok(w("best plumber in London", "some", 1) === "winnable", "a whole big-city search IS winnable once AI names them at least once");
ok(w("plumber in Yorkshire", "lots", 0) === "not_winnable" && w("roofer in Greater Manchester", "some", 0) === "not_winnable", "regions and Greater X count as whole areas");
ok(w("electrician in East London", "some", 0) === "winnable", "a compass quarter of a city (East London) stays local");
ok(w("locksmith in Canterbury", "some", 0) === "winnable" && w("plumber in Bow", "lots", 0) === "winnable", "a smaller city and a district stay local");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
