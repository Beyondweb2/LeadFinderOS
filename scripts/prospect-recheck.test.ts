/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT RE-CHECK (Paul, 2026-11-16) — src/lib/prospectRecheck.ts and the places that must agree with it.
   A rep fixes a lead's trade / areas / services on a call, then re-checks: 3 searches (pre-filled, editable, never
   naming the business), each asked 3 times on ChatGPT and Gemini = 18 answers, on the live audit rules. Its own audit
   (purpose 'recheck'), prospecting budget, report labelled "Re-check: 3 searches, asked 3 times each". Old audits are
   kept and read "Replaced: details were wrong". Nothing deleted.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  checkRecheckQuestions, isRecheckPurpose, questionNamesBusiness, recheckDraftQuestions, recheckEstimateUsd, recheckExpectedAnswers,
  recheckLabel, recheckSkipReason, replacedAuditIds, RECHECK_AUDIT_PURPOSE, RECHECK_QUESTIONS, RECHECK_REPLACED_LABEL, RECHECK_RUNS,
} from "../src/lib/prospectRecheck.ts";
import { budgetPoolForPurpose } from "../src/lib/auditBudget.ts";
import { chooseReportDesign, renderReport } from "../src/lib/reportDesign.ts";
import { renderLeadfinderReport } from "../src/lib/leadfinderReport.ts";
import { exampleModel } from "../src/lib/leadfinderExample.ts";
import { isOutreachAudit } from "../src/lib/auditScore.ts";
import { auditKind, seoScanAllowed } from "../src/lib/auditKind.ts";
import { auditTypeOf } from "../src/lib/auditListSummary.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("── the numbers and the label ──");
ok(RECHECK_QUESTIONS === 3 && RECHECK_RUNS === 3, "3 searches, 3 asks each");
ok(recheckExpectedAnswers() === 18, "3 × 3 × ChatGPT + Gemini = 18 answers");
ok(recheckLabel() === "Re-check: 3 searches, asked 3 times each", "the label Paul asked for, word for word");
ok(recheckLabel(1, 1) === "Re-check: 1 search, asked 1 time each", "singular forms");
ok(Math.abs(recheckEstimateUsd(0.01) - 0.09) < 1e-9, "estimate = per-question cost × 3 searches × 3 runs");
ok(RECHECK_REPLACED_LABEL === "Replaced: details were wrong", "the old audit's label, word for word");

console.log("\n── the pre-filled searches come from the details as they are NOW ──");
const qs = recheckDraftQuestions({ trade: "Mechanic", town: "Wakefield", areas: ["Wakefield", "Ossett", "Horbury"], services: ["MOT", "clutch repair"] });
ok(qs.length === 3, "three searches");
ok(qs.every((q) => /mechanic/i.test(q) || /MOT|clutch/i.test(q)), "about the corrected trade / its services");
ok(!qs.some((q) => /engineer/i.test(q)), "nothing from the old trade");
ok(qs.some((q) => /Ossett/.test(q)), "an area served beyond the town is used");
ok(new Set(qs.map((q) => q.toLowerCase())).size === 3, "no two the same");
ok(recheckDraftQuestions({ trade: "", town: "Leeds", areas: [], services: [] }).length === 0, "no trade → nothing proposed (the panel asks for it)");
const bare = recheckDraftQuestions({ trade: "roofer", town: "Leeds", areas: [], services: [] });
ok(bare.length === 3 && new Set(bare.map((q) => q.toLowerCase())).size === 3, "trade + town only → still three different searches");
const one = recheckDraftQuestions({ trade: "electrician", town: "York", areas: [], services: ["EV charger installation"] });
ok(one.some((q) => /an electrician/.test(q)), "'an' before a vowel");
ok(qs.some((q) => /for MOT in/.test(q)), "an acronym service stays as typed (MOT, not mot)");

console.log("\n── a search that names the business is blocked ──");
const biz = { businessName: "Hartley Motors Ltd", trade: "mechanic", town: "Wakefield" };
ok(questionNamesBusiness("Is Hartley Motors any good in Wakefield?", biz.businessName, biz), "the name → blocked");
ok(questionNamesBusiness("reviews for hartley motors ltd", biz.businessName, biz), "any case, with Ltd → blocked");
ok(!questionNamesBusiness("Who is the best mechanic in Wakefield?", biz.businessName, biz), "a customer search → allowed");
ok(questionNamesBusiness("Best Wakefield Plumbers near me", "Wakefield Plumbers", { trade: "plumber", town: "Wakefield" }), "a trade-and-town name typed word for word → blocked");
ok(!questionNamesBusiness("best plumbers in Wakefield", "Wakefield Plumbers", { trade: "plumber", town: "Wakefield" }), "…but the ordinary customer search is not");
const blocked = checkRecheckQuestions(["Who is the best mechanic in Wakefield?", "Is Hartley Motors good?", "MOT in Ossett"], biz);
ok(!blocked.ok && "code" in blocked && blocked.code === "own_name" && blocked.index === 1, "checkRecheckQuestions names which search and why");
ok(checkRecheckQuestions(["a", "b"], biz).ok === false, "two searches → refused");
ok(checkRecheckQuestions(["a", "", "c"], biz).ok === false, "a blank → refused");
ok(checkRecheckQuestions(["MOT in Ossett", "mot in ossett", "c"], biz).ok === false, "a repeat → refused");
ok(checkRecheckQuestions(["x".repeat(201), "b", "c"], biz).ok === false, "too long → refused");
ok(checkRecheckQuestions(qs, biz).ok === true, "the proposed three pass");

console.log("\n── what the old audit is called: derived, never stored ──");
const audits = [
  { id: "hook1", created_at: "2026-11-10T10:00:00Z", audit_purpose: "audit", outreach: true },
  { id: "disc", created_at: "2026-11-11T10:00:00Z", audit_purpose: "discovery", outreach: false },
  { id: "re1", created_at: "2026-11-12T10:00:00Z", audit_purpose: "recheck", outreach: false },
  { id: "re2", created_at: "2026-11-16T10:00:00Z", audit_purpose: "recheck", outreach: false },
  { id: "hook2", created_at: "2026-11-17T10:00:00Z", audit_purpose: "audit", outreach: true },
];
const rep = replacedAuditIds(audits);
ok(rep.has("hook1") && rep.has("re1"), "earlier checks and earlier re-checks → replaced");
ok(!rep.has("disc"), "a Discovery is a different instrument → never replaced");
ok(!rep.has("re2") && !rep.has("hook2"), "the newest re-check, and a check made after it → not replaced");
ok(replacedAuditIds([{ id: "h", created_at: "2026-11-10T10:00:00Z", audit_purpose: "audit", outreach: true }]).size === 0, "no re-check → nothing replaced");

console.log("\n── the budget, the purpose, the report ──");
ok(budgetPoolForPurpose(RECHECK_AUDIT_PURPOSE) === "prospecting", "counts against the prospecting budget like other audits");
ok(!seoScanAllowed(RECHECK_AUDIT_PURPOSE), "buys no website scan");
ok(auditKind({ audit_purpose: "recheck", baseline_target_runs: 3 } as never) === "ordinary", "never graded a paid baseline or a measurement");
ok(!isOutreachAudit({ audit_purpose: "recheck", is_market: false } as never), "not the call card's hook (it has its own panel)");
ok(isOutreachAudit({ audit_purpose: "audit", is_market: false } as never), "…the hook is unchanged");
ok(isRecheckPurpose("recheck") && !isRecheckPurpose("named_recheck"), "the quarterly named re-check is a different thing");
ok(chooseReportDesign({ auditPurpose: "recheck", hookComplete: false, measuring: false }) === "opportunity", "report: judged per search (the v4 page)");
ok(chooseReportDesign({ auditPurpose: "recheck", hookComplete: false, measuring: true }) === null, "…'asking AI' while runs are still going");
ok(auditTypeOf({ audit_purpose: "recheck", runs: [] }).label === "Re-check", "Past audits badge says Re-check");
const m = { ...exampleModel(), recheckLabel: recheckLabel() };
ok(renderReport(m).includes("Re-check: 3 searches, asked 3 times each"), "the Findable page shows the label");
ok(renderLeadfinderReport(m).includes("Re-check: 3 searches, asked 3 times each"), "the LeadFinderOS page shows the label");
ok(!renderReport(exampleModel()).includes("Re-check:"), "…and only on a re-check");

console.log("\n── skip reasons a rep sees ──");
ok(/budget/i.test(recheckSkipReason("prospecting_budget_used") ?? ""), "daily prospecting budget used");
ok(recheckSkipReason("prospecting_budget_used", "Today's checking budget is used.") === "Today's checking budget is used.", "the server's own sentence wins");
ok(/monthly/i.test(recheckSkipReason("apify_reserve") ?? ""), "Apify 85% reserve → monthly limit");
ok(/budget/i.test(recheckSkipReason("daily_cap") ?? ""), "the queue's refusal at start → budget");
ok(recheckSkipReason("whatever") === null && recheckSkipReason(null) === null, "anything else is not a skip");

console.log("\n── create-ai-audit holds the rules (the server, not the screen) ──");
const cc = read("supabase/functions/create-ai-audit/index.ts");
ok(/const isRecheck: boolean = body\.purpose === RECHECK_AUDIT_PURPOSE;/.test(cc), "the purpose is explicit, never inferred");
ok(/: isRecheck \? RECHECK_RUNS/.test(cc), "3 runs (advanceBaseline repeats it like a Discovery)");
ok(/checkRecheckQuestions\(suppliedQuestions \?\? \[\]/.test(cc), "the own-name / three-search check runs on the server");
ok(/!isNamedRecheck && !isRecheck && !freshAudit/.test(cc), "never reuses (adds runs to) an old audit");
ok(/RECHECK_PER_LEAD_PER_DAY/.test(cc) && /recheck_limit_for_lead/.test(cc), "a per-lead daily limit");
ok(/isRecheck \? recheckEstimateUsd\(SOURCES\.ai_search\.estCostUsd/.test(cc), "the prospecting budget is asked with the re-check's full estimate");
ok(/isRecheck \? OUTREACH_AUDIT_EST_USD \* RECHECK_RUNS/.test(cc), "a rep's re-check meets the person guard with its estimate");
ok(!/\.delete\(\)/.test(cc), "create-ai-audit deletes nothing");
const rr = read("supabase/functions/render-audit-report/index.ts");
ok(/model\.recheckLabel = recheckLabel\(/.test(rr), "the report renderer sets the label");
ok(/isRecheckAudit \|\| new Set/.test(rr), "the LeadFinderOS page judges a re-check per search, not as a hook");
const panel = read("src/components/ProspectRecheckPanel.tsx");
ok(/lead_set_details/.test(panel) && /lead_set_profile/.test(panel), "details saved through the ownership-checked functions (who + when in History)");
ok(!/from\('outreach_leads'\)/.test(panel), "the panel never reads outreach_leads (a rep reads sales_leads)");
ok(/invokeEdge/.test(panel) && !/functions\.invoke/.test(panel), "the protected call goes through invokeEdge");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
