/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A PAID CLIENT WHOSE ENGAGEMENT ENDED (2026-10-03) — src/lib/serviceEnd.ts and its readers.
     1. the view per reason: client_ended_early → COMPLETED, nothing to do; dispute → ENDED; an unknown
        reason never reads COMPLETED; no end → null;
     2. the delivery stage: an ended client is stage 'ended', never "Needs attention", no next action, no
        missing list — and no delivery stage is marked done; refunded keeps its own words;
     3. the reasons are ONE list in two places (the TS list and the SQL CHECK);
     4. terminate_service validates the reason through the one rule, writes only the end columns (no money,
        no Next Action), and the setup loader reads the reason;
     5. the client page swaps the setup card, re-measure and monthly update for "nothing further to do".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { serviceEndView, SERVICE_END_REASONS, isServiceEndReason } from "../src/lib/serviceEnd.ts";
import { deliveryStage, matchesFilter, type StageInput } from "../src/lib/deliveryStage.ts";
import { handoffReadiness, type HandoffEvidence, type HandoffLead, type HandoffOnboarding } from "../src/lib/handoffReadiness.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

console.log("── 1. the view per reason ──");
{
  ok(serviceEndView({}) === null && serviceEndView({ service_termination_reason: "client_ended_early" }) === null, "no end date → not ended (a reason alone is nothing)");
  const done = serviceEndView({ service_terminated_at: "2026-10-03T09:00:00Z", service_termination_reason: "client_ended_early" });
  ok(done?.stateLabel === "COMPLETED" && /nothing further/i.test(done.next), "client ended early → COMPLETED, nothing further to do");
  ok(/kept/.test(done?.summary ?? "") && /no further payments/.test(done?.summary ?? ""), "…and says the payment is kept and nothing more is owed");
  const dispute = serviceEndView({ service_terminated_at: "2026-10-03T09:00:00Z", service_termination_reason: "domain_authority_dispute" });
  ok(dispute?.stateLabel === "ENDED", "a domain / authority dispute → ENDED");
  ok(serviceEndView({ service_terminated_at: "2026-10-03T09:00:00Z", service_termination_reason: "something_else" })?.stateLabel === "ENDED", "an unknown reason never reads COMPLETED (a claim)");
  ok(isServiceEndReason("client_ended_early") && !isServiceEndReason("refunded") && !isServiceEndReason(null), "the reason guard is a positive list");
}

console.log("\n── 2. the delivery stage ──");
{
  const lead: HandoffLead = { business_name: "ZZ QA Locks", phone: "07700900402", amount_paid: 99, status: "payment_received" };
  const ob: HandoffOnboarding = { services_list: ["Lock changes"], areas_list: ["Canterbury"], confirmed_location: "Canterbury", website_route: "build_new", gbp_status: "done" };
  const ev: HandoffEvidence = { crawl: true, crawlAgeDays: 3, hookAudit: true, salesHandoff: { applies: "required", complete: true, missing: 0 } };
  const at = "2026-10-03T09:00:00Z";
  const inp = (L: Record<string, unknown>): StageInput => ({
    readiness: handoffReadiness({ ...lead, ...L }, ob, ev), lead: { ...lead, ...L }, onboarding: { baseline_status: "complete" }, baselineAudit: { baseline_completed_at: "2026-09-20T10:00:00Z" },
    discovery: { generated: true, started: true, finished: true }, route: "build", today: "2026-10-03",
  });
  const live = deliveryStage(inp({ baseline_audit_id: "x", remeasure_due_date: "2026-10-20" }));
  ok(live.state !== "ended", "a live client is not ended");
  const s = deliveryStage(inp({ service_terminated_at: at, service_termination_reason: "client_ended_early", baseline_audit_id: "x", remeasure_due_date: "2026-10-20" }));
  ok(s.stage === "ended" && s.state === "ended" && s.stateLabel === "COMPLETED" && s.stageLabel === "Completed", "ended early → stage ended, COMPLETED");
  ok(s.next.action === false && s.missing.length === 0, "…no next action, no missing list");
  ok(!matchesFilter(s, "attention") && !matchesFilter(s, "in_delivery") && !matchesFilter(s, "ready") && matchesFilter(s, "all"), "…never in Needs attention / In delivery / Ready — only All");
  const d = deliveryStage(inp({ service_terminated_at: at, service_termination_reason: "domain_authority_dispute" }));
  ok(d.stateLabel === "ENDED" && /Service ended/.test(d.next.label), "a dispute still reads ENDED");
  const r = deliveryStage(inp({ status: "refunded" }));
  ok(r.state === "ended" && /Refunded/.test(r.next.label) && r.stateLabel === "ENDED", "refunded keeps its own words");
  const rd = handoffReadiness({ ...lead, service_terminated_at: at, service_termination_reason: "client_ended_early" }, ob, ev);
  ok(rd.items.find((i) => i.key === "service")?.detail.includes("ended early") === true, "the readiness line says why, not 'dispute'");
}

console.log("\n── 3. one list of reasons ──");
{
  const sql = read("supabase/migrations/20261006110000_service_end_client_ended_early.sql");
  const inList = sql.match(/service_termination_reason in \(([^)]*)\)/)?.[1].split(",").map((x) => x.trim().replace(/'/g, "")) ?? [];
  ok(JSON.stringify([...inList].sort()) === JSON.stringify([...SERVICE_END_REASONS].sort()), `the SQL CHECK and SERVICE_END_REASONS agree (${inList.join(", ")})`);
}

console.log("\n── 4. the write ──");
{
  const hub = read("supabase/functions/paid-client-hub/index.ts");
  const block = hub.slice(hub.indexOf('if (action === "terminate_service")'), hub.indexOf('if (action === "save_website_build")'));
  ok(/if \(!isServiceEndReason\(body\.reason\)\) return json\(\{ ok: false, error: "bad_reason" \}, 400\);/.test(block), "the reason is checked through the one rule");
  ok(/service_termination_reason: reason,/.test(block) && /\.is\("service_terminated_at", null\)/.test(block), "writes the chosen reason, once (never over an earlier end)");
  ok(!/amount_paid\s*:|payment_ledger|refund\(|next_action\s*:|stripe\.(subscriptions|refunds)/.test(block), "no money, ledger, refund, Stripe call or Next Action is written");
  ok(read("supabase/functions/_shared/client-setup.ts").includes("service_terminated_at,service_termination_reason,"), "the setup loader reads the reason (the list's stage words)");
}

console.log("\n── 5. the client page ──");
{
  const hubPage = read("src/pages/ClientHub.tsx");
  ok(/const ended = serviceEndView\(lead\);/.test(hubPage), "the page reads the one rule");
  ok(/\{ended\s*\? <EngagementEndedCard/.test(hubPage), "ended → the Completed card instead of the setup checklist");
  ok(/\{!ended && <div className="flex justify-end"><EndEngagementButton/.test(hubPage), "the control to record an early end shows only while live");
  ok(/ended \? <Stage k="remeasure"[^>]*summary="not scheduled"/.test(hubPage) && /const remeasureLine = ended \? 'not scheduled \(engagement ended\)'/.test(hubPage), "re-measure reads not scheduled (the stored date is untouched)");
  ok(/\{ended \? <p className="text-muted-foreground">No monthly updates: the engagement has ended\.<\/p> : <MonthlyUpdatePanel/.test(hubPage), "no monthly update is offered");
  ok(hubPage.includes("<AgreementStage lead={lead} ended={!!ended}/>") && hubPage.includes('{!ended && <><div className="flex flex-wrap items-center gap-2 pt-1">'), "an ended client is asked for no agreement: no route, no link, no send (a real acceptance still shows)");
  const btn = read("src/components/EngagementEnd.tsx");
  ok(/reason: 'client_ended_early'/.test(btn) && /note\.trim\(\)\.length < 10/.test(btn), "the control sends the general reason with a required note");
}

if (f) { console.log(`\n${f} failure(s)`); process.exit(1); }
console.log("\nall service-end checks passed");
