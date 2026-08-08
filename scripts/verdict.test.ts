/* ============================================================
   THE HERO VERDICT — every line must survive the prospect checking it.

   ⛔ This is the first sentence on the artefact that sells, and the easiest claim in the document to
   disprove: they can open ChatGPT and look. Four faults were found at the EDGES of the old bands,
   all the same shape — true in the middle of the range, an overclaim at one end.

     1 of 6   said "AI sends your customers straight to your competitors."  A business AI DOES
              mention was being told it is absent. 17% shared a band with 0%.
     0 of 6   said "AI doesn't know you exist."  A claim about what AI KNOWS. We measured what it
              ANSWERED to three questions. Ask it "have you heard of X?" and it may say yes.
     mid      said "your competitors get the rest" even when the audit found no rival names.
     6 of 6   said "let's make it every time" when it already WAS every time.
   ============================================================ */
import { renderReportHtml } from "../src/lib/aiAuditReportHtml.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** Render a report and pull the verdict line out of it — the real renderer, not a copy of the rule. */
function punchFor(named: number, total: number, competitors: string[]): string {
  const html = renderReportHtml({
    businessName: "Test Co", businessType: "accountant", town: "Chichester",
    named, total, pct: total ? Math.round((named / total) * 100) : 0,
    competitors, perEngine: [], questions: [], hasWebsite: true,
    questionsAsked: 3, enginesUsed: 2,
  } as never);
  return (html.match(/class="punch">([^<]*)/) ?? [])[1] ?? "(none)";
}

console.log("── ⛔ THE ACCOUNTING STUDIO: 1 OF 6 ──");
const rare = punchFor(1, 6, ["Rival A", "Rival B"]);
console.log(`   "${rare}"`);
ok(rare.includes("once in 6 answers"), "reads 'once in 6 answers' — checkable, and a real count");
ok(!rare.includes("straight to your competitors"), "the absent-sounding line is GONE for a named business");
ok(rare.includes("Your competitors are in nearly all of them"), "the gap is named — the pitch this band exists for");

console.log("\n── NEVER NAMED IS A MEASUREMENT, NOT A CLAIM ABOUT AI'S KNOWLEDGE ──");
const zero = punchFor(0, 6, ["Rival A"]);
console.log(`   "${zero}"`);
ok(zero.includes("never named you in 6 answers"), "states what was measured");
ok(!zero.toLowerCase().includes("know you exist"), "no longer claims what AI knows");

console.log("\n── ⛔ NO RIVALS FOUND -> NO CLAIM ABOUT RIVALS, IN ANY BAND ──");
for (const [n, t] of [[0, 6], [1, 6], [3, 6], [5, 6], [6, 6]] as Array<[number, number]>) {
  const p = punchFor(n, t, []);
  ok(!/competitor/i.test(p), `${n} of ${t} with no rivals measured: "${p}"`);
}
ok(/competitor/i.test(punchFor(1, 6, ["R"])), "  ...and the clause DOES appear when rivals were found");

console.log("\n── THE TOP OF THE RANGE ──");
const all = punchFor(6, 6, ["R"]);
console.log(`   "${all}"`);
ok(all.includes("all 6 answers"), "6 of 6 says all");
ok(!all.includes("every time"), "and does NOT ask to make it every time — it already is");
const five = punchFor(5, 6, ["R"]);
ok(five.includes("let’s make it every time"), "5 of 6 still does, correctly");
/* ⚠️ Caught by reading this suite's own output: the word form gives "in five times of 6 answers".
   Bare digits are right in this construction, word form is right in "once in 6 answers". */
ok(five.includes("in 5 of 6 answers"), `  and reads grammatically: "${five}"`);

console.log("\n── BAND BOUNDARIES (thresholds unchanged; only 0 moved out of `low`) ──");
ok(punchFor(1, 6, []).includes("once"), "1/6 below a third -> rare");
ok(punchFor(2, 6, []).includes("twice"), "2/6 is exactly a third -> mid");
ok(punchFor(4, 6, []).includes("in 4 of 6 answers"), "4/6 is exactly two thirds -> high, in digits");
ok(punchFor(1, 1, []).includes("all 1 answer"), "1 of 1 is 100% -> the all-answers line, singular");

console.log("\n── AND NO LINE EVER CLAIMS ABSENCE OF A NAMED BUSINESS ──");
for (const n of [1, 2, 3, 4, 5, 6]) {
  const p = punchFor(n, 6, ["R"]);
  ok(!/doesn.t know you exist|never named/i.test(p), `${n} of 6 does not read as absent`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
