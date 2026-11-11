/* The simple client reports (src/lib/reportDesign.ts + reportOpportunity.ts): presentation over stored counts.
   Pins Paul's sorting rule (2026-11-11, third version), directories-never-competitors, the plain-English copy
   rules (no jargon, "searches", the footer line, no promises), the page order, escaping and the phone viewport. */
import { oppQuestion, summariseOpportunity, hookFromRows, directoriesInAnswer, isDirectoryName, ruleVerdict, inTheirArea, RULE_WORDS, type OppRow } from "../src/lib/reportOpportunity.ts";
import { chooseReportDesign, renderOpportunityReport, renderHookReport, renderBaselineReport, shortName } from "../src/lib/reportDesign.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const cell = (firms: string[], named = false, urls: string[] = [], text = "") => ({ named, self_named: named, competitors: firms, citations: urls.map((url) => ({ url })), answer_text: text });
/** Three asks, two engines, from per-answer firm lists. */
function rowsFor(q: string, perAnswer: string[][], urls: string[][] = []): OppRow[] {
  const out: OppRow[] = [];
  for (let run = 0; run < 3; run++) out.push({ question: q, result: { chatgpt: cell(perAnswer[run * 2] ?? [], false, urls[run * 2] ?? []), gemini: cell(perAnswer[run * 2 + 1] ?? [], false, urls[run * 2 + 1] ?? []) } });
  return out;
}
const ctx = { businessName: "Acme Heating Ltd", services: [{ name: "boiler servicing", dedicated: false }], siteText: "acme heating boiler servicing gas safety electrical maintenance" };
const Q = "boiler servicing in London";

// ── THE SORTING RULE ──
let q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["G"], ["G"], ["G"], ["G"]]), ctx);
ok(q.tier === "hard" && q.top === 6, "one business in 6 of 6 answers is Hard to win");
q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["G"], ["G"], ["G"], ["A"]]), ctx);
ok(q.tier === "hard" && q.top === 5, "one business in 5 of 6 answers is Hard to win");
q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["G"], ["G"], ["A"], ["B"]]), ctx);
ok(q.tier === "possible" && q.top === 4, "one business in 4 of 6 answers is Possible with work");
q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["G"], ["A"], ["B"], ["C"]]), ctx);
ok(q.tier === "possible" && q.top === 3, "one business in 3 of 6 answers is Possible with work");
q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["A"], ["B"], ["C"], ["D"]]), ctx);
ok(q.tier === "now" && q.top === 2, "one business in 2 of 6 answers (under half) is You could win");
q = oppQuestion(Q, rowsFor(Q, [[], [], [], [], [], []]), ctx);
ok(q.tier === "now" && q.why === "AI names nobody", "AI names nobody at all: You could win, 'AI names nobody'");
q = oppQuestion("leak detection in Bow", rowsFor("leak detection in Bow", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), ctx);
ok(q.tier === "possible" && q.why === "Not on your website yet", "a service not on their website is Possible with work, never You could win");
q = oppQuestion("leak detection in Bow", rowsFor("leak detection in Bow", [["L"], ["L"], ["L"], ["L"], ["L"], []]), ctx);
ok(q.tier === "hard", "5 of 6 is Hard to win even for a service they do not offer");
q = oppQuestion("boiler servicing in Clapham", rowsFor("boiler servicing in Clapham", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), { ...ctx, areas: ["London", "Hackney"] });
ok(q.tier === "possible", "outside their areas is Possible with work");
q = oppQuestion("best boiler servicing in London", rowsFor("best boiler servicing in London", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), ctx);
ok(q.tier === "now", "a 'best' search follows the same rule (no special cap)");
ok(inTheirArea("Clapham", ["Hackney"]) === false && inTheirArea("Hackney", ["Hackney"]) && inTheirArea("Bow", undefined), "area test: known areas decide, unknown areas do not exclude");
ok(RULE_WORDS.map((r) => r.label).join("|") === "You could win|Possible with work|Hard to win", "the three groups carry Paul's labels");
const rvh = ruleVerdict(Q, rowsFor("x", [["A"], ["A"], ["A"], ["A"], ["A"], ["B"]]).map((r) => r.result as Record<string, unknown>), ctx);
ok(rvh.verdict === "locked" && rvh.tier === "hard", "ruleVerdict speaks the page plan's words: Hard is 'locked'");
const rvp = ruleVerdict(Q, rowsFor("x", [["A"], ["A"], ["A"], ["B"], [], []]).map((r) => r.result as Record<string, unknown>), ctx);
ok(rvp.verdict === "contested", "ruleVerdict: Possible with work is 'contested'");
const rvo = ruleVerdict(Q, rowsFor("x", [[], [], ["A"], [], [], []]).map((r) => r.result as Record<string, unknown>), ctx);
ok(rvo.verdict === "open", "ruleVerdict: You could win is 'open'");

// ── DIRECTORIES ──
const dirCell = cell(["Checkatrade", "Real Plumbing Ltd"], false, ["https://www.checkatrade.com/x", "https://www.yell.com/y", "https://random-firm.co.uk"], "Reviews on Trustpilot and Google reviews are good.");
const found = directoriesInAnswer(dirCell).sort();
ok(["Checkatrade", "Yell", "Trustpilot", "Google reviews"].every((n) => found.includes(n)) && !found.includes("random-firm.co.uk"), "directories are found by cited site and by name in the answer");
ok(isDirectoryName("Checkatrade") && isDirectoryName("Trustpilot") && !isDirectoryName("Real Plumbing Ltd"), "a directory name is recognised, a business is not");
q = oppQuestion(Q, [{ question: Q, result: { chatgpt: dirCell, gemini: cell(["Checkatrade"], false, ["https://www.checkatrade.com/z"]) } }], ctx);
ok(!q.firms.some((x) => /checkatrade/i.test(x.name)) && q.firms.length === 1, "a directory is never counted as a competitor");
const withDirs = summariseOpportunity([
  ...rowsFor(Q, [[], [], [], [], [], []], [["https://checkatrade.com/a"], ["https://checkatrade.com/b"], ["https://yell.com/c"], [], [], []]),
  ...rowsFor("plumbing in Hackney", [[], [], [], [], [], []], [["https://checkatrade.com/a"], [], [], [], [], []]),
], ctx);
ok(withDirs.directories[0].name === "Checkatrade" && withDirs.directories[0].answers === 3 && withDirs.directories[0].questions === 2, "overall, directories are ranked by how often AI uses them");

// ── THE PAGES ──
const rows = [
  ...rowsFor(Q, [[], [], [], ["A"], ["B"], []], [["https://checkatrade.com/a"], [], [], [], [], []]),
  ...rowsFor("boiler service in Bow", [["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"]]),
  ...rowsFor("electrician in Bow", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]),
];
const s = summariseOpportunity(rows, ctx);
ok(s.now + s.possible + s.hard === 3 && s.answers === 18, "the three groups add up to the searches asked");
const base = { businessName: "Acme Heating Ltd", trade: "heating", town: "London", dateLabel: "11 Nov 2026" };
const text = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/, "").replace(/ style="[^"]*"/g, "").replace(/<[^>]+>/g, " ");
const opp = renderOpportunityReport({ ...base, summary: s });
const hook = renderHookReport({ ...base, ...hookFromRows(rows, ["electrician in Bow"]) });
const bl = renderBaselineReport({ ...base, questions: s.questions, rivals: s.rivals, answers: 18, namedYou: 0, directories: s.directories, checkAgainLabel: "9 Dec 2026" });

ok(opp.includes("When people ask AI for heating in London, it doesn&#39;t mention you yet.") || text(opp).includes("it doesn't mention you yet"), "headline: 'When people ask AI for … it doesn't mention you yet.'");
const order = (html: string, marks: string[]) => marks.map((m) => html.indexOf(m)).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1]));
ok(order(opp, ["Findable", "<h1>", "You could win", "AI recommends these instead", "searches you could win", "Get listed on these sites", "What we'd do", "Talk to Paul on WhatsApp", "See all searches"]), "opportunity report: sections in Paul's order");
ok(order(hook, ["<h1>", "AI recommends these instead", "Example searches", "Talk to Paul on WhatsApp"]), "first-contact report: headline, who AI recommends, example searches, button");
ok(order(bl, ["How often AI mentions you today", "searches we track", "We check again on 9 Dec 2026", "What we'd do", "Talk to Paul on WhatsApp"]), "client report: today, the searches, when we check again, what we do, button");
for (const [name, html] of [["opportunity", opp], ["first-contact", hook], ["client", bl]] as const) {
  const t = text(html);
  ok(!/\b(discovery|baseline|verdict|engines?|fragment(ed|ation)|citations?|visibility score|geo)\b/i.test(t), `${name}: no jargon on the page`);
  ok(!/\bquestions?\b/i.test(t), `${name}: says "searches", never "questions"`);
  ok(/These are opportunities, not guarantees\./.test(t), `${name}: ends with the not-guarantees line`);
  ok(/Talk to Paul on WhatsApp/.test(t), `${name}: has the one button`);
  ok(/name="viewport"/.test(html) && /noindex/.test(html), `${name}: phone viewport and noindex`);
  ok(!/\b(guarantee[sd]? (you|a|that)|will (rank|recommend|name)|ranking promised|#1)\b/i.test(t), `${name}: no ranking or recommendation promise`);
  ok(!/\d+ ?%/.test(t), `${name}: no percentage headline`);
}
ok(/Get listed on these sites/.test(opp) && /Checkatrade/.test(opp), "opportunity report has 'Get listed on these sites'");
// escaping
const evil = renderHookReport({ ...base, businessName: "A<script>x</script>", ...hookFromRows([{ question: "q", result: { chatgpt: cell(["<img src=x>"]) } }], ["q"]) });
ok(!/<script>x|<img src=x>/.test(evil), "business and firm names are escaped");
ok(shortName("London Domestic Maintenance Ltd") === "London Domestic Maintenance" && shortName("Ltd") === "Ltd", "shortName drops a trailing Ltd only");

// which design a stored audit gets
const pick = (o: Partial<Parameters<typeof chooseReportDesign>[0]>) => chooseReportDesign({ hookComplete: false, measuring: false, ...o });
ok(pick({ auditPurpose: "discovery" }) === "opportunity", "a Discovery audit gets the opportunity report");
ok(pick({ paidKind: "baseline" }) === "baseline" && pick({ paidKind: "remeasure" }) === null, "a paid baseline gets the client report; the day-28 re-measure keeps the classic page");
ok(pick({ hookComplete: true }) === "hook" && pick({ hookComplete: false }) === null, "a complete six-answer hook gets the first-contact report");
ok(pick({ auditPurpose: "discovery", measuring: true }) === null && pick({ hookComplete: true, nameNotJudgeable: true }) === null && pick({ auditPurpose: "discovery", classic: true }) === null, "measuring, name-unjudgeable and ?design=classic keep the classic page");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
