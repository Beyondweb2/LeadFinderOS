/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CALL WORKSPACE, SIMPLIFIED (2026-10-06, Paul). The lead popup's Call tab ended in three permanent
   cards (Status, Log a contact, Next Action) and a big green Mark Paid under every tab. Now: status and
   the Next Action at the TOP, one Log button → a small "what happened?" window → only the next step that
   outcome needs, and Mark paid a small admin action on the Close tab. Nothing new underneath: the same
   outcomes, the same rule (leadState / leadOutcome), the same writes.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  DEFAULT_LOG_CHANNEL, INTERESTED_NEXT_CHOICES, LOG_CHOICES, allowedOutcomes, choicesFor, followStepOf, interestedPreset, moreOutcomesFor, retryPreset,
} from "../src/lib/logOutcomeFlow.ts";
import { CALL_OUTCOMES, SALES_SETTABLE_STATUSES } from "../src/lib/salesCrm.ts";
import { NO_ANSWER_RETRY_DAYS, VOICEMAIL_RETRY_DAYS, outcomePlan, outcomeRule } from "../src/lib/leadState.ts";
import { leadPermissions } from "../src/lib/access.ts";

let failures = 0;
const ok = (c: boolean, label: string) => { if (!c) failures++; console.log(`${c ? "PASS" : "FAIL"} ${label}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const dlg = read("src/components/LeadDetailDialog.tsx");
const flow = read("src/components/LeadCallFlow.tsx");
const crm = read("src/components/LeadCrmPanel.tsx");
const strip = read("src/components/LeadStateStrip.tsx");
const lib = read("src/lib/logOutcomeFlow.ts");
const header = dlg.slice(dlg.indexOf("{/* ── Header: name + glanceable pills"), dlg.indexOf("<Tabs value={tab}"));
const callTab = dlg.slice(dlg.indexOf('<TabsContent value="call"'), dlg.indexOf('<TabsContent value="details"'));
const closeTab = dlg.slice(dlg.indexOf('<TabsContent value="close"'), dlg.indexOf('<TabsContent value="history"'));
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // comments out

console.log("── 1. the top: status + next action, no scrolling ──");
ok(header.length > 500 && /<PipelineStatusSelect value=\{lead\.status\} stage=\{salesState\.view\}/.test(header) && /'data-testid': 'workspace-status'/.test(header), "the status is the coloured pill in the HEADER (above the tabs), and its menu is where it changes");
ok(/askReasonFor=\{\{ leadId: lead\.id, businessName: lead\.business_name \}\}/.test(header), "…choosing Not interested there still asks why");
ok(/<HeaderNextAction leadId=\{lead\.id\} onEdit=\{\(\) => setNextOpen\(true\)\} \/>/.test(header) && /\{status\}\s*\{next\}/.test(strip), "the Next Action sits beside the status, compact");
ok(/No next action/.test(flow) && /· Set one/.test(flow) && /v\.label\}\{v\.when \? ` · \$\{v\.when\}` : ' · No date set'\}\{v\.time \? ` · \$\{v\.time\}` : ''\}/.test(flow), "…'Call · Tomorrow · 10:30', or 'No next action · Set one'");
ok(/data-testid="workspace-facts"/.test(header) && /lead\.phone/.test(header) && /isAggregatorUrl\(lead\.website\)/.test(header) && /\[trade, town\]/.test(header), "the header carries phone · website · trade · town");
ok(/<LostReasonLine leadId=\{lead\.id\}/.test(header), "a Not interested lead's reason sits by its status");

console.log("── 2. the old cards are gone ──");
for (const [what, needle] of [
  ["the Status card", 'data-testid="call-status"'], ["the Log a contact card", 'testId="log-contact"'], ["the permanent Next Action card", 'data-testid="next-action-section"'],
  ["the call-actions block", 'data-testid="call-actions"'], ["the footer Mark Paid", 'data-testid="mark-paid-main"'], ["the quiet footer Mark paid", 'data-testid="mark-paid-quiet"'],
] as const) ok(!(dlg + crm).includes(needle), `gone: ${what}`);
ok(!/function LogContact\(/.test(crm) && !/part="call"/.test(dlg) && !/statusControl/.test(dlg + crm), "no LogContact component, no Call part of the Work panel, no status card slot");
ok(!/<LeadWorkPanel/.test(callTab) && !/PipelineStatusSelect/.test(callTab), "the Call tab carries no CRM card and no second status control");
// 2026-10-06 (sales-team-today, Paul): SCAN → SAY — the AI result moved to the TOP of the Call tab (no longer folded at the bottom).
ok(callTab.indexOf("<LoggedLine") >= 0 && callTab.indexOf("<LoggedLine") < callTab.indexOf("ai-check-tools") && callTab.indexOf("ai-check-tools") < callTab.indexOf("<ColdCallPlaybookInline")
  && /<LeadHookPanel leadId=\{lead\.id\} variant="call" \/>/.test(callTab) && !/<details/.test(callTab), "Call order: the last result → the AI result (LeadHookPanel 'call', not folded) → the script (+ Log / Quick Close bar)");

console.log("── 3. the Log window ──");
ok(/const \[windows, setWindows\] = useState\(\(\) => arrivalWindows\(callArrivalOf\(openNumberPopup, openLogContact\)/.test(dlg) && /const logOpen = windows\.logOpen;/.test(dlg) && /const logThisCall = \(\) => setWindows\(afterLogCall\(\)\);/.test(dlg), "Log opens the window; Outreach's Call arrives on the number window, never on it (2026-10-07)");
ok(/onClick=\{logThisCall\}[^>]*data-testid="workspace-log"/.test(header) && /onLogCall=\{logThisCall\}/.test(callTab), "…from the header's Log and from the script's sticky bar");
const mount = dlg.slice(dlg.indexOf("<LeadCallFlow "), dlg.indexOf("/>", dlg.indexOf("<LeadCallFlow ")));
ok(mount.length > 0 && dlg.indexOf("<LeadCallFlow ") > dlg.indexOf("</Tabs>"), "the window is mounted once for the popup, outside the tabs (works from every tab, keeps its note)");
ok(/onSendOnboarding=\{\(\) => goTab\('close'\)\}/.test(mount), "Send onboarding → the Close tab");
ok(/const keepKeysHere = \(e: KeyboardEvent\) => \{ if \(e\.key === 'ArrowLeft' \|\| e\.key === 'ArrowRight'\) e\.stopPropagation\(\); \};/.test(flow) && (flow.match(/onKeyDown=\{keepKeysHere\}/g) ?? []).length === 2, "← / → inside the windows never step to another lead underneath");
ok(flow.includes("const finish = () => setLogOpen(false);") && flow.includes("if (!o) { setStep('pick');") && flow.includes("<Dialog open={logOpen} onOpenChange={setLogOpen}>"), "every way the window closes (X, Escape, Skip, Later, a saved step) resets it: the next Log starts on What happened?");
ok(!/Internal note|InternalNote|lead_add_note/.test(code(flow)), "no Internal note box in the Log window (Details keeps it)");
ok(/data-testid="log-add-note"/.test(flow) && /useUnsavedDraft\(`log-outcome-note-\$\{useId\(\)\}`, note\.trim\(\) !== ''\)/.test(flow), "a small optional Add note, saved with the outcome, guarded as an unsaved draft");
ok(/const \[note, setNote\] = useState\(''\);/.test(flow.slice(flow.indexOf("export function LeadCallFlow"), flow.indexOf("<Dialog open={logOpen}"))), "…its text lives outside the window, so closing the window does not lose it");

console.log("── 4. what happened: the buttons ──");
const callKeys = choicesFor("call").map((c) => c.key);
ok(JSON.stringify(callKeys) === JSON.stringify(["interested", "not_interested", "no_answer", "call_back", "send_onboarding", "wrong_number", "left_voicemail"]), `a call: ${callKeys.join(", ")}`);
const legal = new Set(CALL_OUTCOMES.map((o) => o.value));
ok(LOG_CHOICES.every((c) => legal.has(c.outcome) && outcomeRule(c.outcome).offered), "every button records an existing, offered lead_log_contact outcome (the server allowlist)");
const map = Object.fromEntries(LOG_CHOICES.map((c) => [c.key, c.outcome]));
ok(map.interested === "interested" && map.not_interested === "not_interested" && map.no_answer === "no_answer" && map.call_back === "call_back" && map.send_onboarding === "interested" && map.wrong_number === "wrong_number" && map.left_voicemail === "left_voicemail", "the mapping: Didn't answer = no_answer; Send onboarding records Interested");
ok(JSON.stringify(moreOutcomesFor("call")) === JSON.stringify(["spoke_to_owner", "meeting_booked"]), "More (call): Spoke to owner, Meeting booked — nothing lost, nothing in the way");
ok(!choicesFor("email").some((c) => ["no_answer", "wrong_number", "left_voicemail"].includes(c.key)) && moreOutcomesFor("email").includes("message_sent"), "another channel drops the call-only buttons and offers 'Sent, no reply yet'");
ok(JSON.stringify(allowedOutcomes("whatsapp")) === JSON.stringify(["interested", "meeting_booked", "call_back", "not_interested"]) && /!recordedBySend, recordedBySend \? null : note/.test(flow), "WhatsApp: what came of it, never a second record of the messages");
ok(DEFAULT_LOG_CHANNEL === "call" && /useState\(DEFAULT_LOG_CHANNEL\)/.test(flow) && /setChannel\(DEFAULT_LOG_CHANNEL\)/.test(flow) && /Logged as:/.test(flow) && /data-testid="log-channel-change"/.test(flow), "Logged as: Call by default, a quiet Change; back to Call each time the window closes");
ok(!choicesFor("call", { paid: true }).some((c) => c.key === "send_onboarding"), "a paying client is never offered Send onboarding");

console.log("── 5. outcome → the next step ──");
const L = { id: "l", status: "initial_contact", is_potential_work: false, next_action: null } as never;
ok(followStepOf("call_back", "call_back") === "call_back_when" && outcomePlan("call_back", L).setNextAction === "call" && /title = 'When should we call\?';/.test(flow), "Call back: the rule SAVES 'Call · No date set', then asks When should we call?");
ok(followStepOf("interested", "interested") === "interested_next" && outcomePlan("interested", L).star === true, "Interested: the ⭐, then What happens next?");
ok(JSON.stringify(INTERESTED_NEXT_CHOICES.map((c) => c.label)) === JSON.stringify(["Send onboarding", "Call back", "Set follow-up", "No next action"]), "…Send onboarding / Call back / Set follow-up / No next action");
ok(interestedPreset("call_back")?.nextAction === "call" && interestedPreset("follow_up")?.nextAction === "follow_up" && interestedPreset("none") === null && interestedPreset("send_onboarding") === null, "…Call back and Set follow-up pre-fill the one form (saved only by its Save); No next action writes nothing");
ok(/if \(k === 'send_onboarding'\) \{ setLogOpen\(false\); onSendOnboarding\(\); return; \}/.test(flow), "…Send onboarding there → the Close tab too");
ok(followStepOf("not_interested", "not_interested") === "none" && outcomePlan("not_interested", L).status === "not_interested", "Not interested: no next step forced (the rule clears it and the lost-reason prompt asks why)");
ok(/if \(outcome === 'not_interested' && res\.after\.state === 'not_interested' && !res\.failed\.length\) \{\s*askLostReason\(/.test(crm), "…the lost-reason prompt, as before");
const na = retryPreset("call", "no_answer");
ok(followStepOf("no_answer", "no_answer") === "retry_when" && na?.nextAction === "call" && na.days === NO_ANSWER_RETRY_DAYS && /later\('Skip'\)/.test(flow) && /'Try again when\?'/.test(flow), "Didn't answer: optional Try again when? — pre-filled tomorrow, Skip is fine");
ok(followStepOf("left_voicemail", "left_voicemail") === "retry_when" && retryPreset("call", "left_voicemail")?.days === VOICEMAIL_RETRY_DAYS, "Left voicemail: the same, three days");
ok(followStepOf("send_onboarding", "interested") === "quick_close" && /if \(next === 'quick_close'\) \{ setLogOpen\(false\); onSendOnboarding\(\); return; \}/.test(flow), "Send onboarding: logs Interested, then straight to Quick Close");
ok(followStepOf("wrong_number", "wrong_number") === "none" && outcomePlan("wrong_number", L).suppressNumber === true, "Wrong number: the number blocked, no next step");
ok(followStepOf("meeting_booked", "meeting_booked") === "meeting_when" && /data-testid="meeting-when"/.test(flow) && /work\.saveMeeting\(/.test(flow), "Meeting booked (More): asks when, through the one meeting write");
ok(/if \(next === 'none'\) \{ setLogOpen\(false\); return; \}/.test(flow), "an outcome with no next step simply closes the window");

console.log("── 6. Send onboarding is the approved sign-up, nothing else ──");
const sendCode = code(flow + lib);
ok(!/stripe|checkout|buy\.stripe|payment_link|paymentLink|create_onboarding_link|findable-checkout/i.test(sendCode), "the Log flow never makes or sends a payment / sign-up link itself");
ok(/<TabsContent value="close"[\s\S]*?<QuickClosePanel leadId=\{lead\.id\}/.test(closeTab), "the Close tab is QuickClosePanel — the client agreement, Ready to Sell and seller attribution stay on its server path");

console.log("── 7. the record and the rule, unchanged ──");
const lo = crm.slice(crm.indexOf("const logOutcome = async"), crm.indexOf("const afterWrite"));
ok((lo.match(/'lead_log_contact'/g) ?? []).length === 1 && /applyOutcome\(sl, outcome, before, logged\)/.test(lo), "each Log: one lead_log_contact (History + Last contact), then the one rule (applyOutcome)");
ok(/if \(!lead \|\| inFlight\.current\) return null;/.test(lo), "a double tap is one log (a ref, and the server's duplicate window)");
ok(!/lead_set_follow_up|saveNextAction/.test(lo), "the log itself never schedules a Next Action (only the rule's Call back / Meeting, or the person's Save)");
ok(/<LeadHistoryPanel leadId=\{lead\.id\} older=\{activities\} \/>/.test(dlg), "History still shows every contact");
ok(/data-testid="logged-line"/.test(flow) && /\{logged && <LoggedLine /.test(callTab) && /r\.failed\.length > 0 && <p className="text-destructive"/.test(flow), "the result (and any refusal) stays visible on the Call tab — never toast-only");

console.log("── 8. no deprecated status, no new status model ──");
const writes = code(flow + lib);
ok(!/lead_set_stage|onStatusChange|updateLeadStatus|status:\s*'interested'|'interested' as LeadStatus/.test(writes), "the Log flow writes no pipeline status itself (Interested is the ⭐ via the one rule)");
ok(outcomePlan("interested", L).status === null && !/plan\.status = 'interested'/.test(read("src/lib/leadState.ts")), "…and the rule never writes the old 'interested' status");
ok(SALES_SETTABLE_STATUSES.length === 4, "the status list is untouched (one model)");

console.log("── 9. owners, roles, money ──");
ok(/const src = leadSourceFor\(role\);/.test(crm) && /sb\.from\(src\.table\)\.select\(CRM_COLUMNS\)/.test(crm), "every read is the caller's own source (a salesperson reads sales_leads: only their leads)");
ok(!/\.from\([^)]*\)\.(update|insert|upsert|delete)\(/.test(flow + crm), "no direct table write anywhere in the flow — only ownership-checked server functions");
const sales = leadPermissions("sales"), admin = leadPermissions("admin");
ok(sales.clientDelivery === false && admin.clientDelivery === true, "Mark paid: admin yes, salesperson no");
ok(closeTab.includes("{perms.clientDelivery && !isPaidLead(lead) && (") && /onClick=\{handleMarkPaid\}/.test(closeTab) && (dlg.match(/onClick=\{handleMarkPaid\}/g) ?? []).length === 1, "Mark paid lives on the Close tab only — admin only, unpaid only");
const markPaid = dlg.slice(dlg.indexOf("const handleMarkPaid = async"), dlg.indexOf("return (", dlg.indexOf("const handleMarkPaid = async")));
ok(/await onStatusChange\(lead\.id, 'payment_received' as LeadStatus\);/.test(markPaid) && /is_potential_work: false/.test(markPaid), "…the same handler and writes as before (the page's own write path; attribution is the server's)");
ok(!/payment_received|amount_paid:|handleMarkPaid/.test(code(flow)), "the Log flow gives nobody a payment power");

console.log("── 10. the look: dark, coloured, compact ──");
ok(/const TONE: Record<LogTone, string>/.test(flow) && /h-12 items-center gap-2 rounded-xl/.test(flow) && /const ICON: Record<string/.test(flow), "big coloured outcome pills with icons (one colour per kind of outcome)");
ok(/max-h-\[90dvh\] w-\[calc\(100%-1\.5rem\)\] max-w-md/.test(flow), "the windows fit a 390 px phone (side gutter, scroll inside)");

if (failures) { console.log(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log("\nALL PASS");
