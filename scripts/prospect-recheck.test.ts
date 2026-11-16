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
import { leadNewestRechecks, parseVerdictCounts, recheckAiFacts, verdictCountsOf } from "../src/lib/auditVerdictCounts.ts";
import { oppAuditByLead } from "../src/lib/oppAuditInputs.ts";
import { opportunityScore } from "../src/lib/opportunityScore.ts";

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

console.log("\n── (1) the Opportunity score uses the re-check that replaced the hook ──");
{
  const BIZ = "Hartley Motors Ltd";
  const cellOf = (named: boolean, firms: string[]) => ({ named, self_named: named, competitors: firms, citations: [], answer_text: firms.join(", ") + ".", firms_read: true });
  const qsR = ["Who is the best mechanic in Wakefield?", "Can you recommend a mechanic for MOT in Ossett?", "Who is the best mechanic for clutch repair in Horbury?"];
  const queue = qsR.flatMap((q, i) => [0, 1, 2].map((k) => ({ question: q, status: "done", result: { chatgpt: cellOf(i === 0 && k !== 1, i === 0 && k !== 1 ? [BIZ, "Westgate Autos"] : ["Westgate Autos", "Calder Garage"]), gemini: cellOf(false, ["Kirkgate Motors", `Firm ${i}${k}`]) } })));
  const made = "2026-11-16T14:07:00Z";
  const counted = verdictCountsOf({ audit: { business_name: BIZ, business_type: "mechanic", location_text: "Wakefield", website: null, audit_purpose: "recheck", created_at: made }, queue, runMeta: [{ crawl: null, rules: null }, { crawl: null, rules: null }, { crawl: null, rules: null }], lead: null }, made);
  ok(!!counted && counted.searches === 3 && counted.answers === 18, "audit-watch's counter stores a re-check: 3 searches, 18 answers");
  ok(!!counted && counted.namedAnswers === 2, "…and the named answers over every answer (2 of 18)");
  ok(verdictCountsOf({ audit: { business_name: BIZ, business_type: "mechanic", location_text: "Wakefield", website: null, audit_purpose: "audit", created_at: made }, queue, runMeta: [], lead: null }, made) === null, "a hook still stores nothing");
  const parsed = parseVerdictCounts(JSON.parse(JSON.stringify(counted)));
  ok(!!parsed && parsed.namedAnswers === 2 && parsed.answers === 18, "the stored share reads back");
  ok(parseVerdictCounts({ ...counted, namedAnswers: 30, answers: 18 })?.answers === undefined, "a share with named > answers is dropped, never guessed");

  const audits = [
    { id: "hook", lead_id: "L", created_at: "2026-11-12T10:00:00Z", audit_purpose: "audit", is_market: false, ai_audit_runs: [{ id: "r1", status: "complete", run_number: 1, created_at: "2026-11-12T10:00:00Z", hook_score: null }] },
    { id: "re", lead_id: "L", created_at: made, audit_purpose: "recheck", verdict_counts: counted, is_market: false, baseline_target_runs: 3, ai_audit_runs: [] },
  ];
  const by = oppAuditByLead(audits as never);
  ok(by.get("L")?.recheck?.auditId === "re", "the newer re-check replaces the hook in the score's inputs");
  const later = [...audits, { id: "hook2", lead_id: "L", created_at: "2026-11-17T09:00:00Z", audit_purpose: "audit", is_market: false, ai_audit_runs: [{ id: "r2", status: "complete", run_number: 1, created_at: "2026-11-17T09:00:00Z", hook_score: null }] }];
  ok(!oppAuditByLead(later as never).get("L")?.recheck, "a hook run AFTER the re-check keeps the hook score");
  ok(oppAuditByLead([audits[1]] as never).get("L")?.recheck?.auditId === "re", "a re-check with no hook at all still scores");
  const facts = recheckAiFacts(leadNewestRechecks(audits as never).get("L")!);
  ok(facts.share?.named === 2 && facts.share?.total === 18 && !facts.updating, "AI facts: named 2 of 18");
  ok(recheckAiFacts({ auditId: "x", createdAt: made, counts: null }).updating === true, "no counts yet → 'still running', never a number");

  const site = { depth: "deep" as const, issueIds: [], siteScore: 50, siteState: "scored" };
  const lead = { website: "hartleymotors.co.uk", phone: "07700900123", country: "GB" };
  const viaRecheck = opportunityScore(lead, site, { score: null, updating: false, v3: facts.v3, recheckShare: facts.share });
  ok(viaRecheck.kind !== "incomplete" && viaRecheck.reasons.some((r) => /\(re-check\)/.test(r.text) && /2 of 18/.test(r.text)), "the score's reason says it came from the re-check (2 of 18)");
  const running = opportunityScore(lead, site, { score: null, updating: true, v3: null, recheckShare: null });
  ok(running.kind === "incomplete" && running.missing.includes("Re-check still running"), "a re-check still asking → Incomplete, 'Re-check still running' (never the replaced hook)");
  const aw = read("supabase/functions/audit-watch/index.ts");
  ok(/\.in\("audit_purpose", \["discovery", "recheck"\]\)/.test(aw), "audit-watch counts Discoveries and re-checks");
  ok(/a\.audit_purpose === "recheck" && runs\.length < targetRuns/.test(aw), "…and never counts a re-check from fewer runs than it asks (unless the chain stopped)");
  const mig = read("supabase/migrations/20261222090000_audit_watch_recheck_counts.sql");
  ok(/where a\.audit_purpose in \('discovery', 'recheck'\)/.test(mig), "the cron gate wakes audit-watch for a settled re-check");
}

console.log("\n── (2) admins can re-check any lead ──");
{
  const cc = read("supabase/functions/create-ai-audit/index.ts");
  ok(/if \(actor && actor\.role !== "admin"\) \{\n\s+const refused = salesAuditRefusal/.test(cc), "only a non-admin meets salesAuditRefusal / canWorkLead / the client refusal");
  ok(/if \(actor\?\.role !== "admin"\) \{\n\s+const day = new Date/.test(cc), "the per-lead daily re-check limit is for reps only");
  ok(/const guard = await guardAction\(service, actor\.id, action/.test(cc), "the person guard still applies to everyone");
  const sqlWork = read("supabase/migrations/20260927100100_multi_user_sales.sql");
  ok(/when 'admin' then exists \(select 1 from public\.outreach_leads where id = _lead_id\)/.test(sqlWork), "the detail-save functions let an admin work any lead (can_work_lead)");
}

console.log("\n── (3) the queue status line is a light read; the tick is unchanged ──");
{
  const q = read("supabase/functions/process-whatsapp-queue/index.ts");
  ok(/const lite = mode === "my_queue";/.test(q), "only mode my_queue is light");
  ok((q.match(/lite \? NO_COUNT : service/g) ?? []).length === 6, "the panel's six head counts are skipped for the line");
  ok(/lite \? Promise\.resolve\(null\) : \(async \(\) => \{/.test(q), "…and the audit-ready count");
  ok((q.match(/if \(!lite\) try \{/g) ?? []).length === 3, "…and the pause history, number health and test-held count");
  ok(/const myQueueEarly = lite \? \{ scan: myQueueScan\(\), lastSent: lastQueueSendsBySender\(service, dayStart\) \} : null;/.test(q), "the line's scan and last-sends start early, only for my_queue");
  ok(/await \(myQueueEarly\?\.scan \?\? myQueueScan\(\)\)/.test(q) && (q.match(/\.order\("queued_at", \{ ascending: true \}\)\.limit\(QUEUE_SCAN\)/g) ?? []).length === 1, "…the same scan query, written once");
  const sql = read("src/components/SenderQueueLines.tsx");
  ok(/placeholderData: \(\) => readCached\(userId\)/.test(sql) && /Last seen — updating…/.test(sql), "the app shows the last line at once, marked as updating");
  ok(/catch \{ return undefined; \}/.test(sql), "…and works when browser storage is blocked");
  ok(/"x-queue-timing": `auth=\$\{authMs\};my_queue=\$\{Date\.now\(\) - tStatus\}`/.test(q), "the line reports its own timing");
  ok(!/lite/.test(q.slice(q.indexOf('if (mode === "my_queue") {'))), "nothing after the line's answer (the tick, sends) reads the flag");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
