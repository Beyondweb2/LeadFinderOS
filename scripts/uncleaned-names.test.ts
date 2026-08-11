/* ============================================================
   IS THIS COMPETITOR LIST CLEAN? THE MEASUREMENT, AND WHY THE RATIO LOST.

   The queued plan (CLAUDE.md §8) was: measure distinct names per QUESTION, put the threshold in the
   empty band, refuse to grade a shape above it. The measurement was run against every market that
   has completed questions — all 20 — and it killed the plan:

     perQ  junkWords  market                       what the names look like
     27.8      39     locksmiths / rowley regis    "they" "ask" "always" "check" "call" "many"
     25.1      39     locksmiths / wakefield       "here" "why" "they" "i'd" "good" "for"
     17.9      33     locksmiths / eastbourne      "give" "particularly" "another" "here"
      9.6      24     locksmiths / chorley         "fully" "call" "always" "check" "ask" "many"
      5.8      18     accountant / chichester      "their" "you" "many" "ask" "i'd"
      4.8       0     mobile mechanics / wisbech
      4.4       0     electricians / portsmouth
      3.9…2.1   0     the other thirteen

   ⛔ A THRESHOLD OF 10 — the number the notes recorded as "mid-gap and safe" — WOULD HAVE MISSED
   CHORLEY (9.6) AND ACCOUNTANT/CHICHESTER (5.8), both provably raw. The recorded gap of 5.4→17.9 had
   closed: chorley landed inside it. The real dirty/clean boundary on the ratio is 5.8 against 4.8,
   which is not a gap, it is a coincidence — and a constant placed in it would be §4's fifth.

   ⛔ SO THE GATE IS A FACT. A single-token English function word cannot be a firm's name, and the
   LLM cleaner would never return one. 39/39/33/24/18 on the five dirty markets, EXACTLY ZERO across
   793 distinct names in the other fifteen. Nothing in between to tune.
   ============================================================ */
import {
  isUncleanedName, uncleanedNames, marketNamesUncleaned, shouldAutoClean, marketShape,
  CLEANER_USD_PER_RUN, asPence, UNCLEANED_EXAMPLES_SHOWN,
  type MarketShapeInput, type MarketConcentration,
} from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── THE MARKER TEST: WORDS THAT CANNOT BE FIRMS ──");
for (const junk of ["always", "here", "they", "i'd", "check", "for", "particularly", "you", "Here", " always "]) {
  ok(isUncleanedName(junk), `"${junk}" is a marker`);
}

console.log("\n── ⚠️ AND THE LIST IS DELIBERATELY INCOMPLETE ──");
/* Chorley's fold also holds "vat", "matthew", "chorley" and "lancashire" — obvious junk that the
   list does NOT catch. It is not trying to: it needs to catch ONE marker to prove a fold is raw, and
   every word added is a word that could belong to some real firm somewhere. The measured counts
   (39/39/33/24/18, and zero across 793 clean names) belong to the list AS IT STANDS — grow it and
   that sweep has to be re-run before the zeros can be quoted again. */
for (const uncaught of ["vat", "matthew", "chorley", "lancashire", "pvc"]) {
  ok(!isUncleanedName(uncaught), `"${uncaught}" is junk the list does not claim to catch`);
}

console.log("\n── ⛔ SINGLE TOKEN ONLY, SO REAL FIRMS PASS BY CONSTRUCTION ──");
/* This is the whole reason the test is safe on multi-word names: the risky words in the list only
   ever appear inside a real name alongside something else. */
for (const real of [
  "First Pick Locksmiths", "Always Secure Ltd", "One Call Locksmiths", "New Forest Electrical",
  "Best Kept Gardens", "Help At Home Care", "Timpson", "Checkatrade", "LockRite Locksmiths (Chorley)",
  "M&K Plumbing", "A1 Locksmiths", "Uno Accountancy Services",
]) {
  ok(!isUncleanedName(real), `"${real}" is NOT a marker`);
}

console.log("\n── ⚠️ SINGLE-TOKEN REAL NAMES THE LIST MUST NOT SWALLOW ──");
/* The words the list deliberately does NOT contain, because a firm could plausibly be called them
   on their own. If one is ever added, these fail and the 793-name clean sweep has to be re-run. */
for (const single of ["timpson", "keytek", "lockforce", "hmrc", "yell", "cylex", "locksmith", "lockrite"]) {
  ok(!isUncleanedName(single), `"${single}" is not treated as junk`);
}

console.log("\n── uncleanedNames: DISTINCT, SORTED, SHOWS ITS WORKING ──");
{
  const fold = ["Always", "always", "First Pick Locksmiths", "here", "Buckshaw Locksmiths Ltd", "i'd", "here"];
  const found = uncleanedNames(fold);
  ok(found.length === 3, `three distinct markers out of seven names (${found.join(", ")})`);
  ok(found.join(",") === "always,here,i'd", "deduped and sorted, so the flag reads the same every render");
  ok(uncleanedNames(["First Pick Locksmiths", "Pad-Locks Locksmiths"]).length === 0, "a clean fold finds none");
  ok(uncleanedNames([]).length === 0, "an empty fold finds none — nothing to be dirty");
}

console.log("\n── ⛔ THE ABSENT CASE: NOT KNOWN IS NOT DIRTY, AND NOT CLEAN EITHER ──");
/* A view cached before this shipped, or an older market-view deploy, carries no uncleanedCount.
   Refusing to grade on absence would blank the verdict on every market at once — including the
   fifteen measured clean — so absence keeps the previous behaviour. Deliberate, and stated. */
ok(!marketNamesUncleaned(undefined), "no concentration at all -> not refused");
ok(!marketNamesUncleaned(null), "null concentration -> not refused");
ok(!marketNamesUncleaned({}), "concentration with no uncleanedCount (older deploy) -> not refused");
ok(!marketNamesUncleaned({ uncleanedCount: undefined }), "explicitly undefined -> not refused");
ok(!marketNamesUncleaned({ uncleanedCount: Number.NaN }), "NaN -> not refused, an unreadable count is not a count");
ok(!marketNamesUncleaned({ uncleanedCount: 0 }), "a real zero -> clean, and that IS an answer");
ok(marketNamesUncleaned({ uncleanedCount: 1 }), "one marker -> refused; there is no acceptable number of them");
ok(marketNamesUncleaned({ uncleanedCount: 39 }), "rowley regis -> refused");

console.log("\n── THE AUTO-CLEANER ──");
ok(!shouldAutoClean(true, 0), "⛔ dirty with NO completed run never cleans — nothing to re-read, so the spend buys nothing");
ok(shouldAutoClean(true, 2), "dirty with 2 runs cleans");
ok(!shouldAutoClean(false, 2), "clean with runs does not clean");
ok(!shouldAutoClean(false, 0), "clean with no runs does not clean");
/* ⛔ WHAT CHANGED, AND IT IS THE POINT OF THE REWRITE. The old guard was a ratio: chorley's fold of
   "always"/"vat"/"i'd" scores 9.6 per question, under any threshold the recorded distribution would
   have justified, so it would never have been cleaned. */
ok(shouldAutoClean(marketNamesUncleaned({ uncleanedCount: 24 }), 3),
  "chorley (9.6 per question, 24 markers) NOW cleans — the old ratio would never have fired");
ok(!shouldAutoClean(marketNamesUncleaned({ uncleanedCount: 0 }), 3),
  "a genuinely fragmented CLEAN market does not pay 21p to re-read names that are already firms");

console.log("\n── ⛔ THE SHAPE REFUSES, AND IT REFUSES BEFORE IT READS A NAME ──");
const base: MarketShapeInput = {
  audits: 2, completeRuns: 2,
  leader: { name: "here", mentions: 31 },
  leaderRow: {
    key: "here", name: "here", variants: ["here"], mentions: 31, audits: 2,
    tier: "established", auditShare: 1, mentionShare: 1, otherTowns: 0,
  },
  citationHosts: [{ host: "checkatrade.com", citations: 40, isAggregator: true }],
  citationTotal: 287, distinctBusinesses: 239,
  marketAuditsComplete: 2, businessAuditsComplete: 0,
};
{
  const graded = marketShape(base);
  /* Without the flag it grades — and on the corrected rule it grades eastbourne WORTH WORKING, off a
     leader called "here". Wrong in the friendlier direction than the old skip, and still wrong. */
  ok(graded.kind === "local_leader", `without the flag, eastbourne grades "${graded.kind}" — a verdict computed over "here"`);

  const refused = marketShape({ ...base, namesUncleaned: true, uncleanedExamples: ["always", "here", "they"], runsToClean: 2 });
  ok(refused.kind === "names_uncleaned", "with the flag it refuses to grade");
  ok(refused.reasoning.some((r) => r.includes('"here"')), "the refusal QUOTES the markers rather than asserting");
  ok(refused.reasoning.some((r) => r.includes(asPence(2 * CLEANER_USD_PER_RUN))), "and prices its own fix");
  ok(!refused.headline.toLowerCase().includes("skip"), "⛔ it never tells anyone to skip a market it refused to judge");
}

console.log("\n── THE EVIDENCE GATE STILL COMES FIRST ──");
/* "Not measured enough" needs no names at all, so it is the more basic statement and keeps priority.
   Everything the uncleaned refusal protects is arithmetic over names, which only exists past here. */
{
  const thin = marketShape({
    ...base, audits: 1, completeRuns: 0, marketAuditsComplete: 0, businessAuditsComplete: 0,
    namesUncleaned: true, uncleanedExamples: ["always"], runsToClean: 0,
  });
  ok(thin.kind === "unmeasured", `an unmeasured market says so rather than complaining about names (${thin.kind})`);
}

console.log("\n── AND A REFUSAL WITH NOTHING TO CLEAN SAYS THAT ──");
{
  const nothing = marketShape({ ...base, namesUncleaned: true, uncleanedExamples: ["always"], runsToClean: 0 });
  ok(nothing.kind === "names_uncleaned", "still refused");
  ok(nothing.reasoning.some((r) => r.includes("no completed run")),
    "⛔ and it does not offer a cleaner that would re-read zero runs");
}

console.log("\n── THE FIVE MEASURED MARKETS, END TO END ──");
/* The measured counts, driven through the real reader and the real gate. This is the row of the
   deliverable: which markets stop having a verdict until they are cleaned. */
{
  const measured: { market: string; perQ: number; markers: number; runs: number }[] = [
    { market: "locksmiths / rowley regis", perQ: 27.8, markers: 39, runs: 2 },
    { market: "locksmiths / wakefield", perQ: 25.1, markers: 39, runs: 2 },
    { market: "locksmiths / eastbourne", perQ: 17.9, markers: 33, runs: 2 },
    { market: "locksmiths / chorley", perQ: 9.6, markers: 24, runs: 3 },
    { market: "accountant / chichester", perQ: 5.8, markers: 18, runs: 11 },
    { market: "mobile mechanics / wisbech", perQ: 4.8, markers: 0, runs: 3 },
    { market: "electricians / portsmouth", perQ: 4.4, markers: 0, runs: 2 },
    { market: "locksmiths / blyth", perQ: 2.4, markers: 0, runs: 2 },
  ];
  for (const m of measured) {
    const conc: Pick<MarketConcentration, "uncleanedCount"> = { uncleanedCount: m.markers };
    const dirty = marketNamesUncleaned(conc);
    ok(dirty === (m.markers > 0), `${m.market} (${m.perQ}/question, ${m.markers} markers) -> ${dirty ? "REFUSED" : "graded"}`);
    /* The threshold that was going to ship, restated, so the miss is on the record rather than in a
       comment: two of the five dirty markets score below 10. */
    if (m.markers > 0 && m.perQ < 10) {
      ok(true, `  ⛔ and a threshold of 10 would have graded it anyway (${m.perQ})`);
    }
  }
  const refusedRuns = measured.filter((m) => m.markers > 0).reduce((s, m) => s + m.runs, 0);
  ok(refusedRuns === 20, `cleaning all five costs ${refusedRuns} runs = ${asPence(refusedRuns * CLEANER_USD_PER_RUN)}, no re-auditing`);
}

console.log(`\nexamples shown on screen: ${UNCLEANED_EXAMPLES_SHOWN}`);
console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
