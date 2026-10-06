/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LEAD WORKSPACE DECLUTTER PASS (2026-10-01, Paul: "too visually busy — do NOT remove useful
   functionality"). Record: docs/workspace-declutter.md. Pins:
     · each fact drawn once in the header — no "Meeting booked" pill above the same meeting in the
       Next Action bar; status, Next Action and contact kept apart (src/lib/workspaceHeader.ts);
     · the header bar DISPLAYS the Next Action, the Work tab's one form EDITS it;
     · Log a contact is collapsed by default, opens itself from Outreach's Call, closes after a log;
     · Mark Paid is the footer's main button only at a payment stage — and is still always there;
     · nothing was removed: every control the popup had is still mounted somewhere in it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { callBookedSummaryOf, headerStateShown, markPaidIsMain, meetingIsTheNextAction, noteBesideTime } from "../src/lib/workspaceHeader.ts";
import { salesStateOf, pillStatusOf, meetingWhen } from "../src/lib/leadState.ts";
import { nextActionView } from "../src/lib/nextActionView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/* The status pill's words for a status (PipelineStatusBadge's labels for the statuses used here). */
const LABEL: Record<string, string> = { not_contacted: "New", initial_contact: "Contacted", replied: "Replied", price_given: "Price Given", won_pending_onboarding: "Won · awaiting onboarding", not_interested: "Not Interested", payment_received: "Paid", in_delivery: "In Delivery" };
const NOW = Date.parse("2026-10-01T12:00:00Z");
const TODAY = "2026-10-01";
const TOMORROW_0830 = "2026-10-02T07:30:00Z"; // 08:30 London (BST)

type L = { status: string; is_potential_work?: boolean; amount_paid?: number | null; call_booked_at?: string | null; whatsapp_sent_at?: string | null; next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null; next_action_note?: string | null; lastLogged?: { outcome: string; at: string; reached?: boolean } | null };
/** What the header draws for one lead: the status pill's words, the extra state pill (or null), the bar. */
function header(l: L) {
  const view = salesStateOf({ ...l, wrongNumber: false }, NOW);
  const pill = pillStatusOf(l.status, view) ?? "";
  const statusLabel = LABEL[pill] ?? pill;
  const extra = headerStateShown(view, statusLabel, l) ? `${view.label}${view.detail ? ` · ${view.detail}` : ""}` : null;
  const bar = nextActionView(l, TODAY);
  return { statusLabel, extra, bar, view };
}

console.log("── the ten states Paul named: the header is never repetitive ──");
{
  const h1 = header({ status: "not_contacted" });
  ok(h1.statusLabel === "New" && h1.extra === null && h1.bar === null, "1 New: one pill (New), no extra pill, no next action");
  const h2 = header({ status: "not_contacted", lastLogged: { outcome: "spoke_to_owner", at: "2026-10-01T09:00:00Z" } });
  ok(h2.statusLabel === "Contacted" && h2.extra === null, "2 Contacted (reached by phone): one pill reads Contacted, nothing beside it");
  const h2b = header({ status: "not_contacted", lastLogged: { outcome: "no_answer", at: "2026-10-01T09:00:00Z" } });
  ok(h2b.statusLabel === "New" && h2b.extra === null, "…an attempt (no answer) is not contact: still New");
  const h3 = header({ status: "not_contacted", is_potential_work: true });
  ok(h3.view.state === "interested" && h3.statusLabel === "New" && h3.extra === null, "3 Interested + New: the star says Interested — no Interested pill");
  const h4 = header({ status: "initial_contact", is_potential_work: true });
  ok(h4.statusLabel === "Contacted" && h4.extra === null, "4 Interested + Contacted: Contacted pill + the star, nothing else");
  /* 2026-10-02 (next-action time): a Meeting with a time stores it in next_action_time, and the booking follows it. */
  const meeting = { status: "initial_contact", is_potential_work: true, call_booked_at: TOMORROW_0830, next_action: "meeting", next_action_date: "2026-10-02", next_action_time: "08:30", next_action_note: "Meeting at 08:30 · bring the audit" };
  const h5 = header(meeting);
  ok(h5.view.state === "meeting_booked" && h5.extra === null, "5 Meeting booked, and it IS the Next Action: NO Meeting booked pill");
  ok(!!h5.bar && h5.bar.label === "Meeting" && h5.bar.when === "Tomorrow" && h5.bar.time === "08:30", `…the bar carries it once: "${h5.bar?.label} · ${h5.bar?.when} · ${h5.bar?.time}"`);
  ok(noteBesideTime(h5.bar!.note, h5.bar!.time) === "bring the audit", "…and its note drops the time the bar already shows");
  const h5b = header({ ...meeting, next_action: "send_info", next_action_date: "2026-10-01", next_action_note: null });
  ok(h5b.extra === "Meeting booked · Fri 2 Oct 08:30" && h5b.bar?.label === "Send information", "5b a meeting that is NOT the Next Action keeps its pill (two different facts)");
  const h5c = header({ ...meeting, next_action: null, next_action_date: null, next_action_note: null });
  ok(h5c.extra !== null && h5c.bar === null, "5c a meeting with no Next Action keeps its pill");
  /* Found live 2026-10-02: a Meeting whose time was removed hid the booked 15:15 — the bar had no time and the
     header dropped the pill. Same day is not enough; the time must match too. */
  const h5e = header({ ...meeting, next_action_time: null });
  ok(h5e.extra !== null && /08:30/.test(h5e.extra) && h5e.bar?.time === null, `5e a Meeting with its time removed keeps the booked time visible ("${h5e.extra}")`);
  ok(!!header({ ...meeting, next_action_time: "09:00" }).extra, "5f a Meeting at a different time than the booking keeps the booking's pill");
  const h5d = header({ ...meeting, call_booked_at: "2026-10-09T07:30:00Z", next_action_date: "2026-10-09", next_action_time: "08:30" });
  ok(h5d.extra === null && h5d.bar?.when === "9 Oct" && h5d.bar?.time === "08:30", "5d a meeting on a later date, as the Next Action: still one display");
  const h6 = header({ status: "initial_contact", next_action: "call", next_action_date: "2026-10-02" });
  ok(h6.extra === null && h6.bar?.label === "Call" && h6.bar?.when === "Tomorrow" && h6.bar?.bucket === "upcoming", "6 Call tomorrow: the bar, nothing duplicated");
  const h6b = header({ status: "initial_contact", next_action: "send_follow_up", next_action_date: TODAY });
  ok(h6b.bar?.label === "WhatsApp follow-up" && h6b.bar?.bucket === "today", "6b WhatsApp follow-up today: amber bar");
  const h7 = header({ status: "replied", next_action: "call", next_action_date: "2026-09-28" });
  ok(h7.bar?.bucket === "overdue" && h7.bar?.when === "Overdue · 28 Sept" && h7.extra === null, "7 Overdue Next Action: red bar, Replied pill only");
  const h8 = header({ status: "initial_contact" });
  ok(h8.bar === null && h8.extra === null, "8 No Next Action: the bar says so (No next action · Set one)");
  const h9 = header({ status: "price_given", is_potential_work: true });
  ok(h9.extra === null && markPaidIsMain("price_given", h9.view), "9 Payment pending (price given): one pill, and Mark Paid is the main footer button");
  const h9b = header({ status: "won_pending_onboarding" });
  ok(h9b.view.state === "won" && h9b.extra === null && markPaidIsMain(h9b.view.state === "won" ? "won_pending_onboarding" : "", h9b.view), "9b Won · awaiting onboarding: the pill already says it; Mark Paid main");
  const h10 = header({ status: "in_delivery", amount_paid: 99 });
  ok(h10.extra === null && h10.view.state === "client", "10 Client in delivery: the status pill (In Delivery) already says client — no second pill");
  const h10c = header({ status: "payment_received", amount_paid: 99 });
  ok(h10c.extra === null && h10c.statusLabel === "Paid", "10c Paid: one pill");
  const h10b = header({ status: "replied", amount_paid: 99 });
  ok(h10b.statusLabel === "Replied" && h10b.extra === "Client", "10b paid while the pipeline still says Replied: Client shows");
  const no = header({ status: "initial_contact", lastLogged: { outcome: "not_interested", at: "2026-10-01T09:00:00Z" } });
  ok(no.extra === "Not interested", "a Not interested by phone while the pipeline says Contacted: the pill shows");
  const no2 = header({ status: "not_interested" });
  ok(no2.extra === null && no2.statusLabel === "Not Interested", "…but never twice when the status pill already says it");
}

console.log("\n── Mark Paid is contextual, never gone ──");
for (const s of ["not_contacted", "initial_contact", "replied", "report_sent", "site_sent", "no_whatsapp", ""]) {
  ok(!markPaidIsMain(s, null), `${s || "(blank)"}: small Mark paid, not the big green button`);
}
for (const s of ["price_given", "won_pending_onboarding", "payment_received", "in_delivery", "completed"]) ok(markPaidIsMain(s, null), `${s}: Mark Paid is the main button`);
ok(!meetingIsTheNextAction(null) && !meetingIsTheNextAction({ next_action: "meeting", next_action_date: "2026-10-02", call_booked_at: "not a date" }), "a missing or broken meeting time is never 'the same meeting'");
ok(noteBesideTime(null, "08:30") === null && noteBesideTime("Meeting at 08:30", "08:30") === null && noteBesideTime("ring after 5", null) === "ring after 5", "note beside time: blank, time-only and plain notes");

console.log("\n── the popup: one display, one editor, nothing removed ──");
{
  const dlg = read("src/components/LeadDetailDialog.tsx");
  const strip = read("src/components/LeadStateStrip.tsx");
  const pill = read("src/components/NextActionPill.tsx");
  const crm = read("src/components/LeadCrmPanel.tsx");
  const table = read("src/components/OutreachTable.tsx");
  ok(/headerStateShown\(salesState\.view, shown, salesState\.row\)/.test(dlg) && /const shown = pipelineStatusLabel\(pillStatusOf\(lead\.status, salesState\.view\)\);/.test(dlg) && /<SalesStatePill view=\{salesState\.view\} \/>/.test(dlg), "the extra state pill is drawn only through the one rule");
  ok(/<PipelineStatusSelect value=\{lead\.status\} stage=\{salesState\.view\}/.test(dlg) && !/<PipelineStatusBadge/.test(dlg), "the status is the SAME control as Outreach and the Inbox (pillStatusOf inside)");
  ok(!/<ContactMethodBadge/.test(dlg) && /Preferred channel/.test(dlg) && /onUpdateLead\(lead\.id, \{ contact_method: v \}/.test(dlg), "the channel is no longer a pill beside the status: a labelled Preferred channel, same write");
  /* 2026-10-06 (call workspace): the status and the Next Action are at the TOP; Log is a small window. */
  const flow = read("src/components/LeadCallFlow.tsx");
  ok(/\{status\}\s*\{next\}/.test(strip) && !/NextActionBar/.test(strip) && /<HeaderNextAction leadId=\{lead\.id\} onEdit=\{\(\) => setNextOpen\(true\)\} \/>/.test(dlg) && !/data-testid="next-action-section"/.test(crm + dlg), "ONE Next Action, at the top: a compact line beside the status; the old card at the bottom of Call is gone");
  const hna = flow.slice(flow.indexOf("export function HeaderNextAction"), flow.indexOf("export function LostReasonLine"));
  ok(!/onSave|lead_set_follow_up|saveNextAction|saveNext/.test(hna) && /No next action/.test(hna) && /· Set one/.test(hna), "…it never writes (a tap opens the editor), and with none it says No next action · Set one");
  ok((flow.match(/<NextActionForm /g) ?? []).length === 1 && /data-testid="next-action-window"/.test(flow) && /nextForm\(null, \(\) => onNextOpenChange\(false\)/.test(flow), "the header's tap opens the ONE editor in a small window");
  ok(/if \(r\.ok\) done\(\); return r;/.test(flow), "the editor closes after a successful Save only");
  ok(/const \[logOpen, setLogOpen\] = useState\(openLogContact\);/.test(dlg) && /const logThisCall = \(\) => setLogOpen\(true\);/.test(dlg) && /data-testid="workspace-log"/.test(dlg), "Log is a button (header + the script's bar) that opens the Log window; Outreach's Call arrives with it open");
  const tap = flow.slice(flow.indexOf("const tap = async"), flow.indexOf("const chooseInterestedNext"));
  ok(/if \(!done \|\| !done\.ok \|\| !done\.result\) return;/.test(tap) && tap.indexOf("setLogOpen(false)") > tap.indexOf("work.logOutcome("), "…it moves on only after the log succeeded (a refusal leaves the window open)");
  ok(/onLogged\(\{ key, outcome, result: done\.result \}\)/.test(tap) && /\{logged && <LoggedLine /.test(dlg), "…and the result line stays visible on the Call tab after the window closes");
  ok(/CONTACT_METHODS\.map/.test(flow) && /moreOutcomesFor\(channel\)/.test(flow) && /recorded automatically/.test(flow), "…with every channel (Change) and every offered outcome (More) still reachable");
  for (const gone of ['data-testid="call-status"', 'testId="log-contact"', 'data-testid="mark-paid-main"', 'data-testid="mark-paid-quiet"', 'data-testid="call-actions"']) ok(!(crm + dlg).includes(gone), `gone from the Call tab: ${gone}`);
  ok(/setDetailLogContact\(true\);\n\s*setDetailLead\(lead\);/.test(table) && /openLogContact=\{detailLogContact\}/.test(table) && /setDetailLogContact\(false\)/.test(table), "Outreach's Call opens the workspace with Log a contact expanded");
  ok(/data-testid="hook-not-run"/.test(crm) && /data-testid="hook-propose"/.test(crm) && /<HookVisibilityCard /.test(crm) && /data-testid="hook-history"/.test(crm), "the AI check: compact when not run; result, re-run and history unchanged");
  const closeTab = dlg.slice(dlg.indexOf('<TabsContent value="close"'), dlg.indexOf('<TabsContent value="history"'));
  ok(/markPaidIsMain\(lead\.status, salesState\.view\)/.test(closeTab) && (dlg.match(/onClick=\{handleMarkPaid\}/g) ?? []).length === 1 && /onClick=\{handleMarkPaid\}/.test(closeTab) && closeTab.includes("{perms.clientDelivery && !isPaidLead(lead) && (") && /data-testid="mark-paid-admin"/.test(closeTab), "Mark Paid (2026-10-06): a small admin action on the Close tab — admin only, unpaid only, same handler; stronger at a payment stage");
  ok(!/<QuickCloseButton/.test(dlg) && /<TabsTrigger value="close"/.test(dlg) && /QuickCloseNav\.Provider/.test(dlg), "v2: Quick Close is the Close tab (no second close window from the header); every Quick Close button in the workspace switches to it");
  /* Nothing removed: every tool the header had is still mounted. */
  for (const [what, re] of [
    ["Find email", /<FindEmailButton leadId=\{lead\.id\}/], ["Find socials", /<SocialLinks lead=\{lead\} withFind \/>/], ["Call script (the Call tab)", /<ColdCallPlaybookInline leadId=\{lead\.id\} initialScript="call"/], ["Call (tel)", /data-testid="workspace-call"/],
    ["Crawl site", /<LeadDetailCrawlButton lead=\{lead\} \/>/], ["Welcome pack", /<WelcomePackButton leadId=\{lead\.id\}/], ["Site check", /<LeadSiteCheckButton lead=\{lead\} \/>/],
    ["the star", /<StarToggle /], ["edit name", /setEditingName\(true\)/], ["WhatsApp link", /whatsAppLinkForLead\(lead\.id\)/], ["tabs", /<TabsTrigger value="client"/],
  ] as const) ok(re.test(dlg), `still there: ${what}`);
  ok(/data-testid="more-tools-toggle"/.test(dlg) && /\{moreTools && \(/.test(dlg) && !/DropdownMenu/.test(dlg), "the less frequent tools reveal IN PLACE on Details (not a menu), so their own dialogs stay mounted");
  for (const id of ["learned-agency", "lead-campaign", "domain-control"]) ok(crm.includes(`data-testid="${id}"`) || crm.includes(`testId="${id}"`), `Details keeps ${id}`);
  ok(flow.includes('data-testid="meeting-when"'), "the meeting's when-form is the Log window's follow-up step");
  ok(/<LeadOwnerControl leadId=\{leadId\} \/>/.test(strip) && /<LastContactLine/.test(strip) && /wrong-number-pill/.test(strip), "owner, last contact and Wrong number stay in the header");
}

console.log("\n── pass 3: the meeting time once — Call booked · website defers to the Next Action ──");
{
  const opts = { websiteControl: [{ value: "agency_controls", label: "An agency controls it" }, { value: "unknown", label: "Unknown" }], meetingWhen };
  const booked = { call_booked_at: TOMORROW_0830, website_control: "agency_controls" };
  const asNA = callBookedSummaryOf({ ...booked, next_action: "meeting", next_action_date: "2026-10-02", next_action_time: "08:30" }, NOW, opts);
  ok(asNA === "Booked · An agency controls it", `the meeting IS the Next Action: no time here ("${asNA}")`);
  const noNA = callBookedSummaryOf({ ...booked, next_action: null }, NOW, opts);
  ok(noNA === "Fri 2 Oct 08:30 · An agency controls it", `booked, no Next Action: the time stays ("${noNA}")`);
  const otherNA = callBookedSummaryOf({ ...booked, next_action: "call", next_action_date: "2026-10-01" }, NOW, opts);
  ok(otherNA.startsWith("Fri 2 Oct 08:30"), "booked, a different Next Action: the time stays");
  const otherTime = callBookedSummaryOf({ ...booked, next_action: "meeting", next_action_date: "2026-10-02", next_action_time: "10:00" }, NOW, opts);
  ok(otherTime.startsWith("Fri 2 Oct 08:30"), "a Meeting at a DIFFERENT time is not the same meeting: the booked time stays");
  ok(callBookedSummaryOf({ call_booked_at: null }, NOW, opts) === "Nothing recorded", "nothing booked, nothing known → Nothing recorded");
  ok(callBookedSummaryOf({ call_booked_at: null, domain_control: "made_up_value" }, NOW, opts) === "Nothing recorded", "an unknown stored domain value says nothing (never 'Domain: theirs')");
  ok(callBookedSummaryOf({ call_booked_at: "2026-09-20T09:00:00Z", next_action: null }, NOW, opts) === "Nothing recorded", "a past booking is not drawn (as before)");
  ok(/callBookedSummaryOf\(lead, Date\.now\(\)/.test(read("src/components/LeadCrmPanel.tsx")) && !/function callBookedSummary\(/.test(read("src/components/LeadCrmPanel.tsx")), "the Work tab draws the line through the one rule");
}

console.log("\n── pass 2: one folding pattern for the Work tab ──");
{
  const ws = read("src/components/WorkSection.tsx");
  const crm = read("src/components/LeadCrmPanel.tsx");
  const card = read("src/components/OnboardingLinkCard.tsx");
  const wa = read("src/components/WhatsAppLeadControls.tsx");
  ok(/hidden=\{!open\}/.test(ws) && /\{alert && <div/.test(ws) && /const expandable = children !== undefined/.test(ws), "WorkSection: the body stays mounted while folded (state survives), warnings show folded, no body → no toggle");
  for (const [what, src, id] of [["Campaign", crm, "lead-campaign"], ["Call booked", crm, "call-booked"], ["Sign-up link", card, "signup-link"], ["WhatsApp outreach", wa, "whatsapp-outreach"]] as const) {
    ok(src.includes(`<WorkSection `) && src.includes(`testId="${id}"`), `${what} uses the one WorkSection pattern`);
  }
  ok(!/<details/.test(crm), "no second folding pattern (<details>) left on the Work tab");
  ok(/summary=\{name\}/.test(crm) && /summary=\{callBookedSummary\(lead\)\}/.test(crm) && /summary=\{summary\}/.test(card) && /summary=\{summary\}/.test(wa), "every folded section says its state in its summary");
  ok(/alert=\{blocking \? warningLine : null\}/.test(card), "Sign-up link: a blocking gap (no trade) stays visible while folded");
  ok(/flex flex-wrap gap-1\.5" data-testid="onboarding-buttons"/.test(card) && /h-9 /.test(card), "Sign-up link: the buttons wrap (no 390 px overflow) with phone-sized touch targets");
  ok(/if \(paid\) \{\s*\n\s*return <WorkSection [^>]*summary="Not needed — they have signed up and paid" \/>/.test(card), "a paid client: one line, nothing to open (the status pill already says Paid)");
  ok(/lead\.status === 'whatsapp_failed' && !queued \?/.test(wa) && /queueLine\.tone === 'paused'/.test(wa), "WhatsApp: a failed send and a paused queue show while folded");
  ok(/\{queued && \(\s*\n\s*<p className=\{`mt-1\.5 text-center text-\[10px\]/.test(wa) && /Add to WhatsApp queue/.test(wa) && /<RequestTemplateButton/.test(wa) && /<TemplatePreviewButton/.test(wa), "…and every WhatsApp control is still inside");
}

console.log("\n── Test salesperson with 0 leads in Outreach: EXPECTED, not a bug (2026-10-01) ──");
{
  /* Every "ZZ QA" fixture was archived by the session that made it (an archived_set activity at the
     creation time), so a salesperson whose only leads are those fixtures has an EMPTY active list. Proved
     live: one fixture un-archived for a minute showed in the Test salesperson's list, then re-archived.
     The active list is the caller's own source with is_archived = false — archived leads are under
     Filters → Archived. Do not "fix" the list query for this. */
  const hook = read("src/hooks/useOutreach.ts");
  ok(/sb\.from\(src\.table\)\.select\(src\.listSelect, \{ count: 'exact' \}\)\.eq\('is_archived', false\)/.test(hook) && /\.eq\('is_archived', true\)/.test(hook), "the active list excludes archived leads; the archived list has them");
  ok(/const src = leadSourceFor\(roleRef\.current\);/.test(hook), "…read from the caller's own source (a salesperson: sales_leads, their own leads only)");
}

console.log(`\n${f ? `${f} FAILED` : "all passed"}`);
if (f) process.exit(1);
