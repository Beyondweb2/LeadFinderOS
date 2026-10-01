/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LEAD STATE ENGINE (lead state audit, 2026-09-30) — src/lib/leadState.ts, src/lib/leadOutcome.ts,
   src/lib/strongStatuses.ts and the screens that draw them. docs/lead-state-model.md is the map.

   CONTACT → OUTCOME → VISIBLE STATE → NEXT ACTION → FOLLOW-UP, and:
     · a weak contact never downgrades a strong state (the reading, not a write, decides);
     · every outcome the server accepts has a rule; no button only toasts;
     · outcome → Next Action is a SUGGESTION (pre-filled, human-saved);
     · the queues read the same state; the three automatic downgrade guards share one list.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  MEETING_KEEP_AFTER_MS, NOT_INTERESTED_STATUSES, OUTCOME_RULE_VALUES, SALES_STATES, SALES_STATE_LABEL, SALES_STATE_TONE,
  contactAgo, isEngaged, isOutOfOutreach, lastContactOf, lastContactText, lastLoggedByLead, lastLoggedContactOf,
  meetingIsCurrent, offeredOutcomes, outcomePlan, outcomeRule, pillStatusOf, salesStateOf, stateChangeText, stateChangedWords, suggestNextAction,
} from "../src/lib/leadState.ts";
import { CALL_OUTCOMES, NEXT_ACTION_OPTIONS, activityDetail, outcomesFor, salesStageOf } from "../src/lib/salesCrm.ts";
import { INBOUND_NO_DOWNGRADE, STRONG_STATUSES, postgrestList } from "../src/lib/strongStatuses.ts";
import { NEXT_ACTION_LABEL } from "../src/lib/nextActionView.ts";
import { OUTREACH_STATUS_OPTIONS, PIPELINE_STATUS_OPTIONS } from "../src/types/outreach.ts";
import { focusQueue, FOCUS_VIEWS } from "../src/lib/focusQueue.ts";
import { foldSalesWorkspace } from "../src/lib/salesWorkspace.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const NOW = Date.parse("2026-09-30T10:00:00Z");
const at = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const newLead = { status: "not_contacted", is_potential_work: false, amount_paid: null, call_booked_at: null, whatsapp_sent_at: null } as const;
const st = (l: Parameters<typeof salesStateOf>[0]) => salesStateOf(l, NOW).state;
const logged = (outcome: string, hoursAgo = 0) => ({ outcome, at: at(-hoursAgo) });

console.log("── 1. every stored status reads as ONE sales state; none falls through ──");
{
  const all = new Set([...OUTREACH_STATUS_OPTIONS, ...PIPELINE_STATUS_OPTIONS].map((o) => o.value as string).concat(["opted_out", "closed", "awaiting_reply"]));
  for (const s of all) ok(st({ status: s }) !== "other", `${s} → ${st({ status: s })}`);
  ok(st({ status: "brand_new_value" }) === "other" && salesStateOf({ status: "brand_new_value" }, NOW).detail === "brand new value", "an unknown status reads Other and shows itself — never New");
  ok(st({ status: null }) === "other", "no status at all → Other, not New");
  ok(SALES_STATES.every((s) => SALES_STATE_LABEL[s] && SALES_STATE_TONE[s]), "every state has words and a tone");
  ok(new Set(Object.values(SALES_STATE_TONE)).size === 5, "five tones, not ten colours");
  ok(st({ status: "not_contacted" }) === "new" && st({ status: "no_whatsapp_needs_sms" }) === "new" && st({ status: "queued" }) === "new", "not contacted / no WhatsApp / queued → New");
  ok(salesStateOf({ status: "queued" }, NOW).detail === "Opener queued", "…a queued one says so");
  ok(st({ status: "initial_contact" }) === "contacted" && st({ status: "report_sent" }) === "contacted" && st({ status: "awaiting_reply" }) === "contacted", "the WhatsApp pipeline's contacted stages → Contacted");
  ok(st({ status: "replied" }) === "replied", "replied → Replied");
  ok(st({ status: "price_given" }) === "interested" && salesStateOf({ status: "price_given" }, NOW).detail === "Price given", "price given → Interested · Price given (merged, not a state of its own)");
  ok(st({ status: "won_pending_onboarding" }) === "won", "won_pending_onboarding → Won");
  ok(st({ status: "payment_received" }) === "client" && st({ status: "initial_contact", amount_paid: 99 }) === "client", "paid (status or amount) → Client");
  ok(salesStateOf({ status: "refunded", amount_paid: 99 }, NOW).detail === "Refunded", "refunded → Client · Refunded");
  for (const s of ["not_interested", "opted_out", "closed"]) ok(st({ status: s }) === "not_interested", `${s} → Not interested`);
  ok(NOT_INTERESTED_STATUSES.has("closed"), "closed is Not interested everywhere (salesStageOf already said so)");
}

console.log("\n── 2. the scenarios (Paul's list) ──");
{
  /* Paul, 2026-10-01: "Logged no-answer call: Attempted contact, not successful contact." */
  ok(st({ ...newLead, lastLogged: logged("no_answer") }) === "new", "New + No answer → still New (an attempt; History keeps it)");
  ok(st({ ...newLead, lastLogged: logged("left_voicemail") }) === "new" && st({ ...newLead, lastLogged: logged("spoke_to_owner") }) === "contacted" && st({ ...newLead, lastLogged: { ...logged("no_answer"), reached: true } }) === "contacted", "voicemail is an attempt; spoke to owner is Contacted; an earlier real conversation still counts after a later no-answer");
  ok(st({ ...newLead, lastLogged: logged("spoke_to_owner") }) === "contacted", "New + Spoke to owner → Contacted");
  const p = outcomePlan("interested", newLead);
  ok(p.star && p.status === null, "New + Interested → the star (no pipeline rewrite)");
  ok(st({ ...newLead, is_potential_work: true, lastLogged: logged("interested") }) === "interested", "…reads Interested");
  const interested = { ...newLead, status: "initial_contact", is_potential_work: true };
  const vm = outcomePlan("left_voicemail", interested);
  ok(!vm.star && vm.status === null && !vm.clearNextAction, "Interested + Left voicemail: the plan writes NOTHING to the state");
  ok(st({ ...interested, lastLogged: logged("left_voicemail") }) === "interested", "⛔ …and the reading stays Interested (no downgrade to Contacted)");
  const mb = outcomePlan("meeting_booked", interested);
  ok(mb.askMeeting && !mb.star, "Interested + Meeting booked → asks when (star already on)");
  const booked = salesStateOf({ ...interested, call_booked_at: at(28) }, NOW);
  ok(booked.state === "meeting_booked" && /\d{2}:\d{2}$/.test(booked.detail ?? ""), `…with the time → "${booked.label} · ${booked.detail}"`);
  ok(st({ ...interested, call_booked_at: at(-11) }) === "meeting_booked" && st({ ...interested, call_booked_at: at(-13) }) === "interested", `a meeting stays current until ${MEETING_KEEP_AFTER_MS / 3600_000}h after it started, then the lead reads Interested again`);
  ok(meetingIsCurrent(at(1), NOW) && !meetingIsCurrent(null, NOW) && !meetingIsCurrent("garbage", NOW), "meetingIsCurrent: upcoming yes, none / garbage no");
  const cb = outcomePlan("call_back", { ...newLead, status: "initial_contact" });
  ok(cb.askCallBackDay && !cb.star && cb.status === null, "Call back → asks for the day; the state is not rewritten");
  const cbs = suggestNextAction("call", "call_back")!;
  ok(cbs.nextAction === "call" && cbs.days === null, "…the Next Action is Call with NO day chosen for them (the person must pick)");
  const ni = outcomePlan("not_interested", { ...interested, next_action: "call" });
  ok(ni.status === "not_interested" && ni.clearNextAction, "Not interested → status not_interested + the pending Next Action cleared");
  ok(!outcomePlan("not_interested", { ...newLead, next_action: "none" }).clearNextAction, "…nothing to clear → no clear");
  ok(outcomePlan("not_interested", { ...interested, call_booked_at: at(20) }, NOW).clearMeeting, "Not interested cancels a current meeting (found clicking through: a later yes jumped back to Meeting booked)");
  ok(!outcomePlan("not_interested", { ...interested, call_booked_at: at(-48) }, NOW).clearMeeting && !outcomePlan("left_voicemail", { ...interested, call_booked_at: at(20) }, NOW).clearMeeting, "…an old meeting is history, and no other outcome cancels one");
  ok(/if \(plan\.clearMeeting\) await step\('lead_set_call_booked', \{ _at: null \}/.test(read("src/lib/leadOutcome.ts")), "…carried out through lead_set_call_booked");
  ok(st({ ...interested, status: "not_interested", is_potential_work: false }) === "not_interested", "…reads Not interested");
  const wn = outcomePlan("wrong_number", interested);
  ok(wn.suppressNumber && !wn.star && wn.status === null, "Wrong number → suppress the number, nothing else");
  ok(st({ ...newLead, lastLogged: logged("wrong_number"), wrongNumber: true }) === "wrong_number", "…a lead with nothing stronger reads Wrong number");
  ok(st({ ...interested, wrongNumber: true }) === "interested", "…an Interested lead with a dead number stays Interested (the Wrong number pill says the rest)");
  ok(st({ ...newLead, wrongNumber: false }) === "new", "Wrong number cleared by the admin → the reading goes back");
  ok(outcomePlan("wrong_number", { status: "payment_received", amount_paid: 99 }).suppressNumber, "a wrong number is a NUMBER fact — suppressed for a client too");
  ok(st({ ...newLead, lastLogged: logged("message_sent") }) === "contacted", "Email / LinkedIn / social message sent → Contacted");
  /* 2026-10-01: an opener SENT moves the pipeline to initial_contact; a stamp left on a lead still New is a send that
     failed and was put back (not contact). */
  ok(st({ ...newLead, status: "initial_contact", whatsapp_sent_at: at(-2) }) === "contacted" && st({ ...newLead, whatsapp_sent_at: at(-2) }) === "new", "a WhatsApp opener sent → Contacted; a leftover stamp on a New lead is not");
}

console.log("\n── 3. real life: stronger states are not downgraded, and a no can become a yes ──");
{
  for (const s of ["payment_received", "won_pending_onboarding"]) {
    for (const o of ["interested", "not_interested", "meeting_booked", "no_answer"]) {
      const p = outcomePlan(o, { status: s });
      ok(!p.star && p.status === null && !p.clearNextAction, `${s} + ${o}: nothing written (a won lead / client is only recorded)`);
    }
  }
  ok(!outcomePlan("interested", { status: "replied", amount_paid: 99 }).star, "paid by amount → locked, whatever the status says");
  const back = outcomePlan("interested", { status: "not_interested" });
  ok(back.star && back.revive && back.status === null, "Not interested + Interested → revived (lead_revive, a real workflow status) + the star (2026-10-02)");
  ok(outcomePlan("meeting_booked", { status: "closed" }).revive, "Closed + Meeting booked → revived");
  ok(outcomePlan("interested", { status: "opted_out" }).status === null && !outcomePlan("interested", { status: "opted_out" }).revive, "⛔ an opted-out number (a WhatsApp STOP) keeps its status — the star only");
  ok(outcomePlan("not_interested", { status: "not_interested" }).status === null, "Not interested twice → written once");
  ok(!outcomePlan("interested", { status: "replied", is_potential_work: true }).star, "the star is never set twice");
  ok(st({ status: "replied", is_potential_work: true }) === "interested", "Replied + star → Interested (stronger wins)");
  ok(st({ status: "not_interested", is_potential_work: true }) === "not_interested", "Not interested outranks a stale star");
}

console.log("\n── 4. every outcome has a rule; the buttons are the offered ones ──");
{
  ok(CALL_OUTCOMES.every((o) => OUTCOME_RULE_VALUES.includes(o.value)), "every outcome the server accepts has a rule (a new one must be given one here)");
  ok(CALL_OUTCOMES.every((o) => outcomeRule(o.value).does.length > 10), "every button says what it does (its tooltip)");
  ok(!outcomeRule("agency_controls_site").offered, "Agency controls site is no longer a button (an attribute, not an outcome)…");
  ok(!offeredOutcomes(outcomesFor("call")).some((o) => o.value === "agency_controls_site") && offeredOutcomes(outcomesFor("call")).some((o) => o.value === "left_voicemail"), "…the call buttons leave it out and keep the rest");
  ok(outcomeRule("anything_new").effect === "record" && !outcomeRule("anything_new").offered, "an unknown outcome is a plain record, never a status change");
  const crm = read("src/components/LeadCrmPanel.tsx");
  ok(/offeredOutcomes\(outcomesFor\(channel\)\)/.test(crm), "Log Contact draws the offered outcomes");
  ok(/data-testid="agency-chip"/.test(crm) && /'lead_set_website_control', \{ _value: agency \? 'unknown' : 'agency_controls'/.test(crm), "Agency runs their site is an attribute chip (website_control), logging no contact");
  ok(/data-testid="logged-line"/.test(crm) && /<SalesStatePill view=\{result\.state\}/.test(crm) && /data-testid="state-change"/.test(crm) && /data-testid="suggestion"/.test(crm), "⛔ no toast-only button: the result line shows the contact, the state it left, the change and the suggestion");
  ok(/WHATSAPP_RESULT_OUTCOMES = \['interested', 'meeting_booked', 'call_back', 'not_interested'\]/.test(crm) && /outcomeButton\(\{ value: v, label: outcomeLabel\(v\) \}, false\)/.test(crm), "WhatsApp: 'What came of the conversation?' applies the plan without a second record of the messages");
}

console.log("\n── 5. outcome → Next Action: suggested, pre-filled, human-saved ──");
{
  const s = (m: string, o: string) => suggestNextAction(m, o);
  ok(s("call", "no_answer")?.nextAction === "call" && s("call", "no_answer")?.days === 1, "No answer → Call · tomorrow");
  ok(s("call", "left_voicemail")?.nextAction === "call" && s("call", "left_voicemail")?.days === 3, "Left voicemail → Call · in 3 days");
  ok(s("email", "message_sent")?.nextAction === "email" && s("email", "message_sent")?.days === 3, "Email sent → Email · in 3 days");
  ok(s("linkedin", "message_sent")?.nextAction === "follow_up" && /LinkedIn/.test(s("linkedin", "message_sent")!.note), "LinkedIn message → Follow up · in 3 days, naming LinkedIn");
  ok(s("linkedin", "connection_sent")?.days === 3, "LinkedIn connection request → Follow up · in 3 days (the Social branch's rule, same shape)");
  ok(s("call", "interested")?.nextAction === "send_info" && s("call", "interested")?.days === 0, "Interested → Send information · today");
  ok(s("call", "spoke_to_owner")?.days === null, "Spoke to owner → Follow up, the day left to the person");
  ok(s("call", "meeting_booked") === null && s("call", "not_interested") === null && s("call", "wrong_number") === null, "Meeting (its own form) / Not interested (cleared) / Wrong number → no suggestion");
  for (const o of CALL_OUTCOMES) {
    const sug = s("call", o.value);
    if (sug) ok(NEXT_ACTION_OPTIONS.some((x) => x.value === sug.nextAction), `${o.value}: suggests an offered Next Action (${sug.nextAction})`);
  }
  ok(NEXT_ACTION_OPTIONS.every((o) => o.value === "none" || NEXT_ACTION_LABEL[o.value]), "every offered Next Action has its words in nextActionView");
  ok(!NEXT_ACTION_OPTIONS.some((o) => (o.value as string) === "send_voice_note") && NEXT_ACTION_LABEL.send_voice_note === "Voice note", "Voice note is no longer offered but an older row still reads");
  const mig = read("supabase/migrations/20260930150000_next_action_types.sql");
  for (const v of ["email", "send_info", "meeting"]) ok(new RegExp(`add value if not exists '${v}'`).test(mig), `the enum gains '${v}'`);
  const crm = read("src/components/LeadCrmPanel.tsx");
  ok(/requireDate: sug\.days === null && res\.plan\.askCallBackDay/.test(crm) && /disabled=\{needsDay\}/.test(crm), "Call back cannot be saved without a day");
  const logUi = crm.slice(crm.indexOf("function LogContact("), crm.indexOf("function InternalNote("));
  ok(!/lead_set_follow_up/.test(logUi), "⛔ Log Contact itself never saves a Next Action");
  ok(/'lead_set_call_booked', \{ _at: iso \}/.test(crm) && /_next_action: 'meeting'/.test(crm) && /Save meeting/.test(crm), "the meeting's ONE Save writes the time and the Next Action Meeting (a person pressed it)");
}

console.log("\n── 6. Last contact ──");
{
  const rows = [
    { kind: "note", body: "x", data: {}, created_at: at(-1), actor_user_id: "a", lead_id: "L1" },
    { kind: "call_outcome", body: null, data: { outcome: "left_voicemail", channel: "call" }, created_at: at(-2), actor_user_id: "a", lead_id: "L1" },
    { kind: "contact_logged", body: " owner away ", data: { outcome: "message_sent", channel: "linkedin" }, created_at: at(-30), actor_user_id: "b", lead_id: "L1" },
    { kind: "contact_logged", body: null, data: { outcome: "message_sent", channel: "email" }, created_at: at(-5), actor_user_id: "b", lead_id: "L2" },
  ];
  const l1 = lastLoggedContactOf(rows.filter((r) => r.lead_id === "L1"))!;
  ok(l1.method === "Call" && l1.outcome === "Left voicemail", "the newest LOGGED contact wins (a note is not a contact)");
  ok(lastContactText(l1, NOW) === "Call · Left voicemail · 2h ago", `"${lastContactText(l1, NOW)}"`);
  const li = lastLoggedContactOf([rows[2]])!;
  ok(li.method === "LinkedIn" && li.outcome === "Sent, no reply yet" && li.note === "owner away", "LinkedIn · Sent, no reply yet, the note kept");
  const wa = lastContactOf(l1, { direction: "inbound", at: at(-0.34) })!;
  ok(wa.method === "WhatsApp" && wa.outcome === "Replied" && contactAgo(wa.at, NOW) === "20m ago", "a newer WhatsApp reply is the last contact: WhatsApp · Replied · 20m ago");
  ok(lastContactOf(l1, { direction: "outbound", at: at(-48) }) === l1, "an older WhatsApp send does not hide a newer call");
  ok(lastContactOf(null, { direction: "outbound", at: at(-1), failed: true }) === null, "a failed send is not a contact");
  ok(lastContactOf(null, null) === null && lastLoggedContactOf(null) === null, "nothing → no line");
  ok(contactAgo(at(-26), NOW) === "Yesterday" && contactAgo(at(-24 * 4), NOW) === "4 days ago", "Yesterday / N days ago");
  const byLead = lastLoggedByLead(rows);
  ok(byLead.get("L1")?.outcome === "Left voicemail" && byLead.get("L2")?.method === "Email" && byLead.size === 2, "the batch reader (Outreach rows) gives each lead its own newest contact");
  ok(CALL_OUTCOMES.every((o) => lastLoggedContactOf([{ kind: "call_outcome", data: { outcome: o.value, channel: "call" }, created_at: at(0) }])!.outcome === o.label), "every outcome has its words on the Last contact line");
}

console.log("\n── 7. History says the state change, and only a real one ──");
{
  const a = salesStateOf({ ...newLead }, NOW); const b = salesStateOf({ ...newLead, is_potential_work: true }, NOW);
  ok(stateChangeText(a, b) === "Status: New → Interested", `"${stateChangeText(a, b)}"`);
  ok(stateChangeText(b, b) === null, "no change → nothing claimed");
  ok(stateChangedWords({ from: "contacted", to: "meeting_booked" }) === "Status: Contacted → Meeting booked", "a stored state_changed row reads the same way");
  for (const s of SALES_STATES) {
    const hand = activityDetail({ kind: "state_changed", data: { from: s, to: s } }, () => "")!;
    const word = hand.replace(/^Status: /, "").split(" → ")[0];
    ok(SALES_STATE_LABEL[s].startsWith(word), `the handoff's words for ${s} ("${word}") are the History's`);
  }
  const sql = read("supabase/migrations/20260930150100_lead_state_changed.sql");
  ok(/perform public\._require_work\(_lead_id\)/.test(sql) && /if _from = _to then return/.test(sql) && /'state_changed'/.test(sql), "lead_log_state_change: ownership-checked, refuses a non-change, writes activity only");
  ok(SALES_STATES.every((s) => sql.includes(`'${s}'`)), "…and knows every state the engine has");
  ok(!/update public\.outreach_leads/i.test(strip(sql)), "…it never writes the lead row");
  const crm = read("src/components/LeadCrmPanel.tsx");
  ok(/a\.kind !== 'state_changed'/.test(crm) && /<= 60_000/.test(crm), "History puts the change on the contact that caused it (same person, within a minute)");
  ok(/cause\.data\?\.outcome === a\.data\?\.outcome/.test(crm) && /rows\.slice\(0, i\)\.reverse\(\)\.find/.test(crm), "…only the NEAREST contact, and only with the same outcome (a WhatsApp result was pinned to an older call)");
  ok(/const MECHANISM = new Set\(\['marked_interested', 'stage_changed'\]\)/.test(crm), "…the star / pipeline rows of that change fold into its one line");
  ok(activityDetail({ kind: "follow_up_set", data: { next_action: "none" } }, () => "") === "Next action cleared", "a cleared Next Action reads 'Next action cleared', not 'none'");
  ok(!/\(UK time\)/.test(crm), "the meeting box does not claim UK time (it reads the browser's clock)");
  ok(activityDetail({ kind: "call_booked", data: { at: null } }, () => "") === "Cancelled" && /14:30$/.test(activityDetail({ kind: "call_booked", data: { at: "2026-10-02T13:30:00Z" } }, () => "") ?? ""), "a meeting row says its London time, or Cancelled");
}

console.log("\n── 8. the executor: both roles, the ownership-checked functions, the queue stopped ──");
{
  const ex = strip(read("src/lib/leadOutcome.ts"));
  ok(/'lead_mark_interested'/.test(ex) && /'lead_set_stage'/.test(ex) && /'lead_mark_wrong_number'/.test(ex) && /'lead_set_follow_up'/.test(ex), "every write is a lead function (both roles, History rows)");
  ok(!/from\('outreach_leads'\)/.test(ex), "⛔ no direct table write (a sales session's would silently change nothing)");
  ok(/mode: 'suppress_lead', lead_id: lead\.id, reason: 'not_interested'/.test(ex), "Not interested stops the queue for that lead");
  ok(/recordStateChange\(lead\.id, before, after, outcome\)/.test(ex) && /failed\.length \?/.test(ex), "the History change is recorded only when the plan fully happened");
  const quick = strip(read("src/lib/leadQuickActions.ts"));
  ok(/if \(status === 'not_interested'\) \{/.test(quick) && !/!isAdmin && status === 'not_interested'/.test(quick), "the Inbox pill's Not interested stops the queue for the admin too");
}

console.log("\n── 9. one reading on every screen ──");
{
  const focus = read("src/pages/Focus.tsx");
  ok(/<SalesStatePill view=\{st\.view\}/.test(focus) && /<LastContactLine v=\{st\.lastContact\}/.test(focus), "Focus Mode: the state and the Last contact at a glance");
  ok(!/lead\.status\.replace\(/.test(focus), "…the raw status chip is gone");
  ok(!/markLeadInterested|setLeadPipelineStatus|ThumbsDown/.test(focus), "…the duplicate Interested / Not interested buttons are gone (Log Contact has them)");
  ok(!/onOutcome/.test(focus) && !/onOutcome/.test(read("src/components/LeadDetailDialog.tsx")), "no screen keeps its own outcome rule");
  const dlg = read("src/components/LeadDetailDialog.tsx");
  ok(/<SalesStatePill view=\{salesState\.view\}/.test(dlg) && !/Marked interested \(the star\)/.test(dlg), "the popup header leads with the state; the separate star chip is gone");
  const strip2 = read("src/components/LeadStateStrip.tsx");
  ok(!/Call booked ·/.test(strip2) && /<LastContactLine/.test(strip2), "the strip no longer draws the meeting twice; Last contact is the shared line");
  const inbox = read("src/pages/Inbox.tsx");
  ok(inbox.includes('<PipelineStatusSelect value={active.leadStatus} stage={activeSales.view}') && !inbox.includes('<SalesStatePill'), "the Inbox thread header shows the state as its ONE status pill");
  ok(inbox.includes("byCampaign.filter((c) => shownStatusMatches(statusFilter, { status: c.leadStatus, is_potential_work: c.isPotentialWork }, listStageOf(c.leadId))") && /if \(filter === 'interested'\) return isStarred\(lead\);/.test(read("src/lib/statusFilter.ts")), "⛔ the Inbox Interested filter reads the star, and only the star (through the shared matcher, 2026-10-02)");
  const table = read("src/components/OutreachTable.tsx");
  /* 2026-10-01 (Paul: "Status means status. Next Action means what should happen next"): the meeting and the
     call-back prompt moved to the Next Action column (nextUpHint); the last contact is the status tooltip. */
  ok(table.includes('useAllLoggedContacts()') && /data-testid="row-next-up"/.test(table) && !/data-testid="row-meeting"/.test(table), "Outreach rows: what is coming sits in Next Action; the last contact is the status tooltip (logged contacts for every lead)");
  const hooks = read("src/hooks/useLastLoggedContacts.ts");
  ok(/\.order\('id'\)\.range\(from, from \+ 999\)/.test(hooks), "the batch read pages (PostgREST stops at 1,000 silently)");
  const badge = read("src/components/PipelineStatusBadge.tsx");
  ok(/won_pending_onboarding: \{\s*\n\s*label: 'Won · awaiting onboarding'/.test(badge), "a won lead's badge says Won (it said New)");
  ok(/statusConfig\[status\] \?\? unknown \?\? defaultConfig/.test(badge), "an unknown status shows as itself, not New");
}

console.log("\n── 10. queues: Next best actions and Focus read the state ──");
{
  ok(isOutOfOutreach("not_interested") && isOutOfOutreach("client") && isOutOfOutreach("won") && !isOutOfOutreach("interested"), "out of outreach: not interested, client, won");
  ok(isEngaged("meeting_booked") && isEngaged("interested") && isEngaged("replied") && !isEngaged("contacted"), "engaged: replied, interested, meeting");
  const fact = (id: string, over: Record<string, unknown> = {}) => ({
    lead: { id, business_name: id, status: "initial_contact" }, thread: [], contactTimesMs: [NOW - 86_400_000], humanReplyTimesMs: [], firstContactMs: null, lastContactMs: null,
    contactCount: 1, channels: [], responded: false, interested: false, notInterested: false, onboardingSent: false, onboardingOpened: false, won: false,
    interestedAtMs: null, linkFirstSentAt: null, linkFirstOpenedAt: null, ...over,
  });
  const wl = (id: string, over: Record<string, unknown> = {}) => [id, { id, business_name: id, status: "initial_contact", next_action: null, next_action_date: null, next_action_note: null, ...over }] as const;
  // deno-lint-ignore no-explicit-any
  const ws = foldSalesWorkspace({ personId: null, facts: [fact("meet"), fact("later"), fact("out", { notInterested: true })] as any, leads: new Map([wl("meet", { call_booked_at: at(3) }), wl("later", { call_booked_at: at(24 * 5) }), wl("out", { call_booked_at: at(2) })]) as any, audits: [], activity: [], nowMs: NOW });
  ok(ws.nextActions[0]?.leadId === "meet" && ws.nextActions[0]?.kind === "meeting", "a meeting in the next 36h is the TOP next best action");
  ok(!ws.nextActions.some((a) => a.leadId === "later"), "…a meeting next week is not an action yet");
  ok(ws.followUps.meetings.map((m) => m.id).join(",") === "meet,later", "…but both are on the Meetings list, soonest first");
  ok(!ws.followUps.meetings.some((m) => m.id === "out") && !ws.nextActions.some((a) => a.leadId === "out"), "a not-interested lead's meeting is not surfaced");
  ok(FOCUS_VIEWS.some((v) => v.key === "meetings") && focusQueue(ws, "meetings").map((i) => i.leadId).join(",") === "meet,later", "Focus Mode has a Meetings view");
  ok(/call_booked_at"/.test(read("supabase/functions/sales-performance/index.ts")) || /call_booked_at",/.test(read("supabase/functions/sales-performance/index.ts")), "sales-performance reads call_booked_at");
  const perf = read("src/lib/salesPerformance.ts");
  ok(perf.includes('import { CONVERSATION_OUTCOMES, NOT_INTERESTED_STATUSES, REACHED_OUTCOMES } fr' + "om './leadState" + ".ts'") &&!/const NOT_INTERESTED_STATUSES/.test(perf) && !/const CONVERSATION_OUTCOMES/.test(perf), "the dashboard's Not interested and conversation outcomes are the engine's sets (one of each)");
}

console.log("\n── 11. automatic writes never downgrade a deal — ONE list ──");
{
  ok(["won_pending_onboarding", "refunded", "payment_received", "in_delivery", "completed", "interested", "price_given"].every((s) => STRONG_STATUSES.includes(s)), "strong: interested, quoted, won, paid, delivering, done, refunded");
  ok(INBOUND_NO_DOWNGRADE.includes("replied") && !INBOUND_NO_DOWNGRADE.includes("not_interested") && !INBOUND_NO_DOWNGRADE.includes("report_sent"), "an inbound reply also leaves 'replied' alone, and still revives not interested / report sent");
  ok(postgrestList(["a", "b"]) === "(a,b)", "the PostgREST list shape");
  const inbound = read("supabase/functions/_shared/whatsapp-inbound.ts");
  ok(/const NO_DOWNGRADE = postgrestList\(INBOUND_NO_DOWNGRADE\);/.test(inbound) && /from "\.\.\/\.\.\/\.\.\/src\/lib\/strongStatuses\.ts"/.test(inbound), "the inbound handler uses the one list");
  for (const p of ["supabase/functions/send-whatsapp-message/index.ts", "supabase/functions/process-whatsapp-queue/index.ts"]) {
    const s = read(p);
    ok(/\.not\("status", "in", postgrestList\(STRONG_STATUSES\)\)/.test(s) && !/"\(interested,price_given,payment_received,in_delivery,completed\)"/.test(s), `${p}: the report_sent write uses the one list`);
  }
  // "Is there only one of it": no hand-written copy of the list anywhere under supabase/functions.
  const walk = (d: string, out: string[] = []) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p, out); else if (p.endsWith(".ts")) out.push(p); } return out; };
  const copies = walk("supabase/functions").filter((p) => /["'`]\((?:[a-z_]+,)*price_given(?:,[a-z_]+)*\)["'`]/.test(read(p)));
  ok(copies.length === 0, `no hand-kept status list left (${copies.join(", ") || "none"})`);
  ok(salesStageOf("won_pending_onboarding") === "won" && STRONG_STATUSES.includes("won_pending_onboarding"), "a WON lead can no longer be flipped to Replied by an inbound message");
}

console.log("\n── 12. Paul's decisions, 2026-09-30 (follow-up) ──");
{
  // 1. A human revive clears ONLY the Not interested suppression.
  const sql = strip(read("supabase/migrations/20260930170000_revive_clears_not_interested.sql").replace(/^\s*--.*$/gm, ""));
  ok(/old\.status is distinct from 'not_interested' or new\.status not in \('interested', 'won_pending_onboarding'\)/.test(sql), "fires only from not_interested → interested / won (Meeting booked writes interested)");
  ok(/where s\.reason = 'not_interested' and s\.wrong_number_at is null/.test(sql), "deletes ONLY reason not_interested, and never a row carrying a Wrong number mark");
  ok(!/replied_no|opted_out|'closed'|'archived'/.test(sql), "…never names replied_no / opt-out / closed / archived (they are untouched)");
  ok(/after update of status on public\.outreach_leads/.test(sql) && /'suppression_cleared', 'not_interested'/.test(sql), "a trigger on the status change (admin and sales alike), with a History line");
  for (const o of ["no_answer", "left_voicemail", "message_sent", "spoke_to_owner", "call_back"]) ok(outcomePlan(o, { status: "not_interested" }).status === null, `${o} on a Not interested lead writes no status → the block stays`);
  for (const o of ["no_answer", "left_voicemail", "message_sent", "spoke_to_owner", "call_back"]) ok(!outcomePlan(o, { status: "not_interested" }).revive, `${o} on a Not interested lead is no revive`);
  ok(outcomePlan("interested", { status: "not_interested" }).revive && outcomePlan("meeting_booked", { status: "not_interested" }).revive, "Interested / Meeting booked on it → lead_revive → the block is lifted (revive-and-inbox-filter.test.ts)");
  ok(/said\.push\('Not interested block lifted \(any other block stays\)'\)/.test(read("src/lib/leadOutcome.ts")), "the result line says the block was lifted");
  // 2. ONE status pill (Paul, 2026-10-01): yesterday's solid pipeline badge, the star for Interested.
  const table = read("src/components/OutreachTable.tsx");
  const card = read("src/components/OutreachMobileCard.tsx");
  const sel = read("src/components/PipelineStatusSelect.tsx");
  ok(sel.includes('<PipelineStatusBadge status={(pillStatusOf(status, stage) as PipelineStatus) ?? undefined} compact={compact} />') && !sel.includes('SalesStatePill'), "the one pill is the solid pipeline badge (its own words and colours), never a sales-state pill");
  ok(pillStatusOf('not_contacted', { state: 'contacted' }) === 'initial_contact' && pillStatusOf('no_whatsapp', { state: 'contacted' }) === 'initial_contact' && pillStatusOf('no_whatsapp', { state: 'new' }) === 'no_whatsapp' && pillStatusOf('replied', { state: 'replied' }) === 'replied' && pillStatusOf('queued', { state: 'interested' }) === 'queued',
    "a lead reached by phone shows the solid Contacted pill even when the WhatsApp pipeline still says New / No WhatsApp; nothing else changes");
  ok(table.includes('stage={rowSalesState(lead)}') && table.includes('<OneStatusPill status={lead.status} stage={rowSalesState(lead)} />') && !table.includes('<SalesStatePill') && table.includes('salesState={rowSalesState(lead)}'), "Outreach desktop row: ONE pill, no second pill");
  ok(!card.includes('<SalesStatePill') && card.split('<OneStatusPill').length - 1 === 2, "Outreach phone card: ONE pill (editable or read-only)");
  ok(table.includes('fill-yellow-500 flex-shrink-0"><title>Interested</title>'), "Interested is the gold star on the row, not a pill");
  ok(sel.includes('Pipeline status · now'), "the pill's menu says it sets the pipeline status");
  ok(table.includes('useAllLoggedContacts()') &&table.includes('Last contact: ${lc.method}') && !table.includes('data-testid="row-last-contact"'), '…the logged contacts are read for every lead (pill = filter); the last contact is the status tooltip, not a line under the pill (2026-10-01)');
  const wn = read("supabase/migrations/20260930170100_leads_wrong_numbers.sql");
  ok(/public\.can_work_lead\(l\.id\)/.test(wn) && /revoke all on function public\.leads_wrong_numbers\(uuid\[\]\) from public, anon/.test(wn), "the batch Wrong number read is role-checked and not for anon");
  // 3. Voice note stays off the Next Action list.
  ok(!NEXT_ACTION_OPTIONS.some((o) => (o.value as string) === "send_voice_note"), "Voice note is a contact format, not a Next Action");
}

console.log(`\n${f === 0 ? "ALL PASS" : `${f} FAILURES`}`);
process.exit(f === 0 ? 0 : 1);
