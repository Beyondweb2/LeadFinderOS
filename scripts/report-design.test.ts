/* The redesigned client reports (src/lib/reportDesign.ts + reportOpportunity.ts): presentation over stored counts.
   Pins Paul's winnable rule (2026-11-11), directories-never-competitors, the "never a % headline / never a promise"
   copy rules, escaping and the phone viewport. */
import { oppQuestion, summariseOpportunity, hookFromRows, directoriesInAnswer, isDirectoryName, inTheirArea, RULE_WORDS, type OppRow } from "../src/lib/reportOpportunity.ts";
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

// ── THE RULE ──
let q = oppQuestion("boiler service in Bow", rowsFor("boiler service in Bow", [["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First", "X"]]), ctx);
ok(q.tier === "hard" && q.top === 6, "one firm in 6 of 6 answers is Hard");
q = oppQuestion("boiler service in Bow", rowsFor("boiler service in Bow", [["G"], ["G"], ["G"], ["G"], ["A"], ["B"]]), ctx);
ok(q.tier === "hard" && q.top === 4, "one firm in 4 of 6 answers (most) is Hard");
q = oppQuestion("boiler service in Bow", rowsFor("boiler service in Bow", [["G"], ["G"], ["G"], ["A"], ["B"], ["C"]]), ctx);
ok(q.tier === "now" && !q.easy && q.top === 3, "one firm in exactly half (3 of 6) is not 'most': Winnable");
q = oppQuestion("boiler servicing in London", rowsFor("boiler servicing in London", [[], [], [], [], [], []]), ctx);
ok(q.tier === "now" && q.easy, "no business named at all, a service they offer, in their area: Winnable (easy)");
q = oppQuestion("boiler servicing in London", rowsFor("boiler servicing in London", [[], [], [], ["A"], ["B"], []]), ctx);
ok(q.tier === "now" && !q.easy && q.empty === 4, "no single business in most answers, offered, in area: Winnable");
const fragmentedOutside = oppQuestion("boiler servicing in Clapham", rowsFor("boiler servicing in Clapham", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), { ...ctx, areas: ["London", "Hackney"] });
ok(fragmentedOutside.tier === "possible" && /outside/i.test(fragmentedOutside.reasons.join(" ")), "fragmented but outside their area: Possible, never Winnable");
const fragmentedNoService = oppQuestion("leak detection in Bow", rowsFor("leak detection in Bow", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), ctx);
ok(fragmentedNoService.tier === "possible" && /not a service/i.test(fragmentedNoService.reasons.join(" ")), "fragmented but a service not on their site: Possible, never Winnable");
q = oppQuestion("leak detection in Bow", rowsFor("leak detection in Bow", [["Leak Co"], ["Leak Co"], ["Leak Co"], ["Leak Co"], [], []]), ctx);
ok(q.tier === "hard", "dominance beats everything: a business in most answers is Hard even for a service they do not offer");
q = oppQuestion("best boiler servicing in London", rowsFor("best boiler servicing in London", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), ctx);
ok(q.tier === "now", "a 'best' question follows the same rule (no special cap)");
ok(inTheirArea("Clapham", ["Hackney"]) === false && inTheirArea("Hackney", ["Hackney"]) && inTheirArea("Bow", undefined), "area test: known areas decide, unknown areas do not exclude");
ok(RULE_WORDS.map((r) => r.label).join("|") === "Winnable (easy)|Winnable|Possible|Hard", "the four rule lines are printed in Paul's order");

// ── DIRECTORIES ──
const dirCell = cell(["Checkatrade", "Real Plumbing Ltd"], false, ["https://www.checkatrade.com/x", "https://www.yell.com/y", "https://random-firm.co.uk"], "Reviews on Trustpilot and Google reviews are good.");
const found = directoriesInAnswer(dirCell).sort();
ok(["Checkatrade", "Yell", "Trustpilot", "Google reviews"].every((n) => found.includes(n)) && !found.includes("random-firm.co.uk"), "directories are found by cited host and by name in the answer");
ok(isDirectoryName("Checkatrade") && isDirectoryName("Trustpilot") && !isDirectoryName("Real Plumbing Ltd"), "a directory name is recognised, a business is not");
q = oppQuestion("boiler servicing in London", [{ question: "boiler servicing in London", result: { chatgpt: dirCell, gemini: cell(["Checkatrade"], false, ["https://www.checkatrade.com/z"]) } }], ctx);
ok(!q.firms.some((x) => /checkatrade/i.test(x.name)) && q.firms.length === 1, "a directory is never counted as a competitor");
ok(q.dirs[0].name === "Checkatrade" && q.dirs[0].answers === 2, "per question, the directory is counted by answers");
const withDirs = summariseOpportunity([
  ...rowsFor("boiler servicing in London", [[], [], [], [], [], []], [["https://checkatrade.com/a"], ["https://checkatrade.com/b"], ["https://yell.com/c"], [], [], []]),
  ...rowsFor("plumbing in Hackney", [[], [], [], [], [], []], [["https://checkatrade.com/a"], [], [], [], [], []]),
], ctx);
ok(withDirs.directories[0].name === "Checkatrade" && withDirs.directories[0].answers === 3 && withDirs.directories[0].questions === 2, "overall, directories are ranked by how often AI cites them");

// ── whole-report copy rules over a small fixture ──
const rows = [
  ...rowsFor("boiler servicing in London", [[], [], [], ["A"], ["B"], []], [["https://checkatrade.com/a"], [], [], [], [], []]),
  ...rowsFor("boiler service in Bow", [["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"]]),
  ...rowsFor("electrician in Bow", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]),
];
const s = summariseOpportunity(rows, ctx);
ok(s.now + s.possible + s.hard === 3 && s.answers === 18, "tiers add up to the questions asked");
const base = { businessName: "Acme Heating Ltd", trade: "heating", town: "London", dateLabel: "11 Nov 2026" };
const text = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/, "").replace(/ style="[^"]*"/g, "");
const opp = renderOpportunityReport({ ...base, summary: s, engines: "ChatGPT and Gemini", asks: 3 });
ok(/<h1><em>\d+<\/em> questions Acme Heating could win/.test(opp), "opportunity headline leads with the winnable count, no company suffix");
ok(!/\d+ ?%/.test(text(opp)), "no percentage headline in the opportunity report");
ok(/not a promise/i.test(opp), "opportunity report says winnable is not a promise");
ok(RULE_WORDS.every((r) => opp.includes(r.text)) && /Fragmented answers alone are never enough/.test(opp), "the winnable rule is printed in plain words");
ok(/Get listed here first/.test(opp) && /Checkatrade/.test(opp), "opportunity report has a 'Get listed here first' list");
const hook = renderHookReport({ ...base, ...hookFromRows(rows, ["electrician in Bow"]) });
ok(/AI recommends these businesses/.test(hook) && /WhatsApp Paul/.test(hook), "hook leads with who AI recommends and has one next step");
const bl = renderBaselineReport({ ...base, questions: s.questions, rivals: s.rivals, asks: 3, engines: "ChatGPT and Gemini", answers: 18, namedYou: 0, directories: s.directories });
ok(/4 weeks|4-week/.test(bl) && /Not measured yet/.test(bl), "baseline keeps the slot for the 4-week comparison");
ok(/Get listed here first/.test(bl) && RULE_WORDS.every((r) => bl.includes(r.text)), "baseline report has the rule and the 'Get listed here first' list");
for (const [name, html] of [["opportunity", opp], ["hook", hook], ["baseline", bl]] as const) {
  ok(/name="viewport"/.test(html) && /noindex/.test(html), `${name}: phone viewport and noindex`);
  ok(!/\b(guarantee[sd]? (you|a|that)|will (rank|recommend)|ranking promised|#1)\b/i.test(text(html).replace(/We measure how often[^<]*|If that number[^<]*/g, "")), `${name}: no ranking or recommendation promise`);
}
// escaping
const evil = renderHookReport({ ...base, businessName: "A<script>x</script>", ...hookFromRows([{ question: "q", result: { chatgpt: cell(["<img src=x>"]) } }], ["q"]) });
ok(!/<script>x|<img src=x>/.test(evil), "business and firm names are escaped");
ok(shortName("London Domestic Maintenance Ltd") === "London Domestic Maintenance" && shortName("Ltd") === "Ltd", "shortName drops a trailing Ltd only");

// which design a stored audit gets
const pick = (o: Partial<Parameters<typeof chooseReportDesign>[0]>) => chooseReportDesign({ hookComplete: false, measuring: false, ...o });
ok(pick({ auditPurpose: "discovery" }) === "opportunity", "a Discovery audit gets the opportunity report");
ok(pick({ paidKind: "baseline" }) === "baseline" && pick({ paidKind: "remeasure" }) === null, "a paid baseline gets the baseline report; the day-28 re-measure keeps the classic page");
ok(pick({ hookComplete: true }) === "hook" && pick({ hookComplete: false }) === null, "a complete six-answer hook gets the hook report");
ok(pick({ auditPurpose: "discovery", measuring: true }) === null && pick({ hookComplete: true, nameNotJudgeable: true }) === null && pick({ auditPurpose: "discovery", classic: true }) === null, "measuring, name-unjudgeable and ?design=classic keep the classic page");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
