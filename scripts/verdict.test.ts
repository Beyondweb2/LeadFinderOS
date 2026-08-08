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

console.log("\n── ⛔ SINGULAR / PLURAL, AND THE ARTICLE ──");
/* All three were live on a real report: "1 times ... showed up", "out of 1 answers" (latent), and
   "looking for a accountant". Every count in this document is interpolated, so nothing agrees a
   noun for you — which is why the helpers exist rather than the fixes being made inline. */
function htmlFor(named: number, total: number, type: string) {
  return renderReportHtml({
    businessName: "Test Co", businessType: type, town: "Chichester",
    named, total, pct: total ? Math.round((named / total) * 100) : 0,
    competitors: ["R"], perEngine: [], questions: [], hasWebsite: true,
    questionsAsked: 3, enginesUsed: 2,
  } as never);
}
const one = htmlFor(1, 6, "accountant");
/* ⚠️ The number and its noun live in SEPARATE elements — <span class="num">1</span> then
   <div class="l1">time …</div> — so assert on the l1 text, not on "1 time" as one string. My first
   version of these two assertions failed against correct code for exactly that reason. */
const l1 = (h: string) => (h.match(/class="l1">([^<]*)/) ?? [])[1] ?? "";
ok(l1(one).startsWith("time Test Co showed up"), `1 -> "time": "${l1(one)}"`);
ok(!l1(one).startsWith("times"), "  and the plural is gone");
ok(l1(htmlFor(2, 6, "plumber")).startsWith("times Test Co showed up"), "2 -> 'times'");
ok(htmlFor(1, 1, "plumber").includes("out of 1 answer<"), "a single answer reads 'out of 1 answer'");
ok(one.includes("out of 6 answers"), "6 answers stays plural");

ok(one.includes("looking for an <b>accountant"), "vowel trade -> 'an accountant'");
ok(htmlFor(1, 6, "plumber").includes("looking for a <b>plumber"), "consonant trade -> 'a plumber'");
ok(htmlFor(1, 6, "electrician").includes("looking for an <b>electrician"), "'an electrician'");

console.log("\n── ⛔ THE FIX SECTION MUST NOT CALL A NAMED BUSINESS ABSENT ──");
/* The third place in one document that disagreed about whether the business exists in AI answers. */
ok(one.includes("Why you&rsquo;re named so rarely"), "named once -> 'Why you're named so rarely'");
ok(!one.includes("Why you&rsquo;re not in the answer"), "  the absent heading is gone");
ok(one.includes("Being named occasionally rather than consistently is not bad luck"), "  and the lead matches");
const zeroNamed = htmlFor(0, 6, "accountant");
ok(zeroNamed.includes("Why you&rsquo;re not in the answer"), "never named -> the absent heading is CORRECT and kept");
ok(zeroNamed.includes("Being absent is not bad luck"), "  and its lead is kept too");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");

console.log("\n── ⛔ NO DESIGN COMMENTARY REACHES THE PROSPECT ──");
/* 16 HTML comments were being served in a live report, including the offer block's rationale
   ("more than anyone reads at the moment they are deciding to pay") and, added while fixing this
   document's own faults, sentences narrating those faults back. A sceptical accountant is invited
   to check this document; finding that in view-source is worse than the faults were. */
const rendered = htmlFor(1, 6, "accountant");
const comments = [...rendered.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
ok(comments.length === 0, `no HTML comments in the served document (found ${comments.length})`);
for (const phrase of [
  "more than anyone reads at the moment they are deciding to pay",
  "said the business was named once",
  "Here's what's holding it back",
]) ok(!rendered.includes(phrase), `  internal note absent: ${JSON.stringify(phrase.slice(0, 42))}`);
/* And the document is still intact — stripping must not have eaten the content around them. */
ok(rendered.includes("<!doctype html>") && rendered.trimEnd().endsWith("</html>"), "the document still opens and closes correctly");
ok(rendered.includes("class=\"src\"") || rendered.includes("offer-gets"), "  and still carries its real sections");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
