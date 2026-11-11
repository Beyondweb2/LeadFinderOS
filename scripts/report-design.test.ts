/* The report TEMPLATE (src/lib/reportOpportunity.ts + reportModel.ts + reportDesign.ts): ONE strict rule and ONE page
   for every business. Pins Paul's strict rule (2026-11-11), places (specific vs whole city / region / country,
   ambiguous places), service phrases and directories never being competitors, the AI score, the headline in customer
   words for any trade and country, the section order, the plain-English copy, and every edge case rendering cleanly. */
import {
  oppQuestion, summariseOpportunity, hookFromRows, directoriesInAnswer, isDirectoryName, ruleVerdict, placeScope, isWidePlace, areaOf, headOf,
  articleFor, searchPhrase, placeMixup, askPlace, isServicePhrase, buildVocab, scoreAnswers, type OppRow, type OppContext,
} from "../src/lib/reportOpportunity.ts";
import { buildReportModel, websiteSectionFromCheck, type ReportKind, type WebsiteSection } from "../src/lib/reportModel.ts";
import { chooseReportDesign, renderReport, shortName } from "../src/lib/reportDesign.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const cell = (firms: string[], named = false, urls: string[] = [], text = "") => ({ named, self_named: named, competitors: firms, citations: urls.map((url) => ({ url })), answer_text: text });
/** Three asks, two AI, from per-answer firm lists (6 answers). A `YOU` entry means that answer names the business. */
function rowsFor(q: string, perAnswer: string[][], urls: string[][] = []): OppRow[] {
  const out: OppRow[] = [];
  for (let run = 0; run < 3; run++) {
    const mk = (k: number) => { const idx = run * 2 + k; const names = perAnswer[idx] ?? []; return cell(names.filter((n) => n !== "YOU"), names.includes("YOU"), urls[idx] ?? []); };
    out.push({ question: q, result: { chatgpt: mk(0), gemini: mk(1) } });
  }
  return out;
}
const ctx: OppContext = { businessName: "Acme Heating Ltd", services: [{ name: "boiler servicing", dedicated: false }], siteText: "acme heating boiler servicing gas safety electrical maintenance", town: "London" };
const Q = "boiler servicing in Hackney";

/* ── THE STRICT RULE ── */
let q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["G"], ["G"], ["G"], ["G"]]), ctx);
ok(q.tier === "hard" && q.top === 6, "one firm in 6 of 6 answers is Hard to win");
q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["G"], ["G"], ["G"], ["A"]]), ctx);
ok(q.tier === "hard", "one firm in 5 of 6 answers is Hard to win");
q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["G"], ["G"], ["A"], ["B"]]), ctx);
ok(q.tier === "possible" && q.top === 4, "one firm in 4 of 6 answers is Possible with work");
q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["G"], ["A"], ["B"], ["C"]]), ctx);
ok(q.tier === "possible" && q.top === 3, "one firm in 3 of 6 answers is Possible with work (3+ is a leader)");
q = oppQuestion(Q, rowsFor(Q, [["G"], ["G"], ["A"], ["B"], ["C"], ["D"]]), ctx);
ok(q.tier === "now" && q.top === 2 && /6 answers named 5 firms, no one more than twice/.test(q.why), "6 of 6 name firms, none in 3+, offered, a specific place: You could win, with its proof line");
q = oppQuestion(Q, rowsFor(Q, [["A"], ["B"], ["C"], ["D"], [], []]), ctx);
ok(q.tier === "now", "exactly 4 of 6 answers naming a firm is enough");
q = oppQuestion(Q, rowsFor(Q, [["A"], ["B"], ["C"], [], [], []]), ctx);
ok(q.tier === "possible" && /Only 3 of 6/.test(q.why), "only 3 of 6 naming a firm is Possible with work, not You could win");
q = oppQuestion(Q, rowsFor(Q, [["A"], ["B"], [], [], [], []]), ctx);
ok(q.tier === "nofirms", "most answers naming no firm is \"AI doesn't name firms yet\", never winnable");
q = oppQuestion(Q, rowsFor(Q, [[], [], [], [], [], []]), ctx);
ok(q.tier === "nofirms" && /no firm in any of the 6/.test(q.why), "no firm in any answer is \"AI doesn't name firms yet\"");
q = oppQuestion("boiler servicing in London", rowsFor("boiler servicing in London", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), ctx);
ok(q.tier === "possible" && q.scope === "wide", "a whole-city search is Possible with work at most");
q = oppQuestion("boiler servicing in East London", rowsFor("boiler servicing in East London", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), ctx);
ok(q.tier === "possible" && q.scope === "wide", "a region search ('East London') is Possible with work at most");
q = oppQuestion("boiler servicing", rowsFor("boiler servicing", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), ctx);
ok(q.tier === "possible" && q.scope === "none", "a search with no place in it is Possible with work at most");
q = oppQuestion("leak detection in Bow", rowsFor("leak detection in Bow", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), ctx);
ok(q.tier === "possible" && /website/.test(q.why), "a service not on their website is Possible with work, never You could win");
q = oppQuestion("leak detection in Bow", rowsFor("leak detection in Bow", [["L"], ["L"], ["L"], ["L"], ["L"], []]), ctx);
ok(q.tier === "hard", "5 of 6 is Hard to win whatever the service");
q = oppQuestion(Q, rowsFor(Q, [["YOU", "A"], ["YOU", "B"], ["YOU"], ["C"], ["D"], ["E"]]), ctx);
ok(q.tier === "named" && /names you in 3 of 6/.test(q.why), "named in half or more of the answers: Keep and grow");
q = oppQuestion(Q, rowsFor(Q, [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), { ...ctx, areas: ["Camden"] });
ok(q.tier === "possible", "outside the areas the business works: Possible with work");
const r8 = [1, 2, 3, 4].flatMap((i) => [{ question: Q, result: { chatgpt: cell([`F${i}`]), gemini: cell([`G${i}`, "G1"]) } }]);
q = oppQuestion(Q, r8, ctx);
ok(q.answers === 8 && q.tier === "possible" && q.top === 4, "other answer counts scale by fraction (4 of 8 = half = a leader)");
ok(oppQuestion(Q, [], ctx).tier === "flagged", "no answers: left out (flagged), never counted");

/* ── PLACES ── */
ok(placeScope("plumber in Bow") === "specific" && placeScope("plumber in Tower Hamlets") === "specific" && placeScope("accountant in Wisbech?") === "specific", "a borough, a district or a small town is a specific place");
ok(placeScope("plumber in London") === "wide" && placeScope("plumber in East London") === "wide" && placeScope("accountant in Peterborough?") === "wide", "a whole city or a region is wide");
ok(placeScope("accountant in Dublin") === "wide" && placeScope("plumber in Sydney") === "wide" && placeScope("plumber in Ireland") === "wide" && placeScope("plumber in the UK") === "wide", "a Republic of Ireland / Australian city and whole countries are wide");
ok(placeScope("accountants for small businesses across Fenland?") === "wide" && placeScope("builder in North Yorkshire") === "wide" && placeScope("builder in Essex") === "wide", "'across X', a county or a direction + region is wide");
ok(placeScope("plumber in East Grinstead") === "specific" && placeScope("accountants in March Cambridgeshire?") === "specific", "a town that starts with a direction, or a town + county, is specific");
ok(placeScope("how much does an accountant cost?") === "none", "no place in the search: none");
ok(areaOf("Local accountant for a sole trader near Chatteris?") === "Chatteris" && areaOf("Recommended accountant in the Wisbech area?") === "Wisbech" && areaOf("Accountants in March for small businesses?") === "March", "the place is found wherever it sits in the sentence");
ok(isWidePlace("Greater Manchester") && !isWidePlace("Hackney"), "wide places are recognised");

/* ── AMBIGUOUS PLACES ── */
const mixNames = ["Avon Boiler Care Stratford-Upon-Avon", "N.G - Boiler Repair - Stratford-Upon-Avon", "Local Plumbing"];
ok(placeMixup("Stratford", mixNames, [], []), "Stratford: AI answering for Stratford-upon-Avon is flagged from the stored answers");
ok(!placeMixup("Tower Hamlets", ["Docklands Plumbing"], [], ["Call us on Sunday. Tower Hamlets on call 24/7."]), "no false flag when the place is just followed by ordinary words");
q = oppQuestion("plumber in Stratford", [{ question: "plumber in Stratford", result: { chatgpt: cell(mixNames), gemini: cell(["Stratford-Upon-Avon Plumbing"], false, ["https://stratforduponavonheating.co.uk"]) } }, { question: "plumber in Stratford", result: { chatgpt: cell(mixNames), gemini: cell([]) } }], ctx);
ok(q.tier === "flagged", "an ambiguous place is flagged and left out");
const sumFlag = summariseOpportunity([...rowsFor("plumber in Bow", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]), ...(q.tier === "flagged" ? [{ question: "plumber in Stratford", result: { chatgpt: cell(mixNames), gemini: cell(["Stratford-Upon-Avon Plumbing"], false, ["https://stratforduponavonheating.co.uk"]) } }, { question: "plumber in Stratford", result: { chatgpt: cell(mixNames), gemini: cell([]) } }] : [])], { ...ctx, siteText: undefined });
ok(sumFlag.flagged === 1 && sumFlag.answers === 6, "flagged searches are left out of every count");
ok(askPlace("Stratford", "East London") === "Stratford, East London" && askPlace("Bow", "East London") === "Bow" && askPlace("Stratford", "") === "Stratford", "from now on a clashing place is asked with its wider area");

/* ── SERVICE PHRASES AND DIRECTORIES ARE NEVER COMPETITORS ── */
const vocab = buildVocab(["landlord certificate in Hackney", "gas safety certificate in Bow"], [], ["London"]);
ok(isServicePhrase("Landlord Certificate London", vocab) && isServicePhrase("Gas Safety Certificates", vocab) && !isServicePhrase("Hackney Plumbers", vocab) && !isServicePhrase("Best Gas London Ltd", vocab), "service phrases are spotted; trade businesses and registered companies are kept");
q = oppQuestion("landlord certificate in Hackney", [{ question: "landlord certificate in Hackney", result: { chatgpt: cell(["Landlord Certificate London", "Checkatrade", "Real Sparks Ltd"], false, ["https://www.checkatrade.com/x"]), gemini: cell(["Landlord Certificates"]) } }], { ...ctx, siteText: undefined, vocab });
ok(q.firms.length === 1 && q.firms[0].name === "Real Sparks Ltd" && q.droppedPhrases.length === 2, "a service phrase and a directory are never counted as competitors");
ok(isDirectoryName("Checkatrade") && isDirectoryName("ICAEW") && !isDirectoryName("Real Sparks Ltd"), "directories are recognised for UK, Irish and Australian trades");
ok(directoriesInAnswer(cell([], false, ["https://www.icaew.com/find", "https://www.goldenpages.ie/x"], "See ACCA and Trustpilot")).sort().join() === ["ACCA", "Golden Pages", "ICAEW", "Trustpilot"].join(), "directories found by cited site and by name, any country");

/* ── THE HEADLINE IN CUSTOMER WORDS (any trade, any country) ── */
ok(headOf("Best accountants in Chatteris?") === "accountant" && headOf("emergency plumber in Bow") === "plumber" && headOf("EICR certificate for landlords in London") === "EICR certificate", "the head of a search is what the customer typed");
ok(headOf("How do I choose an accountant for my limited company?") === null && headOf("Best way to file self assessment?") === null, "informational searches have no head");
ok(articleFor("accountant") === "an" && articleFor("plumber") === "a" && articleFor("EICR certificate") === "an" && articleFor("PAT test") === "a", "a / an read right, acronyms by their spoken letter");
let sp = searchPhrase(["plumber in Bow", "plumber in Hackney", "emergency plumber in East London", "electrician in Bow", "electrician in East London", "EICR certificate in Hackney"], "London");
ok(sp.what === "a plumber or electrician" && sp.where === "East London", "headline words: the two most-searched services + the widest region, e.g. 'a plumber or electrician in East London'");
sp = searchPhrase(["Best accountants in Chatteris?", "Accountants in March for small businesses?", "How do I choose an accountant?"], "Wisbech");
ok(sp.what === "an accountant" && sp.where === "Wisbech", "another trade: 'an accountant in Wisbech', informational searches ignored");
sp = searchPhrase(["hairdresser in Rathmines", "barber in Rathmines"], "Dublin");
ok(sp.what === "a hairdresser or barber" && sp.where === "Dublin", "another country: Dublin");
ok(searchPhrase([], "").what === "a business like yours" && searchPhrase([], "").where === "your area", "nothing recognisable: a neutral phrase, never a trade label");

/* ── THE AI SCORE (from stored answers only) ── */
const scoreRows: OppRow[] = [
  ...rowsFor("accountant in Wisbech", [["YOU", "A"], ["A"], ["YOU"], [], ["B"], ["A"]]),
];
const sa = scoreAnswers(scoreRows, { ...ctx, siteText: undefined });
ok(sa.answers === 6 && sa.denominator === 5 && sa.named === 2 && sa.firms[0].name === "A" && sa.firms[0].count === 3, "score: answers that named any business (5 of 6), how many named you (2), the top competitor's answers (3)");
const zero = scoreAnswers(rowsFor("x in Bow", [["A"], ["A"], ["B"], [], ["C"], ["A"]]), { ...ctx, siteText: undefined });
ok(zero.named === 0 && zero.denominator === 5, "named 0 times: the score is 0 of the 5 answers that named a business");

/* ── WHOLE-PAGE CHECKS ── */
const issuesSite: WebsiteSection = { state: "issues", issues: [{ title: "No reviews or testimonials found", serious: true }, { title: "Long page titles", serious: false }] };
function model(rows: OppRow[], kind: ReportKind, o: { website?: WebsiteSection; town?: string; extra?: Partial<OppContext> } = {}) {
  const town = o.town ?? "London";
  return buildReportModel(rows, { ...ctx, town, siteText: undefined, ...(o.extra ?? {}) }, { kind, businessName: "Acme Heating Ltd", town, dateLabel: "11 Nov 2026", website: o.website ?? issuesSite, checkAgainLabel: "9 Dec 2026" });
}
const text = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/, "").replace(/ style="[^"]*"/g, "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const searches = ["plumber in Bow", "plumber in Hackney", "electrician in Bow", "electrician in Mile End", "boiler servicing in London"];
const leader = searches.flatMap((s) => rowsFor(s, [["A"], ["A"], ["A"], ["B"], ["C"], ["D"]])); // a firm in 3 of 6 answers on every search: none winnable
const banned = /\b(discovery|baseline|verdict|engines?|fragment(ed|ation)|citations?|visibility score|geo)\b/i;
const sections = ["Your AI score", "AI recommends these instead", "Your website check", "Get listed on these sites", "What we'd do"];
for (const kind of ["opportunity", "hook", "baseline"] as ReportKind[]) {
  const html = renderReport(model(leader, kind));
  const t = text(html);
  const idx = [...sections, "Talk to Paul on WhatsApp"].map((m) => t.indexOf(m));
  ok(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), `${kind}: sections in the one agreed order, ending with the one button`);
  ok(!banned.test(t) && !/\bquestions?\b/i.test(t), `${kind}: plain English, "searches" not "questions", no jargon`);
  ok(/These are opportunities, not guarantees\./.test(t) && !/\b(guarantee[sd]? (you|a|that)|will (rank|recommend)|#1)\b/i.test(t), `${kind}: the not-guarantees line, no ranking or recommendation promise`);
  ok(/name="viewport"/.test(html) && /noindex/.test(html), `${kind}: phone viewport and noindex`);
  ok(!/site score|score of \d+ for your (web)?site/i.test(t), `${kind}: no website score number (team-only)`);
}
const mOpp = model(leader, "opportunity");
ok(mOpp.score.value === 0 && /AI named you 0 times\./.test(text(renderReport(mOpp))), "score first: '0 / 100', 'AI named you 0 times.'");
ok(/When people ask AI for a plumber or electrician in London, it doesn't mention you yet\./.test(text(renderReport(mOpp))), "headline: customer words + place, 'it doesn't mention you yet'");
ok(mOpp.top !== null && new RegExp(`${mOpp.top.name}: ${mOpp.top.count}\\.`).test(text(renderReport(mOpp))), "the line names the top competitor and its count");

// edge: already named a lot (keep and grow)
const highRows = ["plumber in Bow", "plumber in Hackney", "electrician in Bow"].flatMap((s) => rowsFor(s, [["YOU", "A"], ["YOU", "B"], ["YOU"], ["YOU", "A"], ["B"], ["YOU"]]));
const mHigh = model(highRows, "opportunity");
const tHigh = text(renderReport(mHigh));
ok(mHigh.band === "high" && /Keep it up and grow it\./.test(tHigh) && /Where to keep and grow/.test(tHigh) && /AI also recommends/.test(tHigh) && !/doesn't mention you/.test(tHigh), "edge: already named a lot -> 'keep and grow' wording, never 'you're missing'");
// edge: no website
const tNoSite = text(renderReport(model(leader, "opportunity", { website: { state: "no_website", issues: [] } })));
ok(/You don't have a website AI can read yet\./.test(tNoSite) && /Build a website AI can read\./.test(tNoSite), "edge: no website -> the check says so and the pitch is 'a site AI can read'");
// edge: no website check yet; clean check
ok(/We haven't checked your website yet\./.test(text(renderReport(model(leader, "opportunity", { website: { state: "not_checked", issues: [] } })))), "edge: no website check yet -> a plain line, not an empty box");
ok(/We found nothing serious to fix\./.test(text(renderReport(model(leader, "opportunity", { website: { state: "clean", issues: [] } })))), "edge: a clean check says so");
const tIssues = text(renderReport(model(leader, "opportunity")));
ok(tIssues.indexOf("No reviews or testimonials found") < tIssues.indexOf("Long page titles") && /1 serious problem to fix first/.test(tIssues), "website check: stored issues in plain English, serious first");
ok(websiteSectionFromCheck({ state: "issues", serious: [{ title: "A" }], minor: [{ title: "B" }] }).issues[0].serious && websiteSectionFromCheck(null).state === "not_checked", "the stored check becomes the plain section");
// edge: nothing winnable -> lead with the closest, never an empty section
const tNone = text(renderReport(model(leader, "opportunity")));
ok(mOpp.counts.now === 0 && /The closest searches to win/.test(tNone) && mOpp.targets.length > 0, "edge: 0 could-win -> the closest targets lead, never an empty section");
// edge: a winnable one, count line from real counts, plural
const winRows = [...rowsFor("plumber in Bow", [["A"], ["A"], ["B"], ["C"], ["D"], ["E"]]), ...leader.filter((r) => r.question !== "plumber in Bow")];
const mWin = model(winRows, "opportunity");
ok(mWin.counts.now === 1 && /1 search you could win/.test(text(renderReport(mWin))) && /1 you could win · \d+ possible with work/.test(text(renderReport(mWin))), "a winnable search leads, with the count line built from the real counts");
// edge: few / no competitors, no directories, fewer than 10 searches
const lone = rowsFor("plumber in Bow", [[], [], [], [], [], []]);
const tLone = text(renderReport(model(lone, "opportunity")));
ok(/AI named no other business in these answers\./.test(tLone) && /No listing sites showed up in these answers yet\./.test(tLone) && /No score yet/.test(tLone), "edge: no competitors, no listing sites, no answer naming a business -> plain lines and 'No score yet'");
ok(model(leader, "opportunity").targets.length === 5 && !/\b10\b/.test(text(renderReport(model(leader, "opportunity"))).replace(/100/g, "")), "edge: fewer than 10 searches -> lists what there is, no empty rows");
// any trade, any country
const ie = ["accountant in Rathmines", "accountant in Ranelagh", "accountant in Dublin"].flatMap((s) => rowsFor(s, [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]));
const tIe = text(renderReport(model(ie, "opportunity", { town: "Dublin", website: { state: "not_checked", issues: [] } })));
ok(/When people ask AI for an accountant in Dublin/.test(tIe) && !/\bUK\b/.test(tIe), "edge: another trade and country (Dublin accountant), nothing UK-specific");
// client report: the tracked searches and the date
const tBase = text(renderReport(model(leader, "baseline")));
ok(/Your 5 searches/.test(tBase) && /Check again on 9 Dec 2026 and show you\./.test(tBase), "client report: the tracked searches and the stored 'check again' date");
// hook: example searches
const mHook = buildReportModel(leader.slice(0, 3 * 1), { ...ctx, town: "London", siteText: undefined }, { kind: "hook", businessName: "Acme Heating Ltd", town: "London", dateLabel: "11 Nov 2026", website: issuesSite });
ok(/Example searches/.test(text(renderReport(mHook))) && mHook.examples.length === 1, "first-contact report: example searches in the same order of sections");
// flagged searches are named, not counted
ok(/left out: the place name is unclear/.test(text(renderReport({ ...mOpp, counts: { ...mOpp.counts, flagged: 2 } }))), "flagged searches are mentioned in plain words");
// escaping
const evil = renderReport({ ...mOpp, businessName: "A<script>x</script>", rivals: [{ name: "<img src=x>", count: 3 }], top: { name: "<img src=x>", count: 3 } });
ok(!/<script>x|<img src=x>/.test(evil), "business and firm names are escaped");
ok(shortName("London Domestic Maintenance Ltd") === "London Domestic Maintenance" && shortName("Ltd") === "Ltd", "shortName drops a trailing Ltd only");

/* ── The page plan's words and which design a stored audit gets ── */
ok(ruleVerdict(Q, rowsFor("x", [["A"], ["A"], ["A"], ["A"], ["A"], ["B"]]).map((r) => r.result as Record<string, unknown>), ctx).verdict === "locked", "page plan: Hard to win is 'locked'");
ok(ruleVerdict(Q, rowsFor("x", [["A"], ["A"], ["A"], ["B"], [], []]).map((r) => r.result as Record<string, unknown>), ctx).verdict === "contested", "page plan: Possible with work is 'contested'");
ok(ruleVerdict(Q, rowsFor("x", [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]]).map((r) => r.result as Record<string, unknown>), ctx).verdict === "open", "page plan: You could win is 'open'");
ok(ruleVerdict(Q, rowsFor("x", [["A"], [], [], [], [], []]).map((r) => r.result as Record<string, unknown>), ctx).verdict === "no_local_race", "page plan: \"AI doesn't name firms yet\" is the Q&A-page case, 'no_local_race'");
const pick = (o: Partial<Parameters<typeof chooseReportDesign>[0]>) => chooseReportDesign({ hookComplete: false, measuring: false, ...o });
ok(pick({ auditPurpose: "discovery" }) === "opportunity" && pick({ paidKind: "baseline" }) === "baseline" && pick({ paidKind: "remeasure" }) === null && pick({ hookComplete: true }) === "hook", "which report a stored audit gets");
ok(pick({ auditPurpose: "discovery", measuring: true }) === null && pick({ hookComplete: true, nameNotJudgeable: true }) === null && pick({ auditPurpose: "discovery", classic: true }) === null, "measuring, name-unjudgeable and ?design=classic keep the classic page");

// every number comes from the stored answers: the template never reads a stored summary or mention rate
import { readFileSync } from "node:fs";
for (const file of ["src/lib/reportOpportunity.ts", "src/lib/reportModel.ts", "src/lib/reportDesign.ts"]) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok(!/mention_rate|named_datapoints/.test(src), `${file}: no stored summary or mention rate is read`);
}

// unused import guard
void hookFromRows; void sa; void zero;

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
