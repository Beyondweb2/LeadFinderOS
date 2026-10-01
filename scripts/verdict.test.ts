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
/** The verdict's sub-line, which carries the real counts. */
function subFor(named: number, total: number, competitors: string[]): string {
  const html = renderReportHtml({
    businessName: "Test Co", businessType: "accountant", town: "Chichester",
    named, total, pct: total ? Math.round((named / total) * 100) : 0,
    competitors, perEngine: [], questions: [], hasWebsite: true,
    questionsAsked: 3, enginesUsed: 2,
  } as never);
  return (html.match(/class="punch-sub">([^<]*)/) ?? [])[1] ?? "(none)";
}

/* 🔴 REVISED 2026-10-02. The verdict was re-banded on 2026-08-29 in Paul's exact wording (verdictBand:
   <=15% rare, <=40% not yet consistent, <=70% many, above that "one of the names AI reaches for"),
   and these blocks kept asserting the OLD sentences ("once in 6 answers", "let's make it every time",
   competitor clauses), so 11 of them were red for a month. The PRINCIPLES they guarded are unchanged
   and are what is asserted now: a named business is never told it is absent, the counts are real, no
   competitor claim without measured rivals, the top band asks nothing, and every band boundary lands
   where verdictBand says. Plus the 2026-10-02 fix: no sub-line claims work we did not do or a
   comparison we did not measure (this hero is what a FREE-CHECK prospect sees). */
console.log("── ⛔ THE ACCOUNTING STUDIO: 1 OF 6 (17%) ──");
const rare = punchFor(1, 6, ["Rival A", "Rival B"]);
console.log(`   "${rare}"`);
ok(rare.includes("being named, but not yet consistently"), "17% is the not-yet-consistent band — a named business is told it is named");
ok(!rare.includes("straight to your competitors"), "the absent-sounding line is GONE for a named business");
ok(subFor(1, 6, ["Rival A"]).includes("named in 1 of 6 answers"), "the sub-line carries the real count");

console.log("\n── NEVER NAMED IS A MEASUREMENT, NOT A CLAIM ABOUT AI'S KNOWLEDGE ──");
const zero = punchFor(0, 6, ["Rival A"]);
console.log(`   "${zero}"`);
ok(zero.includes("rarely names you yet") && subFor(0, 6, ["Rival A"]).includes("named in 0 of 6 answers"), "states what was measured, with the count");
ok(!zero.toLowerCase().includes("know you exist"), "no longer claims what AI knows");

console.log("\n── ⛔ NO CLAIM ABOUT RIVALS, IN ANY BAND (rivals measured or not) ──");
for (const [n, t] of [[0, 6], [1, 6], [3, 6], [5, 6], [6, 6]] as Array<[number, number]>) {
  for (const rivals of [[], ["R"]]) {
    const line = `${punchFor(n, t, rivals)} ${subFor(n, t, rivals)}`;
    ok(!/competitor/i.test(line), `${n} of ${t}, ${rivals.length ? "rivals found" : "no rivals"}: no competitor claim in the verdict`);
  }
}

console.log("\n── ⛔ NO CLAIM OF WORK WE DID NOT DO (2026-10-02) ──");
for (const [n, t] of [[1, 6], [2, 6], [3, 6], [4, 6]] as Array<[number, number]>) {
  ok(!/we have built pages|ahead of most/i.test(subFor(n, t, ["R"])), `${n} of ${t}: no "where we have built pages" / "ahead of most" claim`);
}

console.log("\n── THE TOP OF THE RANGE ──");
const all = punchFor(6, 6, ["R"]);
console.log(`   "${all}"`);
ok(all.includes("one of the names AI reaches for") && subFor(6, 6, ["R"]).includes("named in 6 of 6 answers"), "6 of 6 is the top band, with the real count");
ok(!`${all} ${subFor(6, 6, ["R"])}`.includes("every time"), "and does NOT ask to make it every time — it already is");

console.log("\n── BAND BOUNDARIES (verdictBand: <=15 / <=40 / <=70 / above) ──");
ok(punchFor(1, 7, []).includes("rarely names you yet"), "1/7 = 14% -> rare");
ok(punchFor(1, 6, []).includes("not yet consistently"), "1/6 = 17% -> not yet consistent");
ok(punchFor(2, 5, []).includes("not yet consistently"), "2/5 = 40% -> still not yet consistent (inclusive top)");
ok(punchFor(3, 6, []).includes("across many of the questions"), "3/6 = 50% -> many");
ok(punchFor(7, 10, []).includes("across many of the questions"), "7/10 = 70% -> still many (inclusive top)");
ok(punchFor(5, 6, []).includes("one of the names AI reaches for"), "5/6 = 83% -> top band");
ok(punchFor(1, 1, []).includes("one of the names AI reaches for") && subFor(1, 1, []).includes("named in 1 of 1 answers"), "1 of 1 is 100% -> top band, real count");

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
/* 2026-10-02: the named heading became "Where you show up, and where you don't yet" (aiAuditReportHtml.ts);
   the property is the same — a named business never gets the absent heading. */
ok(one.includes("Where you show up, and where you don&rsquo;t yet"), "named once -> 'Where you show up, and where you don't yet'");
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
