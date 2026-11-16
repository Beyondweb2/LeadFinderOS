/* The baseline's "You're already named on X searches" + the header place + the quarterly re-check (Paul, 2026-11-15).
 * Run: npx tsx scripts/baseline-already-named.test.ts */
import { readFileSync } from "node:fs";
import { alreadyNamedSearches, foldNamedRecheck, namedOn, namedRecheckDue, reportPlaceLabel, NAMED_RECHECK_DAYS } from "../src/lib/alreadyNamed.ts";
import { renderReport } from "../src/lib/reportDesign.ts";
import type { ReportModel } from "../src/lib/reportModel.ts";
import { auditKind, NAMED_RECHECK_AUDIT_PURPOSE } from "../src/lib/auditKind.ts";
import { budgetPoolForPurpose } from "../src/lib/auditBudget.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

console.log("── already named, from the Discovery ──");
const disc = [
  { question: "wedding content creator in Mayo", namedYou: 4, verdict: { rule: "visible", verdict: "winnable" } },
  { question: "wedding content creator Ireland", namedYou: 2, verdict: { rule: "visible", verdict: "winnable" } },
  { question: "wedding content creator in Clare", namedYou: 0, verdict: { rule: "open", verdict: "winnable" } },
  { question: "wedding content creator in Sligo", namedYou: 1, verdict: { rule: "visible", verdict: "winnable" } },
  { question: "wedding content creator in Belfast", namedYou: 1, tier: "flagged", verdict: null },
];
const list = alreadyNamedSearches(disc, ["Wedding content creator in Sligo?"]);
ok(list.length === 2 && list[0] === "wedding content creator in Mayo" && list[1] === "wedding content creator Ireland", `named ones, most-named first, a target left out: ${JSON.stringify(list)}`);
ok(!namedOn({ question: "x", namedYou: 3, tier: "flagged" }), "a flagged search never counts");
ok(namedOn({ question: "x", namedYou: 1 }) && !namedOn({ question: "x", namedYou: 0 }), "older rules: named in at least one answer");

console.log("\n── the header place (Moments said \"Clare\") ──");
ok(reportPlaceLabel({ town: null, address: null, scope: "national", country: "Ireland", fromSearches: "Clare" }) === "All of Ireland", "no town, nationwide -> All of Ireland, never the commonest search place");
ok(reportPlaceLabel({ town: "", address: "Co. Mayo", scope: "national", country: "Ireland" }) === "Co. Mayo · covers all of Ireland", "stored address + nationwide");
ok(reportPlaceLabel({ town: "London", scope: "local", country: "UK", fromSearches: "East London" }) === "East London", "the searches' region only when it is a fuller form of the town");
ok(reportPlaceLabel({ town: "Wisbech", scope: "local", country: "UK", fromSearches: "Clare" }) === "Wisbech", "a town wins over any search place");
ok(reportPlaceLabel({ town: "", address: "", scope: "local", country: "UK" }) === null, "nothing known -> no place");

console.log("\n── the quarterly re-check ──");
const d = "2026-11-15T07:00:00Z";
ok(!namedRecheckDue({ discoveryAt: d, now: Date.parse(d) + 10 * 86400000 }).due, "not due 10 days after the Discovery");
ok(namedRecheckDue({ discoveryAt: d, now: Date.parse(d) + NAMED_RECHECK_DAYS * 86400000 }).due, `due ${NAMED_RECHECK_DAYS} days after`);
ok(!namedRecheckDue({ discoveryAt: d, lastRecheckAt: "2027-02-20T00:00:00Z", now: Date.parse("2027-03-01T00:00:00Z") }).due, "counted from the last re-check");
const fold = foldNamedRecheck(["a", "b", "c"], new Map([["A", { named: 1, answered: 2 }], ["b", { named: 0, answered: 2 }], ["c", { named: 0, answered: 0 }]]));
ok(fold.kept.join() === "a" && fold.dropped.join() === "b" && fold.unknown.join() === "c", "kept / dropped / unanswered");
ok(auditKind({ audit_purpose: NAMED_RECHECK_AUDIT_PURPOSE } as never) === "weekly_check", "internal kind, never a baseline");
ok(budgetPoolForPurpose("named_recheck") === "client", "client budget pool, never the guarantee");

console.log("\n── the page ──");
const model = {
  kind: "baseline", businessName: "Moments Wedding Content", dateLabel: "15 Nov 2026", what: "a wedding content creator", where: "Clare", place: "Co. Mayo · covers all of Ireland",
  score: { value: 0, named: 0, denominator: 120, answers: 120 }, band: "none", top: null, rivals: [], website: { state: "not_checked", issues: [] },
  counts: { lots: 0, some: 0, little: 0, nofirms: 0, named: 0, flagged: 0, notoffered: 0, notonsite: 0, room: 20, searches: 20 },
  engines: { chatgpt: { named: 0, answers: 60 }, gemini: { named: 0, answers: 60 } }, overview: { asked: 20, shown: 20, named: 2 }, asks: 3,
  featured: null, all: [], targets: [], examples: [], directories: [], flagged: [], mainQuestions: [], readability: null,
  alreadyNamed: { dateLabel: "15 Nov 2026", searches: Array.from({ length: 13 }, (_, i) => `search ${i + 1}`) },
} as unknown as ReportModel;
const html = renderReport(model);
ok(html.includes("You're already named on 13 searches.</em> Here are 20 more we're going after."), "headline: already named 13, 20 more");
ok(html.includes("From your Discovery on 15 Nov 2026") && html.includes("not part of your guarantee"), "labelled from the Discovery, not the guarantee");
ok(!/doesn.t mention you yet/i.test(html), "never \"AI doesn't mention you yet\"");
ok(html.includes("on your 20 target searches"), "every headline number says what it covers");
ok(html.includes("Co. Mayo · covers all of Ireland") && !html.includes(">Clare<"), "header place from what is known");
const noAn = renderReport({ ...model, alreadyNamed: null });
ok(!noAn.includes("already named on") && !/doesn.t mention you yet/i.test(noAn) && noAn.includes("Your starting point on your 20 target searches"), "no Discovery: a plain starting point, still scoped");
ok(!/doesn.t mention you yet/i.test(renderReport({ ...model, kind: "opportunity" })), "the Discovery page never says it either");

console.log("\n── wiring ──");
const rr = read("supabase/functions/render-audit-report/index.ts");
ok(/designKind === "baseline" && rules >= 2/.test(rr) && rr.includes("alreadyNamedForBaseline("), "renderer: section only on rules-v2 (or v3) baselines (older paid baselines unchanged)");
ok(rr.includes("NAMED_RECHECK_AUDIT_PURPOSE].includes("), "renderer refuses the internal re-check");
const wv = read("supabase/functions/weekly-visibility/index.ts");
ok(wv.includes("purpose: NAMED_RECHECK_AUDIT_PURPOSE") && !/NAMED_RECHECK_AUDIT_PURPOSE, userId: [^}]*leadId/.test(wv), "re-check carries no lead (can never arm a WhatsApp pitch)");
ok(wv.includes('if (mode === "all_stop")') && wv.includes("weeklyAffordable(an.searches.length, spent)") && wv.includes("MAX_NAMED_STARTS"), "re-check obeys the stop, the caps and a per-run limit");

console.log(f ? `\n${f} FAILED` : "\nall passed");
process.exit(f ? 1 : 0);
