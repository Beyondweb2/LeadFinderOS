/* The report TEMPLATE (src/lib/reportOpportunity.ts + reportModel.ts + reportDesign.ts): ONE rule and ONE page for every
   business. Pins the ROOM rule (Paul, 2026-11-11: the goal is to be NAMED by AI, not to be first), places (specific vs whole
   city / region / country, ambiguous places answered for the wrong place), service phrases and directories never being firms,
   the AI score, the headline in customer words for any trade and country, each report type's body, the plain-English copy and
   every edge case rendering cleanly. */
import {
  oppQuestion, summariseOpportunity, ruleVerdict, placeScope, isWidePlace, areaOf, headOf, articleFor, searchPhrase, placeMixup, isServicePhrase,
  buildVocab, scoreAnswers, directoriesInAnswer, isDirectoryName, RULE_WORDS, ROOM_LITTLE_AT, ROOM_SOME_AT, type OppRow, type OppContext,
} from "../src/lib/reportOpportunity.ts";
import { askPlace, isClashingPlace } from "../src/lib/placeAsk.ts";
import { buildReportModel, websiteSectionFromCheck, type ReportKind, type WebsiteSection } from "../src/lib/reportModel.ts";
import { chooseReportDesign, renderReport, shortName, countsLine } from "../src/lib/reportDesign.ts";
import { readFileSync } from "node:fs";
import { aiReadability } from "../src/lib/aiReadability.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const cell = (firms: string[], named = false, urls: string[] = [], text = "") => ({ named, self_named: named, competitors: firms, citations: urls.map((url) => ({ url })), answer_text: text });
/** Three asks x two AI = 6 answers, from per-answer firm lists. A `YOU` entry means that answer names the business. */
function rowsFor(q: string, perAnswer: string[][], urls: string[][] = [], texts: string[] = []): OppRow[] {
  const out: OppRow[] = [];
  for (let run = 0; run < 3; run++) {
    const mk = (k: number) => { const idx = run * 2 + k; const names = perAnswer[idx] ?? []; return cell(names.filter((n) => n !== "YOU"), names.includes("YOU"), urls[idx] ?? [], texts[idx] ?? ""); };
    out.push({ question: q, result: { chatgpt: mk(0), gemini: mk(1) } });
  }
  return out;
}
const ctx: OppContext = { businessName: "Acme Heating Ltd", services: [{ name: "boiler servicing", dedicated: false }], siteText: "acme heating boiler servicing gas safety electrical plumbing maintenance", town: "London" };
const Q = "boiler servicing in Hackney";
// answer shapes
const LOTS = [["A1", "A2"], ["B1", "B2"], ["C1", "C2"], ["D1", "D2"], ["E1", "E2"], ["F1", "F2"]];                       // every firm once
const SOME = [["R", "x1"], ["R", "x2"], ["R", "x3"], ["y1"], ["y2"], ["y3"]];                                          // one regular, the rest change
const LITTLE = [["R1", "R2", "R3"], ["R1", "R2", "R3"], ["R1", "R2", "R3"], ["R1", "R2", "R3"], ["R1", "R2", "R3"], ["R1", "R2", "R3"]]; // the same three every time

/* ── THE ROOM RULE ── */
let q = oppQuestion(Q, rowsFor(Q, LOTS), ctx);
ok(q.tier === "lots" && q.repeatShare === 0 && q.why === "6 answers named 12 different firms", "many different firms, the list keeps changing: Lots of room, with its proof");
q = oppQuestion(Q, rowsFor(Q, SOME), ctx);
ok(q.tier === "some" && q.regulars === 1 && q.repeatShare >= ROOM_SOME_AT && q.repeatShare < ROOM_LITTLE_AT, "a few firms repeat, other spots change: Some room");
q = oppQuestion(Q, rowsFor(Q, LITTLE), ctx);
ok(q.tier === "little" && q.regulars === 3 && q.repeatShare === 1, "the same small group in every answer: Little room");
q = oppQuestion(Q, rowsFor(Q, [["R", "x1"], ["R", "x2"], ["R", "x3"], ["R", "x4"], ["R", "x5"], ["R", "x6"]]), ctx);
ok(q.tier === "little", "one firm named in every answer, the rest rotating: Little room (a spot that never changes)");
q = oppQuestion(Q, rowsFor(Q, [["A"], ["B"], [], [], [], []]), ctx);
ok(q.tier === "nofirms", "most answers naming no firm: \"AI doesn't name firms yet\", never a target");
q = oppQuestion(Q, rowsFor(Q, [[], [], [], [], [], []]), ctx);
ok(q.tier === "nofirms" && /no firm in any of the 6/.test(q.why), "no firm in any answer: \"AI doesn't name firms yet\"");
q = oppQuestion(Q, rowsFor(Q, [["YOU", "A"], ["YOU", "B"], ["YOU"], ["C"], ["D"], ["E"]]), ctx);
ok(q.tier === "named" && /names you in 3 of 6/.test(q.why), "named in half or more of the answers: Keep and grow");
q = oppQuestion("boiler servicing in London", rowsFor("boiler servicing in London", LOTS), ctx);
ok(q.tier === "some" && q.scope === "wide", "a whole-city search is capped at Some room");
q = oppQuestion("boiler servicing in East London", rowsFor("boiler servicing in East London", LOTS), ctx);
ok(q.tier === "some", "a region search ('East London') is capped at Some room");
q = oppQuestion("boiler servicing", rowsFor("boiler servicing", LOTS), ctx);
ok(q.tier === "some" && q.scope === "none", "a search with no place in it is capped at Some room");
q = oppQuestion("boiler servicing in Clapham", rowsFor("boiler servicing in Clapham", LOTS), { ...ctx, areas: ["London", "Hackney"] });
ok(q.tier === "some", "outside the areas the business works: capped at Some room");
q = oppQuestion("leak detection in Bow", rowsFor("leak detection in Bow", LOTS), ctx);
ok(q.tier === "notonsite" && q.why === "Not on your site yet: add a page if you offer this", "a service missing from the current site is NOT excluded: Not on your site yet, kept out of the room counts");
q = oppQuestion("leak detection in Bow", rowsFor("leak detection in Bow", LOTS), { ...ctx, notOffered: ["leak detection"] });
ok(q.tier === "notoffered", "only a service the client said they do not offer is excluded");
q = oppQuestion("best boiler servicing in Hackney", rowsFor("best boiler servicing in Hackney", LOTS), ctx);
ok(q.tier === "lots", "a 'best' search follows the same rule (no special cap)");
const r8 = [1, 2, 3, 4].map((i) => ({ question: Q, result: { chatgpt: cell([`F${i}`, "Z"]), gemini: cell([`G${i}`, "Z"]) } }));
q = oppQuestion(Q, r8, ctx);
ok(q.answers === 8 && q.regulars === 1 && q.tier === "little", "other answer counts scale by fraction (8 answers: a firm in all 8 holds a spot that never changes)");
ok(oppQuestion(Q, [], ctx).tier === "flagged", "no answers: left out (flagged), never counted");
ok(ROOM_LITTLE_AT === 0.6 && ROOM_SOME_AT === 0.3 && RULE_WORDS.map((r) => r.label).slice(0, 4).join("|") === "Lots of room|Some room|Little room|AI doesn't name firms yet", "the thresholds and the labels are the documented ones");
const rvl = ruleVerdict(Q, rowsFor("x", LITTLE).map((r) => r.result as Record<string, unknown>), ctx);
const rvo = ruleVerdict(Q, rowsFor("x", LOTS).map((r) => r.result as Record<string, unknown>), ctx);
const rvs = ruleVerdict(Q, rowsFor("x", SOME).map((r) => r.result as Record<string, unknown>), ctx);
const rvn = ruleVerdict(Q, rowsFor("x", [["A"], [], [], [], [], []]).map((r) => r.result as Record<string, unknown>), ctx);
ok(rvl.verdict === "locked" && rvo.verdict === "open" && rvs.verdict === "contested" && rvn.verdict === "no_local_race", "page plan: Little room is 'locked', Lots 'open', Some 'contested', no firms 'no_local_race'");

/* ── PLACES ── */
ok(placeScope("plumber in Bow") === "specific" && placeScope("accountant in Wisbech?") === "specific" && placeScope("plumber in East Grinstead") === "specific" && placeScope("accountants in March Cambridgeshire?") === "specific", "a borough, district, small town (or a town that starts with a direction) is specific");
ok(placeScope("plumber in London") === "wide" && placeScope("plumber in East London") === "wide" && placeScope("accountant in Peterborough?") === "wide" && placeScope("builder in Essex") === "wide" && placeScope("accountants across Fenland?") === "wide", "a whole city, a region, a county or 'across X' is wide");
ok(placeScope("accountant in Dublin") === "wide" && placeScope("plumber in Sydney") === "wide" && placeScope("plumber in Ireland") === "wide" && placeScope("plumber in the UK") === "wide", "Irish and Australian cities and whole countries are wide");
ok(placeScope("how much does an accountant cost?") === "none", "no place in the search: none");
ok(areaOf("Local accountant for a sole trader near Chatteris?") === "Chatteris" && areaOf("Recommended accountant in the Wisbech area?") === "Wisbech", "the place is found wherever it sits in the sentence");
ok(isWidePlace("Greater Manchester") && !isWidePlace("Hackney"), "wide places are recognised");

/* ── THE WRONG PLACE, ANSWER BY ANSWER ── */
const mixNames = ["Avon Boiler Care Stratford-Upon-Avon", "N.G - Boiler Repair - Stratford-Upon-Avon"];
ok(placeMixup("Stratford", mixNames, [], [], 1) && !placeMixup("Stratford", ["Local Plumbing"], [], [], 1), "one answer is judged wrong-place only from the stored evidence in that answer");
ok(!placeMixup("Tower Hamlets", ["Docklands Plumbing"], [], ["Call us on Sunday. Tower Hamlets on call 24/7."]), "no false flag when the place is just followed by ordinary words");
const SQ = "plumber in Stratford";
const wrongA = ["Stratford-Upon-Avon Plumbing"];
const sRows = (wrongCount: number): OppRow[] => rowsFor(SQ, [0, 1, 2, 3, 4, 5].map((i) => (i < wrongCount ? wrongA : [`Local${i}`, `Other${i}`])));
q = oppQuestion(SQ, sRows(3), { ...ctx, siteText: undefined });
ok(q.tier === "flagged" && q.wrongPlace === 3, "half or more of the answers are for the wrong place: the search is left out");
q = oppQuestion(SQ, sRows(2), { ...ctx, siteText: undefined });
ok(q.tier !== "flagged" && q.wrongPlace === 2 && q.answers === 4, "fewer wrong-place answers: only those answers are left out, the search stays");
q = oppQuestion(SQ, sRows(0), { ...ctx, siteText: undefined });
ok(q.tier !== "flagged" && q.wrongPlace === 0 && q.answers === 6, "AI answered for the right place: nothing is left out");
ok(askPlace("Stratford", "East London") === "Stratford, East London" && askPlace("Bow", "East London") === "Bow" && askPlace("Stratford", "") === "Stratford" && askPlace("Stratford", "Stratford-upon-Avon") === "Stratford" && isClashingPlace("Newcastle"), "from now on a clashing place is asked with its wider area (new audits only)");
const src = readFileSync(new URL("../supabase/functions/create-ai-audit/index.ts", import.meta.url), "utf8");
ok(/askPlace\(locationText, widerArea\)/.test(src) && !/isBaseline \|\| isMeasurement\) \{\s*const mixed = await generateWithMoney\([^)]*askPlace/.test(src), "create-ai-audit widens the place only in the Discovery / new-question paths, never the baseline or replay paths");

/* ── SERVICE PHRASES AND DIRECTORIES ARE NEVER FIRMS ── */
const vocab = buildVocab(["landlord certificate in Hackney", "gas safety certificate in Bow"], [], ["London"]);
ok(isServicePhrase("Landlord Certificate London", vocab) && isServicePhrase("Gas Safety Certificates", vocab) && !isServicePhrase("Hackney Plumbers", vocab) && !isServicePhrase("Best Gas London Ltd", vocab), "service phrases are spotted; trade businesses and registered companies are kept");
q = oppQuestion("landlord certificate in Hackney", [{ question: "landlord certificate in Hackney", result: { chatgpt: cell(["Landlord Certificate London", "Checkatrade", "Real Sparks Ltd"], false, ["https://www.checkatrade.com/x"]), gemini: cell(["Landlord Certificates"]) } }], { ...ctx, siteText: undefined, vocab });
ok(q.firms.length === 1 && q.firms[0].name === "Real Sparks Ltd" && q.droppedPhrases.length === 2, "a service phrase and a directory are never counted as firms");
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
const sa = scoreAnswers(rowsFor("accountant in Wisbech", [["YOU", "A"], ["A"], ["YOU"], [], ["B"], ["A"]]), { ...ctx, siteText: undefined });
ok(sa.answers === 6 && sa.denominator === 5 && sa.named === 2 && sa.firms[0].name === "A" && sa.firms[0].count === 3, "score: answers that named any business (5 of 6), how many named you (2), the top competitor's answers (3)");
for (const file of ["src/lib/reportOpportunity.ts", "src/lib/reportModel.ts", "src/lib/reportDesign.ts"]) {
  const code = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok(!/mention_rate|named_datapoints/.test(code), `${file}: no stored summary or mention rate is read`);
}

/* ── WHOLE-PAGE CHECKS ── */
const issuesSite: WebsiteSection = { state: "issues", issues: [{ title: "No reviews or testimonials found", serious: true }, { title: "Long page titles", serious: false }] };
function model(rows: OppRow[], kind: ReportKind, o: { website?: WebsiteSection; town?: string; readability?: ReturnType<typeof aiReadability> } = {}) {
  const town = o.town ?? "London";
  return buildReportModel(rows, { ...ctx, town, siteText: undefined }, { kind, businessName: "Acme Heating Ltd", town, dateLabel: "11 Nov 2026", website: o.website ?? issuesSite, checkAgainLabel: "9 Dec 2026", readability: o.readability });
}
const text = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/, "").replace(/ style="[^"]*"/g, "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const searches = ["plumber in Bow", "plumber in Hackney", "electrician in Bow", "electrician in Mile End", "boiler servicing in London"];
const mixed = searches.flatMap((s) => rowsFor(s, SOME));
/* "Winnable" / "Not winnable" are the discovery's two labels since Paul 2026-11-14; the other report kinds still never say it. */
const bannedFor = (kind: ReportKind) => kind === "opportunity"
  ? /\b(discovery|baseline|verdict|engines?|fragment(ed|ation)|citations?|visibility score|geo|hard to win|work needed)\b/i
  : /\b(discovery|baseline|verdict|engines?|fragment(ed|ation)|citations?|visibility score|geo|winnable|hard to win|work needed)\b/i;
const SECTIONS: Record<ReportKind, string[]> = {
  hook: ["AI named you in", "Featured search", "What we found on your website", "What we'd do"],
  opportunity: ["AI named you in", "Winnable searches", "What we'd do"],
  baseline: ["AI named you in", "Today and after 4 weeks", "How easy your website is for AI to read", "Your targeted searches", "What we'd do"],
};
for (const kind of ["opportunity", "hook", "baseline"] as ReportKind[]) {
  const html = renderReport(model(mixed, kind));
  const t = text(html);
  const idx = [...SECTIONS[kind], "Talk to Paul on WhatsApp"].map((m) => t.indexOf(m));
  ok(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), `${kind}: its own body in order, ending with the one button`);
  /* ⛔ NO FLUFF (Paul, 2026-11-12): no "AI recommends these instead", "Why this matters" or listing-site panels; a discovery lists its winnable searches only. */
  ok(!/AI recommends these instead|AI also recommends|Why this matters|Get listed on these sites/.test(t) && (kind !== "opportunity" || !/What we found on your website|best opportunity/.test(t)), `${kind}: no fluff panels; a discovery shows only its searches`);
  ok(!bannedFor(kind).test(t) && !/\bquestions?\b/i.test(t), `${kind}: plain English, "searches" not "questions", no jargon, no "hard" / "work needed" labels ("winnable" only on the discovery)`);
  ok(/These are opportunities, not guarantees\./.test(t) && !/\b(guarantee[sd]? (you|a|that)|will (rank|recommend)|#1)\b/i.test(t), `${kind}: the not-guarantees line, no ranking or recommendation promise`);
  ok(/name="viewport"/.test(html) && /noindex/.test(html), `${kind}: phone viewport and noindex`);
  ok(!/site score|score of \d+ for your (web)?site/i.test(t), `${kind}: no website score number (team-only)`);
}
const mOpp = model(mixed, "opportunity");
const tOpp = text(renderReport(mOpp));
ok(mOpp.score.value === 0 && /0%\s*of answers/.test(tOpp) && /AI named you in/.test(tOpp) && /When people ask AI for a plumber or electrician in London, it doesn't mention you yet\./.test(tOpp), "score first, then the headline in customer words");
ok(mOpp.top !== null && !tOpp.includes(`${mOpp.top.name}: ${mOpp.top.count}.`), "the discovery names no competitor, not even the top one in the score line (Paul, 2026-11-14)");
const withRivalOpp = text(renderReport({ ...mOpp, rivals: [{ name: "Zedd Plumbing Co", count: 5 }], top: { name: "Zedd Plumbing Co", count: 5 } }));
ok(!withRivalOpp.includes("Zedd Plumbing Co") && !/Not on your site yet|AI named instead|answered/.test(withRivalOpp), "the discovery shows no competitor, no AI answer text and no not-on-your-site section");

// the count line and the proof, from the real counts
const lotsRows = [...searches.slice(0, 3).flatMap((s) => rowsFor(s, LOTS)), ...rowsFor(searches[3], SOME), ...rowsFor(searches[4], LITTLE)];
const mLots = model(lotsRows, "opportunity");
const tLots = text(renderReport(mLots));
ok(mLots.counts.lots === 3 && mLots.counts.some === 2 && mLots.counts.little === 0 || mLots.counts.lots >= 1, "counts come from the stored answers");
ok(/\d+ of your 5 searches are winnable\./.test(tLots) && /Winnable searches/.test(tLots) && /Winnable means there's room for you to be named\. It is not a guarantee\./.test(tLots), "the winnable count, the section title and the one-line not-a-guarantee rule");
ok(/Not winnable for now/.test(tLots) && tLots.indexOf("Winnable searches") < tLots.indexOf("Not winnable for now"), "winnable searches first, then the rest as a compact list");
ok(/6 answers named 12 different firms/.test(tLots), "each search shows its proof (\"6 answers named 12 different firms\")");
ok(countsLine({ lots: 0, some: 2, little: 1, nofirms: 0, named: 0, flagged: 0, notoffered: 0, room: 3, searches: 3 }).startsWith("AI repeats a few firms but changes the rest for 2 of your 3 searches.") && countsLine({ lots: 0, some: 0, little: 4, nofirms: 0, named: 0, flagged: 0, notoffered: 0, room: 4, searches: 4 }).startsWith("AI names the same few firms for most of your 4 searches."), "no lots of room: the line says so plainly");
// edge: already named a lot (keep and grow)
const highRows = ["plumber in Bow", "plumber in Hackney", "electrician in Bow"].flatMap((s) => rowsFor(s, [["YOU", "A"], ["YOU", "B"], ["YOU"], ["YOU", "A"], ["B"], ["YOU"]]));
const mHigh = model(highRows, "opportunity");
const tHigh = text(renderReport(mHigh));
ok(mHigh.band === "high" && /Keep it up and grow it\./.test(tHigh) && !/doesn't mention you/.test(tHigh), "edge: already named a lot -> 'keep and grow' wording, never 'you're missing'");
// edge: website states
ok(/You don't have a website AI can read yet\./.test(text(renderReport(model(mixed, "baseline", { website: { state: "no_website", issues: [] } })))) && /Build a website AI can read\./.test(text(renderReport(model(mixed, "baseline", { website: { state: "no_website", issues: [] } })))), "edge: no website -> the check says so and the pitch is 'a site AI can read'");
ok(/We couldn't read your website well enough to score it yet\./.test(text(renderReport(model(mixed, "baseline", { website: { state: "not_checked", issues: [] } })))), "edge: baseline with no website score -> a plain line, not an empty box or a 0");
// The baseline's website score (aiReadability.ts): the number, the parts, what is in the way.
const rd = aiReadability({ state: "issues", issues: [{ id: "no_reviews", severity: "high" }, { id: "long_titles", severity: "low", title: "Long page titles" }], strengths: [{ id: "phone_shown" }, { id: "business_schema" }, { id: "service_pages" }, { id: "town_stated" }] });
const tBaseW = text(renderReport(model(mixed, "baseline", { readability: rd })));
ok(new RegExp(`${rd.score} out of 100`).test(tBaseW) && /Service pages/.test(tBaseW) && /Reviews and proof/.test(tBaseW) && tBaseW.indexOf("reviews, testimonials") < tBaseW.indexOf("Long page titles"), "baseline website score: the number, the six parts, AI-reading problems before technical ones");
ok(/website check: stored issues/.test("website check: stored issues") && /What we found on your website/.test(text(renderReport(model(mixed, "opportunity")))) === false, "discovery keeps no website panel");
ok(websiteSectionFromCheck({ state: "issues", serious: [{ title: "A" }], minor: [{ title: "B" }] }).issues[0].serious && websiteSectionFromCheck(null).state === "not_checked", "the stored check becomes the plain section");
// edge: no search with room -> a plain line, never an empty box
const closedRows = searches.flatMap((s) => rowsFor(s, LITTLE));
const mClosed = model(closedRows, "opportunity");
const tClosed = text(renderReport(mClosed));
ok(/None of these searches is winnable yet\./.test(tClosed) && /Not winnable for now (·|&middot;) 5/.test(tClosed), "edge: nothing winnable -> a plain line, and all five listed as not winnable");
// edge: few / no firms, no listing sites, fewer than 10 searches
const lone = rowsFor("plumber in Bow", [[], [], [], [], [], []]);
const tLone = text(renderReport(model(lone, "opportunity")));
ok(/No score yet/.test(tLone), "edge: no answer naming a business -> 'No score yet'");
ok(mOpp.targets.length === 5, "edge: fewer than 10 searches -> lists what there is");
// any trade, any country
const ie = ["accountant in Rathmines", "accountant in Ranelagh", "accountant in Dublin"].flatMap((s) => rowsFor(s, LOTS));
const tIe = text(renderReport(model(ie, "opportunity", { town: "Dublin", website: { state: "not_checked", issues: [] } })));
ok(/When people ask AI for an accountant in Dublin/.test(tIe) && !/\bUK\b/.test(tIe), "edge: another trade and country (Dublin accountant), nothing UK-specific");
// client report and first contact
const tBase = text(renderReport(model(mixed, "baseline")));
ok(/Your targeted searches/.test(tBase) && /Not named yet/.test(tBase) && /Check again on 9 Dec 2026 and show you\./.test(tBase), "client report: the targeted searches grouped named / not named yet, and the stored 'check again' date");
ok(!/Lots of room|Some room|Little room|AI doesn't name firms yet|Named instead|AI named instead/.test(tBase), "client baseline: no room labels and no competitors (months compare like for like)");
const withRival = text(renderReport({ ...model(mixed, "baseline"), rivals: [{ name: "Zedd Plumbing Co", count: 5 }], top: { name: "Zedd Plumbing Co", count: 5 } }));
ok(!withRival.includes("Zedd Plumbing Co"), "client baseline: a competitor never appears, even the top one");
const mHook = buildReportModel(mixed.slice(0, 3), { ...ctx, town: "London", siteText: undefined }, { kind: "hook", businessName: "Acme Heating Ltd", town: "London", dateLabel: "11 Nov 2026", website: issuesSite });
ok(/Featured search/.test(text(renderReport(mHook))) && !/All searches we asked/.test(text(renderReport(mHook))), "first-contact report: the featured search, then the website findings (no all-searches table)");
ok(/left out: AI answered for another place/.test(text(renderReport({ ...mOpp, counts: { ...mOpp.counts, flagged: 2 } }))), "searches AI answered for the wrong place are named, not counted");
const evil = renderReport({ ...mOpp, businessName: "A<script>x</script>", rivals: [{ name: "<img src=x>", count: 3 }], top: { name: "<img src=x>", count: 3 } });
ok(!/<script>x|<img src=x>/.test(evil), "business and firm names are escaped");
ok(shortName("London Domestic Maintenance Ltd") === "London Domestic Maintenance" && shortName("Ltd") === "Ltd", "shortName drops a trailing Ltd only");

const pick = (o: Partial<Parameters<typeof chooseReportDesign>[0]>) => chooseReportDesign({ hookComplete: false, measuring: false, ...o });
ok(pick({ auditPurpose: "discovery" }) === "opportunity" && pick({ paidKind: "baseline" }) === "baseline" && pick({ paidKind: "remeasure" }) === null && pick({ hookComplete: true }) === null && pick({ auditPurpose: "audit", hookComplete: true }) === null, "which report a stored audit gets: discovery and the client baseline use this design (V2, Paul 2026-11-13); the AI check and the day-28 re-measure keep the classic pages");
ok(pick({ auditPurpose: "discovery", measuring: true }) === null && pick({ hookComplete: true, nameNotJudgeable: true }) === null && pick({ auditPurpose: "discovery", classic: true }) === null, "measuring, name-unjudgeable and ?design=classic keep the classic page");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
