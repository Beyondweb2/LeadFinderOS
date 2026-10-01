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
import { headerStateShown, markPaidIsMain, meetingIsTheNextAction, noteBesideTime } from "../src/lib/workspaceHeader.ts";
import { salesStateOf, pillStatusOf } from "../src/lib/leadState.ts";
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
  ok(/headerStateShown\(salesState\.view, pipelineStatusLabel\(pillStatusOf\(lead\.status, salesState\.view\)\), salesState\.row\)/.test(dlg) && /<SalesStatePill view=\{salesState\.view\} \/>/.test(dlg), "the extra state pill is drawn only through the one rule");
  ok(/<PipelineStatusSelect value=\{lead\.status\} stage=\{salesState\.view\}/.test(dlg) && !/<PipelineStatusBadge/.test(dlg), "the status is the SAME control as Outreach and the Inbox (pillStatusOf inside)");
  ok(!/<ContactMethodBadge/.test(dlg) && /Preferred channel/.test(dlg) && /onUpdateLead\(lead\.id, \{ contact_method: v \}/.test(dlg), "the channel is no longer a pill beside the status: a labelled Preferred channel, same write");
  ok(/<NextActionBar lead=\{row\} onEdit=\{onEditNext\} \/>/.test(strip) && !/<NextActionPill/.test(strip) && /data-testid="next-action-bar"/.test(pill), "the header bar shows the Next Action from the Work tab's own row");
  ok(!/onSave|lead_set_follow_up|saveNextAction/.test(pill.slice(pill.indexOf("export function NextActionBar"))), "…and never writes: its Edit only opens the editor");
  ok(/editNextRequested=\{editNextRequested\} onEditNextHandled=/.test(dlg) && /setEditingNext\(true\);\n\s*onEditNextHandled\?\.\(\);/.test(crm), "Edit on the bar opens the Work tab's ONE editor (requested once, then cleared)");
  ok((crm.match(/<NextActionForm /g) ?? []).length === 1 && /editingNext \|\| preset \?/.test(crm) && /if \(r\.ok\) \{ setPreset\(null\); setEditingNext\(false\); \}/.test(crm), "the editor opens on demand or on an outcome's suggestion, and closes after Save");
  ok(/const \[open, setOpen\] = useState\(defaultOpen\);/.test(crm) && /defaultOpen=\{logContactOpen\}/.test(crm) && /aria-expanded=\{open\}/.test(crm), "Log a contact is collapsed by default and opens on tap");
  const tap = crm.slice(crm.indexOf("const tap = async"), crm.indexOf("const outcomeButton"));
  ok(/if \(!r\.ok\) return;/.test(tap) && tap.indexOf("setOpen(false)") > tap.indexOf("followOn(outcome"), "…it closes only after the log succeeded (a refusal leaves it open)");
  const lc = crm.slice(crm.indexOf("function LogContact("), crm.indexOf("function InternalNote("));
  ok(lc.indexOf('data-testid="logged-line"') > lc.lastIndexOf("</>)}"), "…and the result line stays visible under the closed header");
  ok(/offeredOutcomes\(outcomesFor\(channel\)\)/.test(lc) && /WHATSAPP_RESULT_OUTCOMES\.map/.test(lc) && /SOCIAL_CONTACT_METHODS\.map/.test(lc) && /more\.map/.test(lc), "…with every channel and every outcome still inside");
  ok(/setDetailLogContact\(true\);\n\s*setDetailLead\(lead\);/.test(table) && /openLogContact=\{detailLogContact\}/.test(table) && /setDetailLogContact\(false\)/.test(table), "Outreach's Call opens the workspace with Log a contact expanded");
  ok(/data-testid="hook-not-run"/.test(crm) && /data-testid="hook-propose"/.test(crm) && /<HookVisibilityCard /.test(crm) && /data-testid="hook-history"/.test(crm), "the AI check: compact when not run; result, re-run and history unchanged");
  ok(/markPaidIsMain\(lead\.status, salesState\.view\)/.test(dlg) && (dlg.match(/onClick=\{handleMarkPaid\}/g) ?? []).length === 2 && dlg.includes("{perms.clientDelivery && !isPaidLead(lead) && ("), "Mark Paid: the main button at a payment stage, a small one otherwise — admin only, unpaid only, same handler");
  ok(/<QuickCloseButton leadId=\{lead\.id\} variant="quiet" \/>/.test(dlg), "Quick Close stays in the header as a quieter outline shortcut");
  /* Nothing removed: every tool the header had is still mounted. */
  for (const [what, re] of [
    ["Find email", /<FindEmailButton leadId=\{lead\.id\}/], ["Find socials", /<SocialLinks lead=\{lead\} withFind \/>/], ["Call script", /openScript\('call'\)/], ["Voice note", /openScript\('voice'\)/],
    ["Crawl site", /<LeadDetailCrawlButton lead=\{lead\} \/>/], ["Welcome pack", /<WelcomePackButton leadId=\{lead\.id\}/], ["Site check", /<LeadSiteCheckButton lead=\{lead\} \/>/],
    ["the star", /<StarToggle /], ["edit name", /setEditingName\(true\)/], ["WhatsApp link", /whatsAppLinkForLead\(lead\.id\)/], ["tabs", /<TabsTrigger value="client"/],
  ] as const) ok(re.test(dlg), `still there: ${what}`);
  ok(/data-testid="more-tools-toggle"/.test(dlg) && /\{moreTools && !isDemoLead\(lead\.id\) && \(/.test(dlg) && !/DropdownMenu/.test(dlg), "the less frequent tools reveal IN PLACE (not a menu), so their own dialogs stay mounted");
  for (const id of ["learned-agency", "lead-campaign", "domain-control", "meeting-when"]) ok(crm.includes(`data-testid="${id}"`), `Work tab keeps ${id}`);
  ok(/<LeadOwnerControl leadId=\{leadId\} \/>/.test(strip) && /<LastContactLine/.test(strip) && /wrong-number-pill/.test(strip), "owner, last contact and Wrong number stay in the header");
}

console.log(`\n${f ? `${f} FAILED` : "all passed"}`);
if (f) process.exit(1);
