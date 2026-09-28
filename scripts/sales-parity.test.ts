/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES PARITY PASS (2026-09-28): the audit popup, the reply-rule guards, the queue line, the working
   list, the Inbox thread lookup, the campaign filter and the claim tab's removal.

   ⛔ The failures this guards: a second audit engine or a second Inbox for Sales; a hook that can be
   started twice on one lead; editing that changes the method (not three, not one run); "Do nothing"
   that still audits; a clear "no" that arms an audit or a pitch; a paying client entering prospect
   automation; an auto-send on a reply to anything but an approved opener; a queued lead that promises
   to send while the admin has paused the queue; archived leads in the working list; a Sales thread
   that opens as an empty placeholder beside the real conversation.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { existsSync, readFileSync } from "node:fs";
import { reviewedHookQuestions } from "../src/lib/hookQuestionEdit.ts";
import { OUTREACH_HOOK_QUESTIONS } from "../src/lib/auditQuestionCounts.ts";
import { auditMapHasRunning, auditRowState } from "../src/lib/auditRowState.ts";
import { countsAsFirstReply, effectiveFirstReplyMode, firstReplyGuard, modeForReply, shouldArmFirstReplyAutomation } from "../src/lib/firstReplyAutomation.ts";
import { QUEUE_PAUSED_LINE, queuedLeadLine } from "../src/lib/queueLine.ts";
import { leadPermissions } from "../src/lib/access.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("── the audit popup is the one hook path, editable, exactly three ──");
{
  ok(OUTREACH_HOOK_QUESTIONS === 3, "a hook is three questions");
  const good = reviewedHookQuestions([" best plumber in Rugby UK ", "emergency plumber Rugby UK", "boiler repair Rugby UK"]);
  ok(good.ok && good.questions[0] === "best plumber in Rugby UK", "three distinct questions pass, trimmed");
  ok(!reviewedHookQuestions(["a question", "another", ""]).ok, "a blank is refused, not topped up by the server");
  ok(!reviewedHookQuestions(["Same question", "same question", "third one"]).ok, "a repeat (any case) is refused");
  ok(!reviewedHookQuestions(["one", "two"]).ok && !reviewedHookQuestions(["1a", "2b", "3c", "4d"]).ok, "not three is refused either way");
  ok(!reviewedHookQuestions(["x".repeat(201), "two q", "three q"]).ok, "an essay is refused");
  const dialog = strip(read("src/components/HookAuditDialog.tsx"));
  ok(/<LeadHookPanel key=\{lead\.id\} leadId=\{lead\.id\} autoPropose \/>/.test(dialog), "the popup renders the workspace's own LeadHookPanel — no second audit UI");
  ok(!/invokeEdge|create-ai-audit/.test(dialog), "the popup itself calls nothing");
  const panel = strip(read("src/components/LeadCrmPanel.tsx"));
  ok(/'create-ai-audit', \{ \.\.\.body, questions: reviewed\.questions \}/.test(panel), "Run sends the reviewed three through the same hook body");
  ok(/question_count: OUTREACH_HOOK_QUESTIONS,\s*\n\s*hook_audit: true, fresh_audit: true/.test(panel), "…which is still the 3-question hook (both engines, one run are the server's)");
  const table = strip(read("src/components/OutreachTable.tsx"));
  ok(/<HookAuditDialog lead=\{auditLead\}/.test(table) && !/navigate\(`\/ai-audit\?leadId=/.test(table), "every row opens the popup, both roles (the AI Audit page is the advanced link inside it)");
  ok(/refetchInterval: \(q\) => \(auditMapHasRunning\(q\.state\.data\) \? OUTREACH_AUDIT_MAP_POLL_MS : false\)/.test(table), "the row map re-reads only while a row is mid-audit");
}

console.log("\n── one reading of a row's audit state ──");
{
  const s = (status: string) => auditRowState({ auditId: "a", runId: "r", status });
  ok(s("complete") === "done" && s("capped") === "done", "complete/capped are done");
  ok(["pending", "queued", "running", "processing"].every((x) => s(x) === "running"), "processing and queued count as running (they used to offer Run again)");
  ok(s("failed") === "none" && s("cancelled") === "none" && auditRowState(undefined) === "none", "failed, cancelled and no audit offer Run");
  ok(auditMapHasRunning({ a: { auditId: "1", runId: "1", status: "processing" } }) && !auditMapHasRunning({ a: { auditId: "1", runId: "1", status: "complete" } }), "the poll switch follows the same reading");
}

console.log("\n── one hook in flight per lead (server) ──");
{
  const c = read("supabase/functions/create-ai-audit/index.ts");
  ok(/if \(isHookAudit && leadId && !isInternal\) \{/.test(c), "a person's hook checks for one already in flight (the reply chain is untouched)");
  ok(/\.in\("status", \["pending", "queued", "running", "processing"\]\)/.test(c) && /already_running: true, audit_id: running\.audit_id/.test(c), "…and answers with THAT audit, creating nothing");
  ok(c.indexOf("already_running: true") < c.indexOf('from("ai_audits").insert'), "the check runs before any audit row is written");
  ok(/if \(isClientLead\(workLead\)\) return json\(\{ ok: false, error: "lead_is_client" \}, 403\);/.test(c), "a salesperson cannot hook-audit a client through the API");
}

console.log("\n── the reply rule: one set of guards, both roles ──");
{
  const lead = { amount_paid: null, status: "report_sent" };
  const g = (body: string, over: Partial<Parameters<typeof firstReplyGuard>[0]> = {}) =>
    firstReplyGuard({ body, lead, suppressed: false, lastOutboundTemplate: "initial_contact", ...over });
  const armed = g("Yes please, send it over");
  ok(armed.kind === "arm" && armed.sendAllowed === true, "a human yes to the opener arms, and may auto-send");
  ok((g("Yes please", { lastOutboundTemplate: "initial_opener_v2" }) as { sendAllowed?: boolean }).sendAllowed === true, "initial_opener_v2 is an approved opener too");
  const chased = g("go on then", { lastOutboundTemplate: "contact_followup" });
  ok(chased.kind === "arm" && chased.sendAllowed === false, "a reply to a follow-up runs the audit but never auto-sends");
  ok((g("ok", { lastOutboundTemplate: null }) as { sendAllowed?: boolean }).sendAllowed === false, "an unknown last message is not an opener");
  for (const no of ["Not interested thanks", "no thanks", "STOP", "please remove me"]) ok(g(no).kind === "decline", `"${no}" is a decline — no audit, no pitch`);
  ok(g("Hi, I'm out of the office until Monday").kind === "skip", "an auto-responder arms nothing");
  ok(g("[image]").kind === "skip" && g("[reaction]").kind === "skip" && g("k").kind === "skip", "a media/reaction placeholder or a lone character arms nothing");
  ok(g("Yes please", { lead: { amount_paid: 99, status: "payment_received" } }).kind === "skip", "a paying client never enters prospect automation");
  ok(g("Yes please", { lead: { amount_paid: null, status: "refunded" } }).kind === "skip", "…nor a refunded one");
  ok(g("Yes please", { lead: null }).kind === "skip", "an unreadable lead arms nothing");
  ok(g("Yes please", { suppressed: true }).kind === "skip", "a suppressed contact arms nothing");
  ok(!countsAsFirstReply("[reaction]") && !countsAsFirstReply("Out of office") && countsAsFirstReply("yes"), "the first HUMAN reply is the one that counts");

  ok(effectiveFirstReplyMode(false, "audit_only") === "off", '"Do nothing" (toggle off) is off, whatever mode is remembered');
  ok(effectiveFirstReplyMode(null, "send") === "off" && effectiveFirstReplyMode(undefined, undefined) === "off", "an unreadable toggle is off");
  ok(effectiveFirstReplyMode(true, "audit_only") === "audit_only" && effectiveFirstReplyMode(true, "send") === "send", "the two working modes read through");
  ok(effectiveFirstReplyMode(true, "bogus") === "audit_only", "an unknown stored mode still resolves to the silent one");
  ok(!shouldArmFirstReplyAutomation({ mode: "off", masterEnabled: true, firstInbound: true, firstInboundReliable: true, archived: false }), "off arms nothing");
  ok(modeForReply("send", false) === "audit_only" && modeForReply("send", true) === "send" && modeForReply("audit_only", true) === "audit_only", "send mode sends only on a reply to an opener");

  const helper = strip(read("supabase/functions/_shared/first-reply-audit.ts"));
  ok(/if \(guard\.kind === "decline"\) \{[\s\S]*?suppress\(input\.service[\s\S]*?status: "flagged_decline"[\s\S]*?return \{ armed: false, reason: "decline_flagged" \}/.test(helper), "a decline is suppressed and flagged for a human, and returns before any intent is written");
  ok(!/assigned_to_user_id|sent_by_user_id|actor|my_role|.role/.test(helper), "nothing in the reply rule reads who owns the lead or who sent — Sales leads behave exactly like the admin's");
  const drain = strip(read("supabase/functions/process-whatsapp-queue/index.ts"));
  ok(/trigger_wa_message_id/.test(drain) && /\.\.\.\(\(trig \?\? \[\]\)/.test(drain), "the drain also re-checks the reply that armed the row for a decline");
}

console.log("\n── the queued line never promises a send the queue will not make ──");
{
  ok(queuedLeadLine({ paused: true, windowOpen: true, windowStartHour: 7 }).text === QUEUE_PAUSED_LINE, "paused outranks an open window");
  ok(QUEUE_PAUSED_LINE === "Queue paused by admin — not currently sending.", "Paul's wording");
  ok(/window is closed/.test(queuedLeadLine({ paused: false, windowOpen: false, windowStartHour: 7 }).text), "closed window says so");
  ok(queuedLeadLine(null).tone === "unknown" && queuedLeadLine(undefined).tone === "unknown", "unknown never claims it is sending");
  const q = read("supabase/functions/process-whatsapp-queue/index.ts");
  ok(/mode === "contact_check" \|\| mode === "suppress_lead" \|\| mode === "queue_state"/.test(q), "Sales may read queue_state (and still nothing else configurable)");
  const qs = q.slice(q.indexOf('if (mode === "queue_state") {'), q.indexOf('if (mode === "queue_state") {') + 900);
  ok(/select\("paused"\)/.test(qs) && !/\.update\(|\.insert\(/.test(qs), "queue_state reads the pause flag and writes nothing");
  const controls = strip(read("src/components/WhatsAppLeadControls.tsx"));
  ok(!/7am–9:30pm UK window \(max 40\/day\)/.test(controls) && /queuedLeadLine\(useQueueState\(queued\)(, lead\.phone)?\)/.test(controls), "the workspace's queued line reads the live state");
  const out = strip(read("src/pages/Outreach.tsx"));
  ok(/data-testid="queue-paused-banner"/.test(out) && /!perms\.queueControls && queuedMine > 0 && queueState\?\.paused/.test(out), "Sales sees a paused-queue banner when their leads are waiting");
}

console.log("\n── Outreach: the working list, the campaign filter, no claim tab ──");
{
  const out = strip(read("src/pages/Outreach.tsx"));
  ok(/<CampaignPicker mode="filter" value=\{campaignFilter\} onChange=\{changeCampaignFilter\} hideCreate=\{!perms\.campaigns\} \/>/.test(out), "the page-level campaign filter shows for both roles, pick-only for Sales");
  ok(!/perms\.campaigns && \(\s*<>\s*<span/.test(out), "…no longer hidden behind the admin's campaign permission");
  ok(!existsSync(new URL("../src/components/AvailableToClaim.tsx", import.meta.url)) && !/Available to claim|salesTab/.test(out), "no Available to claim tab");
  ok(!("claimPool" in leadPermissions("sales")), "no claim-pool permission");
  ok(/rpc\('claim_lead'/.test(read("src/hooks/useSalesCrm.ts")), "claim_lead stays for Find Leads' Claim lead");
}

console.log("\n── the Inbox finds the real thread for a salesperson ──");
{
  const inbox = strip(read("src/pages/Inbox.tsx"));
  ok(/conversations\.find\(\(c\) => c\.phone === norm && c\.leadId === lead\.id\)/.test(inbox), "startFromLead matches the thread by number + lead, not the viewer's key");
  ok(/if \(real\) \{ setActiveKey\(real\.key\); setSynthetic\(null\); \}/.test(inbox), "a just-started thread becomes the real one when its first message lands");
  const swm = read("supabase/functions/send-whatsapp-message/index.ts");
  ok(/\.update\(\{ contact_method: "whatsapp" \}\)\s*\n\s*\.eq\("id", resolvedLeadId\)\.is\("contact_method", null\)/.test(swm), "a live send tags an EMPTY contact method as WhatsApp (both roles), never overwriting one");
  // At least the build this pass shipped (2026-09-28a); later passes bump it again (2026-09-29a, abuse protection).
  ok(((swm.match(/^const BUILD_ID = "([0-9-]+[a-z])";/m) ?? [])[1] ?? "") >= "2026-09-28a", "the sender's build marker is bumped");
}

if (f) { console.error(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
