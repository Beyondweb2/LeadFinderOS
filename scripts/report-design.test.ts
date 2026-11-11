/* The redesigned client reports (src/lib/reportDesign.ts + reportOpportunity.ts): presentation over stored counts.
   Pins the tier rule, the "never a 0% headline / never a promise" copy rules, escaping and the phone viewport. */
import { oppQuestion, summariseOpportunity, hookFromRows, type OppRow } from "../src/lib/reportOpportunity.ts";
import { renderOpportunityReport, renderHookReport, renderBaselineReport, shortName } from "../src/lib/reportDesign.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const cell = (firms: string[], named = false, urls: string[] = []) => ({ named, self_named: named, competitors: firms, citations: urls.map((url) => ({ url })) });
/** Three asks, two engines, from per-answer firm lists. */
function rowsFor(q: string, perAnswer: string[][]): OppRow[] {
  const out: OppRow[] = [];
  for (let run = 0; run < 3; run++) out.push({ question: q, result: { chatgpt: cell(perAnswer[run * 2] ?? []), gemini: cell(perAnswer[run * 2 + 1] ?? []) } });
  return out;
}
const ctx = { businessName: "Acme Heating Ltd", services: [{ name: "boiler servicing", dedicated: false }], siteText: "acme heating boiler servicing gas safety electrical maintenance" };

// dominant: one firm in 6/6
let q = oppQuestion("boiler service in Bow", rowsFor("boiler service in Bow", [["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First", "X"]]), ctx);
ok(q.tier === "hard" && q.top === 6, "one firm in 6 of 6 answers is Hard");
// nobody named in most answers
q = oppQuestion("boiler servicing in London", rowsFor("boiler servicing in London", [[], [], [], ["A"], ["B"], []]), ctx);
ok(q.tier === "now" && q.empty === 4, "no business named in 4 of 6 answers is Winnable now");
// 'best' question is never Winnable now
q = oppQuestion("best boiler servicing in London", rowsFor("best boiler servicing in London", [[], [], [], [], [], []]), ctx);
ok(q.tier === "possible", "a 'best' question is capped at Possible");
// a service the website does not show
q = oppQuestion("leak detection in Bow", rowsFor("leak detection in Bow", [[], [], [], [], [], []]), ctx);
ok(q.tier === "hard" && /not a service/i.test(q.reasons[0]), "a service the site does not show is Hard and says why");

// whole-report copy rules over a small fixture
const rows = [
  ...rowsFor("boiler servicing in London", [[], [], [], ["A"], ["B"], []]),
  ...rowsFor("boiler service in Bow", [["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"], ["Gas First"]]),
  ...rowsFor("electrician in Bow", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]),
];
const s = summariseOpportunity(rows, ctx);
ok(s.now + s.possible + s.hard === 3 && s.answers === 18, "tiers add up to the questions asked");
const base = { businessName: "Acme Heating Ltd", trade: "heating", town: "London", dateLabel: "11 Nov 2026" };
const text = (h: string) => h.replace(/<style>[sS]*?</style>/, "");
const opp = renderOpportunityReport({ ...base, summary: s, engines: "ChatGPT and Gemini", asks: 3 });
ok(/<h1><em>\d+<\/em> questions Acme Heating could win/.test(opp), "opportunity headline leads with the winnable count, no company suffix");
ok(!/\b0%|\d+%/.test(opp), "no percentage headline in the opportunity report");
ok(/not a promise/i.test(opp), "opportunity report says winnable is not a promise");
const hook = renderHookReport({ ...base, ...hookFromRows(rows, ["electrician in Bow"]) });
ok(/AI recommends these businesses/.test(hook) && /WhatsApp Paul/.test(hook), "hook leads with who AI recommends and has one next step");
const bl = renderBaselineReport({ ...base, questions: s.questions, rivals: s.rivals, asks: 3, engines: "ChatGPT and Gemini", answers: 18, namedYou: 0 });
ok(/4 weeks|4-week/.test(bl) && /Not measured yet/.test(bl), "baseline keeps the slot for the 4-week comparison");
for (const [name, html] of [["opportunity", opp], ["hook", hook], ["baseline", bl]] as const) {
  ok(/name="viewport"/.test(html) && /noindex/.test(html), `${name}: phone viewport and noindex`);
  ok(!/\b(guarantee[sd]? (you|a|that)|will (rank|recommend|name)|ranking promised|#1)\b/i.test(text(html).replace(/We measure how often[^<]*|If that number[^<]*/g, "")), `${name}: no ranking or recommendation promise`);
}
// escaping
const evil = renderHookReport({ ...base, businessName: "A<script>x</script>", ...hookFromRows([{ question: "q", result: { chatgpt: cell(["<img src=x>"]) } }], ["q"]) });
ok(!/<script>x|<img src=x>/.test(evil), "business and firm names are escaped");
ok(shortName("London Domestic Maintenance Ltd") === "London Domestic Maintenance" && shortName("Ltd") === "Ltd", "shortName drops a trailing Ltd only");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
