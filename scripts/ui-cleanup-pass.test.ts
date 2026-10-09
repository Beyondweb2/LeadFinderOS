/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE UI CLEANUP PASS (2026-09-29, Paul: "less UI, clearer state, fewer dead controls, every action
   has a purpose"). Record: docs/ui-cleanup-pass.md. Pins:
     · ONE Next Action, drawn by one rule everywhere (popup, Inbox list + header, Outreach, Focus);
     · every logged outcome is visible afterwards (Last contact) and its follow-on is the one rule;
     · no hover template preview anywhere; Playbook entry points gone (one kept, on purpose);
     · Find email: our records first, then the website — and it only ever fills a blank;
     · the Admin dashboard uses the Sales dashboard's surfaces and dropped the dead cards.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync } from "node:fs";
import { nextActionView, nextActionViewOf, nextActionText } from "../src/lib/nextActionView.ts";
import { CALL_OUTCOMES, NEXT_ACTION_OPTIONS, activityDetail } from "../src/lib/salesCrm.ts";
/* The Last contact reading and the outcome rule moved to the lead state engine (2026-09-30); the full
   behaviour is scripts/lead-state.test.ts — these keep this pass's promises pinned. */
import { lastLoggedContactOf as lastLoggedContact, outcomePlan } from "../src/lib/leadState.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const has = (p: string) => existsSync(new URL(`../${p}`, import.meta.url));

console.log("── the Next Action in words ──");
{
  const today = "2026-10-01";
  ok(nextActionView(null, today) === null && nextActionView({ next_action: "none", next_action_date: "2026-10-02" }, today) === null, "none / missing → nothing drawn");
  const od = nextActionView({ next_action: "call", next_action_date: "2026-09-29" }, today)!;
  ok(od.bucket === "overdue" && od.when === "Overdue · 29 Sept" && od.short === "Overdue" && od.label === "Call", `overdue: "${od.when}"`);
  const td = nextActionView({ next_action: "send_follow_up", next_action_date: today }, today)!;
  ok(td.bucket === "today" && td.when === "Today" && td.label === "WhatsApp follow-up", "today: Today");
  const tm = nextActionView({ next_action: "call", next_action_date: "2026-10-02" }, today)!;
  ok(tm.when === "Tomorrow" && tm.bucket === "upcoming", "tomorrow: Tomorrow");
  const wk = nextActionView({ next_action: "call", next_action_date: "2026-10-04" }, today)!;
  ok(wk.when === "Sun 4 Oct" && wk.short === "4 Oct", `this week: "${wk.when}" (list: "${wk.short}")`);
  const far = nextActionView({ next_action: "follow_up", next_action_date: "2026-11-12", next_action_note: "  ring after their website contract ends " }, today)!;
  ok(far.when === "12 Nov" && far.note === "ring after their website contract ends", "later: the date; the note trimmed");
  ok(nextActionText(far) === "Follow up · 12 Nov · ring after their website contract ends", "one line: action · when · note");
  const nod = nextActionView({ next_action: "call", next_action_date: null }, today)!;
  ok(nod.when === null && nod.short === null && nod.bucket === "none", "an action with no date still shows, with no day");
  ok(nextActionViewOf("remove_if_no_reply", null)!.label === "Close if no reply" && nextActionViewOf("mystery_value", null)!.label === "mystery value", "older stored values have words; an unknown one shows as itself, never dropped");
  for (const o of NEXT_ACTION_OPTIONS.filter((x) => x.value !== "none")) ok(!!nextActionViewOf(o.value, null), `the popup's choice "${o.label}" is drawn`);
}

console.log("\n── one pill, every screen ──");
{
  ok(/<LeadStateStrip leadId=\{lead\.id\}/.test(read("src/components/LeadDetailDialog.tsx")) && /next=\{<span[^\n]*<HeaderNextAction leadId=\{lead\.id\} onEdit=\{\(\) => setNextOpen\(true\)\} \/>/.test(read("src/components/LeadDetailDialog.tsx")) && /\{status\}\s*\{next\}/.test(read("src/components/LeadStateStrip.tsx")), "popup: the next action above the tabs, beside the status; tap → the one editor (compact since 2026-10-06)");
  const inbox = read("src/pages/Inbox.tsx");
  ok(/<NextActionPill lead=\{leadByIdForState\.get\(c\.leadId\)\} size="xs"/.test(inbox), "Inbox list: a small pill on every row that has one");
  ok(/<NextActionEditor lead=\{activeLead\} variant="pill" \/>/.test(inbox), "Inbox header: the one Next Action, shown and set in place (2026-10-02, replacing Find email)");
  ok(/next_action, next_action_date, next_action_time, next_action_note/.test(read("src/hooks/useInbox.ts")), "…and the Inbox reads the note (and the time), so the header pill carries it");
  ok(/onlyFollowUp/.test(read("src/components/ConvStateChip.tsx")), "the Inbox chip no longer repeats \"Follow-up due\" beside the pill");
  const editor = read("src/components/NextActionEditor.tsx");
  ok(/const v = nextActionView\(lead\);/.test(editor) && /<NextActionForm compact/.test(editor) && /NEXT_ACTION_OPTIONS \} from '@\/lib\/salesCrm'/.test(read("src/components/NextActionForm.tsx")), "Outreach cell: the same words and the same form (every choice) as the popup (2026-10-02)");
  ok(!has("src/hooks/useCustomNextActions.ts") && !has("src/components/NextActionBadge.tsx") && !/custom::|CUSTOM_PREFIX|setLeadCustomAction/.test(editor), "the device-only custom action labels are gone (a second, invisible next-action system)");
  const pill = read("src/components/NextActionPill.tsx");
  ok(/overdue: 'border-red/.test(pill) && /today: 'border-amber/.test(pill) && /upcoming: 'border-border/.test(pill), "overdue red, today amber, later quiet");
}

console.log("\n── an outcome you log stays visible ──");
{
  const rows = [
    { kind: "note", body: "x", data: {}, created_at: "2026-09-29T10:00:00Z", actor_user_id: "a" },
    { kind: "call_outcome", body: null, data: { outcome: "no_answer", channel: "call" }, created_at: "2026-09-28T10:00:00Z", actor_user_id: "a" },
    { kind: "contact_logged", body: " owner away till Friday ", data: { outcome: "wrong_number", channel: "email" }, created_at: "2026-09-29T09:00:00Z", actor_user_id: "b" },
  ];
  const last = lastLoggedContact(rows)!;
  ok(last.outcomeValue === "wrong_number" && last.tone === "bad" && last.actorId === "b" && last.note === "owner away till Friday", "the newest LOGGED contact wins (a note is not a contact); wrong number reads red");
  ok(lastLoggedContact([]) === null && lastLoggedContact(null) === null, "nothing logged → no line");
  ok(CALL_OUTCOMES.every((o) => lastLoggedContact([{ kind: "call_outcome", data: { outcome: o.value, channel: "call" }, created_at: "2026-09-29T00:00:00Z" }])!.outcome === o.label), "every outcome button has its words on the Last contact line");
  ok(/<LeadStateStrip/.test(read("src/components/LeadDetailDialog.tsx")) && /<LastContactLine/.test(read("src/components/LeadStateStrip.tsx")) && /data-testid="last-contact"/.test(read("src/components/SalesStatePill.tsx")), "the popup shows Last contact on every tab");
}

console.log("\n── the one rule for what an outcome also changes (now src/lib/leadState.ts outcomePlan) ──");
{
  const lead = { status: "replied", is_potential_work: false, amount_paid: null };
  ok(outcomePlan("interested", lead).star && outcomePlan("meeting_booked", lead).star, "Interested / Meeting booked → the Interested star");
  ok(!outcomePlan("interested", { ...lead, is_potential_work: true }).star, "…not twice");
  ok(outcomePlan("not_interested", lead).status === "not_interested" && outcomePlan("not_interested", { ...lead, status: "not_interested" }).status === null, "Not interested → status Not interested, once");
  const none = (p: ReturnType<typeof outcomePlan>) => !p.star && p.status === null && !p.clearNextAction;
  ok(none(outcomePlan("interested", { ...lead, amount_paid: 99 })) && none(outcomePlan("not_interested", { ...lead, status: "payment_received" })) && none(outcomePlan("not_interested", { ...lead, status: "won_pending_onboarding" })), "a client or a won lead is never touched");
  for (const o of ["no_answer", "left_voicemail", "message_sent", "spoke_to_owner", "call_back", "wrong_number", "agency_controls_site"]) ok(!outcomePlan(o, lead).star && outcomePlan(o, lead).status === null, `${o}: no status change (the record itself)`);
  const crm = read("src/components/LeadCrmPanel.tsx");
  const logUi = crm.slice(crm.indexOf("function LogContact("), crm.indexOf("function InternalNote("));
  ok(!/lead_set_follow_up/.test(logUi), "⛔ logging an outcome still never saves a next action by itself");
  ok(/applyOutcome\(/.test(crm) && !/onOutcome/.test(read("src/components/LeadDetailDialog.tsx")), "the popup carries out the one rule through the Work panel (Focus Mode retired 2026-10-01)");
}

console.log("\n── no hover template preview ──");
{
  for (const p of ["src/pages/Inbox.tsx", "src/components/WhatsAppLeadControls.tsx", "src/components/OutreachTable.tsx", "src/components/TemplateWordingPreview.tsx"]) {
    ok(!/useTemplateHover\(|<TemplateWordingInList|onPointerEnter/.test(read(p)), `${p}: nothing opens on hover`);
  }
}

console.log("\n── Playbook ──");
{
  for (const p of ["src/components/LeadDetailDialog.tsx", "src/components/LeadDeliveryCockpit.tsx", "src/components/audit/AuditBookList.tsx", "src/pages/AiAudit.tsx", "src/pages/Inbox.tsx", "src/components/OutreachTable.tsx"]) {
    ok(!/to=\{`\/playbook\//.test(read(p)), `${p}: no Playbook link`);
  }
  /* Paul, 2026-09-29 (second pass): no user-facing entry into the Playbook, and no hidden route. */
  ok(!/to=\{`\/playbook\//.test(read("src/pages/ClientHub.tsx")) && !/title="[0-9]. Action Plan"/.test(read("src/pages/ClientHub.tsx")), "the paid-client hub's Action Plan step is gone");
  ok(!/\/playbook/.test(read("src/App.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")) && !has("src/pages/Playbook.tsx") && !has("src/hooks/usePlaybook.ts"), "no /playbook route, no page, no page hook");
  const hub = read("src/pages/ClientHub.tsx");
  ok(["1. Official baseline", "2. Welcome Pack", "3. Directories", "4. Website Build", "5. Remeasure", "6. Results", "7. Ongoing opportunities", "8. Monthly update"].every((t) => hub.includes(`title="${t}"`)), "the hub's steps are numbered without a gap");
  ok(!/title="[0-9]+. Review Replies"/.test(hub) && !hub.includes('to="/review-replies"'), "review replies are not a delivery stage (not a Findable deliverable, Paul 2026-09-28)");
}

console.log("\n── Wrong number suppresses future outreach ──");
{
  const mig = read("supabase/migrations/20260929200000_wrong_number_suppression.sql");
  ok(/on conflict \(phone_e164\) do update/.test(mig) && !/insert into public\.contact_suppressions \([^)]*lead_id/.test(mig), "the mark is a contact_suppressions row on the PHONE (never lead_id, which would also stop email)");
  ok(/if public\.my_role\(\) is distinct from 'admin' then return jsonb_build_object\('ok', false, 'error', 'admin_only'\)/.test(mig.slice(mig.indexOf("lead_clear_wrong_number"))), "only the admin clears it");
  ok(/delete from public\.contact_suppressions where phone_e164 = v_key and reason = 'wrong_number'/.test(mig) && /set wrong_number_at = null/.test(mig), "clearing removes only what the mark added — an opt-out on the same number stays");
  ok(!/delete from public\.(outreach_leads|whatsapp_messages|lead_activity)/.test(mig), "nothing is deleted from the lead, its messages or its history");
  const supp = read("supabase/functions/_shared/suppression.ts");
  ok(/export async function checkWrongNumber\(/.test(supp) && /wrongNumber: !!data\.wrong_number_at/.test(supp), "one module answers it: every automated sender's checkSuppressed sees the row, templates ask checkWrongNumber");
  const swm = read("supabase/functions/send-whatsapp-message/index.ts");
  ok(/if \(templateName && await checkWrongNumber\(service, "\+" \+ to\)\)/.test(swm) && swm.indexOf("checkWrongNumber(service") < swm.indexOf('mode: "dry_run"'), "templates are refused, before the dry run (so Preview and the bulk pre-check exclude it)");
  const q = read("supabase/functions/process-whatsapp-queue/index.ts");
  ok(/if \(mainSupp\.suppressed && mainSupp\.wrongNumber\)/.test(q) && q.indexOf("mainSupp.suppressed && mainSupp.wrongNumber") < q.indexOf('status: "opted_out", whatsapp_delivery_status: "suppressed"'), "the queue refuses it without relabelling the lead opted_out");
  for (const lane of ["sendSupp", "hSupp", "cSupp", "mainSupp"]) ok(new RegExp(`const ${lane} = await checkSuppressed\\(`).test(q), `queue lane ${lane} checks the same table`);
  ok(/'lead_mark_wrong_number'/.test(read("src/lib/leadOutcome.ts")) && /'lead_clear_wrong_number'/.test(read("src/components/LeadStateStrip.tsx")) && /canClear && <button/.test(read("src/components/LeadStateStrip.tsx")), "the button marks it; the header shows it and only the admin gets Clear");
}

console.log("\n── Assign to a teammate (admin) ──");
{
  const bulk = read("src/components/BulkAssignSelect.tsx");
  ok(/'assign_lead'/.test(bulk) && /perms\.assignOwner && \(\s*\n\s*<BulkAssignSelect/.test(read("src/components/OutreachTable.tsx")), "Outreach selection: Assign to… (admin only), through assign_lead");
  ok(/They have been notified/.test(read("src/components/LeadOwnerControl.tsx")) && /No notice sent/.test(read("src/components/LeadOwnerControl.tsx")), "the popup's picker says whether the person was told (2026-09-30: only when they really were)");
}

console.log("\n── Find email ──");
{
  const btn = read("src/components/FindEmailButton.tsx");
  ok(btn.indexOf("'lead_find_email'") > 0 && btn.indexOf("'extract-email'") > btn.indexOf("'lead_find_email'") && /'lead_set_email'/.test(btn), "our records first, then the free website scrape, saved through the lead function");
  ok(/isAggregatorUrl\(site\)/.test(btn), "a directory listing is not their website — never scraped as one");
  /* 2026-10-02: admin only, and gone from the Inbox header (the Next Action is there instead). */
  for (const [p, re] of [["src/components/LeadDetailDialog.tsx", /!lead\.email && perms\.enrichLeads && <FindEmailButton/], ["src/components/ProspectFacts.tsx", /perms\.enrichLeads && <FindEmailButton leadId=\{lead\.id\}/]] as const) {
    ok(re.test(read(p)), `${p}: admin only, beside the email option, only when there is none`);
  }
  ok(!/FindEmailButton/.test(read("src/pages/Inbox.tsx")), "src/pages/Inbox.tsx: no Find email in the conversation header");
  const mig = read("supabase/migrations/20260929180000_lead_find_email.sql");
  ok((mig.match(/perform public\._require_work\(_lead_id\);/g) ?? []).length === 2, "both functions check role + ownership first");
  ok((mig.match(/where id = _lead_id and coalesce\(btrim\(email\), ''\) = ''/g) ?? []).length === 2, "⛔ both only FILL a blank email, never overwrite");
  ok(/siteInfo/.test(mig) && /onboarding_responses/.test(mig) && /l\.place_id = v_lead\.place_id/.test(mig), "sources: their crawl, their questionnaire, the same business on another row");
  ok(/revoke all on function public\.lead_find_email\(uuid\) from public, anon;/.test(mig) && /revoke all on function public\.lead_set_email\(uuid, text\) from public, anon;/.test(mig), "anon cannot call either");
  ok(/email_source: 'found in'/.test(read("src/lib/salesCrm.ts")) && /their website crawl/.test(activityDetail({ kind: "details_set", data: { email: "a@b.co", email_source: "website_crawl" } }, () => "") ?? ""), "History says where it was found");
}

console.log("\n── the Admin dashboard ──");
{
  /* 2026-09-30: the Admin dashboard became the control centre (docs/admin-control-centre.md) — Paul's
     later decision replaces the 2026-09-29 layout this block used to pin. */
  const dash = read("src/pages/Dashboard.tsx");
  ok(/from '@\/components\/salesDash\/ui'/.test(dash), "still drawn in the Sales dashboard's visual language");
  ok(/useAdminOverview/.test(dash) && !/useDashboardMetrics/.test(dash), "numbers come server-folded (fn admin-overview), never the whole book in the browser");
  for (const gone of ["TipBar", "AdminZone", "CampaignStatsSection", "ChannelPerformanceCard", "PipelineCard", "Quick Actions", "<NextActions ", "<FollowUpQueue", "<WaitingPanel", "<ActivityFeed", "<ClientDeliveryCard", "<NextActionsCard", "<AuditFunnelCard"]) ok(!dash.includes(gone), `removed: ${gone}`);
  /* 2026-10-02 (control-centre restructure): TeamComparison → TeamPerformanceTable, RevenuePanel → MoneyPanel. */
  for (const kept of ["FreeCheckProgressCard", "SubmissionsCard", "AttentionQueue", "TeamPerformanceTable", "MoneyPanel"]) ok(dash.includes(`<${kept}`), `kept/added: ${kept}`);
  ok(/\/admin\/api-usage/.test(dash), "API usage stays reachable (the cost panel's detail link)");
  ok(!/next_action:/.test(dash) && !/supabase\.from\(/.test(dash), "the dashboard writes nothing from the browser");
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
process.exit(f === 0 ? 0 : 1);
