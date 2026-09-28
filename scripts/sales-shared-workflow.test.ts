/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE WORKFLOW FOR ADMIN AND SALES — the same Outreach and Inbox (Paul, 2026-09-27).

   Pins, from the source and the pure rules (the live proof is supabase/tests/sales-shared-workflow.sql):
     · Sales reads leads only from the safe sales_leads view — its column list here equals the view in
       the migration; no money/delivery/admin-note column reaches the browser; never select('*');
     · every salesperson edit is a positive-match plan onto the ownership-checked lead functions,
       and an unknown key writes NOTHING (never half a change);
     · the new functions check role + ownership first and are not callable by anon;
     · one Outreach page and one Inbox page, no second CRM: no SalesOutreach/SalesInbox, My Leads gone;
     · Review Replies is admin-only in the server function too;
     · the useful My Leads functionality lives in the shared lead detail (LeadCrmPanel);
     · Available to claim is inside Outreach, through the locking claim_lead;
     · the recent Inbox work (media, voice notes, attachments, layout) and the speed pass are intact.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { SALES_VIEW_COLUMNS, SALES_LIST_COLUMNS, OUTREACH_LIST_COLUMNS, leadSourceFor } from "../src/lib/outreachLeadColumns.ts";
import { planSalesPatch } from "../src/lib/salesPatchPlan.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const exists = (p: string) => fs.existsSync(path.join(root, p));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

console.log("── the safe view is the salesperson's only lead source ──");
{
  /* The NEWEST definition of the view (20260928120000 appended lead_source after amount_paid;
     20260928160000 appended services_included + service_areas; 20260928180000 domain_control;
     20260929000000 town_fetch_note). */
  const mig = read("supabase/migrations/20260929000000_sales_view_town_note.sql");
  const view = mig.slice(mig.indexOf("create or replace view public.sales_leads"), mig.indexOf("from public.outreach_leads l", mig.indexOf("create or replace view public.sales_leads")));
  const cols = [...view.matchAll(/(null::numeric as amount_paid)|l\.([a-z_]+)/g)].map((m) => (m[1] ? "amount_paid" : m[2]));
  ok(cols.length === SALES_VIEW_COLUMNS.length && cols.every((c, i) => c === SALES_VIEW_COLUMNS[i]), `SALES_VIEW_COLUMNS equals the view's ${cols.length} columns, in order`);
  ok(/null::numeric as amount_paid/.test(view), "the view's amount_paid is a literal NULL");
  for (const secret of ["notes", "paid_for", "payment_date", "subscription_status", "delivery_checklist", "delivery_notes", "project_value", "user_id", "stripe_customer_id", "baseline_audit_id"]) {
    ok(!(SALES_VIEW_COLUMNS as readonly string[]).includes(secret), `the view carries no ${secret}`);
  }
  ok(SALES_LIST_COLUMNS.every((c) => (OUTREACH_LIST_COLUMNS as readonly string[]).includes(c) && (SALES_VIEW_COLUMNS as readonly string[]).includes(c)), "the sales list is the admin list cut to the view");
  ok(leadSourceFor("sales").table === "sales_leads" && leadSourceFor("admin").table === "outreach_leads" && leadSourceFor(null).table === "outreach_leads", "sales → view; admin (and anything else) → the table, as before");
  const inboxHook = read("src/hooks/useInbox.ts");
  ok(/return role === 'sales' \? 'sales_leads' : 'outreach_leads';/.test(inboxHook), "the Inbox reads the same way");
  ok(/sb\.from\(leadTable\)\.select\(LEAD_COLUMNS\)/.test(inboxHook) && /sb\.from\(leadTable\)\.select\(`\$\{LEAD_COLUMNS\}, is_archived`\)\.gte\('updated_at', since\)/.test(inboxHook) && /sb\.from\(leadTable\)\.select\(`\$\{LEAD_COLUMNS\}, is_archived`\)\.eq\('id', leadId\)/.test(inboxHook), "…for the full load, the catch-up and the single-lead refresh");
  ok(!/from\('outreach_leads'\)/.test(strip(inboxHook)), "useInbox names outreach_leads nowhere else");
  const lc = inboxHook.match(/const LEAD_COLUMNS = '([^']+)'/)?.[1].split(", ") ?? [];
  ok(lc.length > 10 && lc.every((c) => (SALES_VIEW_COLUMNS as readonly string[]).includes(c)), "every Inbox lead column exists in the view (a salesperson's read cannot fail on one)");
  for (const p of ["src/components/LeadCrmPanel.tsx", "src/components/LeadOwnerControl.tsx", "src/components/LeadDetailDialog.tsx", "src/hooks/useOutreach.ts"]) {
    ok(/leadSourceFor\(/.test(read(p)), `${p} reads through leadSourceFor`);
  }
  ok(!/select\('\*'\)/.test(strip(read("src/hooks/useOutreach.ts")).slice(strip(read("src/hooks/useOutreach.ts")).indexOf("const fetchLeads"), strip(read("src/hooks/useOutreach.ts")).indexOf("const fetchOutreachHistory"))), "no select('*') in the list read (the speed pass is kept)");
}

console.log("\n── every salesperson edit is a server function, positive match ──");
{
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  ok(eq(planSalesPatch({ status: "interested" }).steps, [{ fn: "lead_mark_interested", on: true }]), "Interested → the ⭐ flag (as on the admin's screens), not a status");
  ok(eq(planSalesPatch({ status: "price_given" }).steps, [{ fn: "lead_set_stage", status: "price_given" }]), "an allowed stage → lead_set_stage");
  ok(planSalesPatch({ status: "payment_received" }).refused.includes("status") && planSalesPatch({ status: "payment_received" }).steps.length === 0, "a client status is refused, nothing written");
  ok(planSalesPatch({ status: "queued", previous_status: "not_contacted" }).steps.length === 0, "the admin's direct queue write is refused (sales queues through sales_queue_opener)");
  ok(eq(planSalesPatch({ status: "not_interested", is_potential_work: false, is_archived: true }).steps.map((s) => s.fn), ["lead_set_stage", "lead_mark_interested", "lead_set_archived"]), "Not interested unstars and archives, like the admin's");
  const fu = planSalesPatch({ next_action_date: "2026-10-01" }).steps[0] as { fn: string; hasNextAction: boolean; hasDate: boolean };
  ok(fu.fn === "lead_set_follow_up" && fu.hasDate && !fu.hasNextAction, "a date-only change → lead_set_follow_up, the action is READ, not blanked");
  ok(/select\('next_action, next_action_date, next_action_note'\)/.test(read("src/lib/leadRpc.ts")) && /_note: cur\.next_action_note/.test(read("src/lib/leadRpc.ts")), "…and the follow-up note is carried over, never wiped");
  ok(eq(planSalesPatch({ contact_name: "Mark" }).steps, [{ fn: "lead_set_details", contact_name: "Mark", search_keyword: null, search_location: null }]), "contact name → lead_set_details, the other two left alone (null)");
  ok(eq(planSalesPatch({ search_keyword: "plumbers", search_location: "Leeds" }).steps, [{ fn: "lead_set_details", contact_name: null, search_keyword: "plumbers", search_location: "Leeds" }]), "trade + town → lead_set_details");
  for (const k of ["business_name", "phone", "email", "website", "amount_paid", "notes", "campaign_id", "product", "delivery_checklist", "image_url", "whatsapp_template", "user_id", "assigned_to_user_id"]) {
    const p = planSalesPatch({ [k]: "x", status: "price_given" });
    ok(p.refused.includes(k) && p.steps.length === 0, `${k} is refused — and the whole patch writes nothing`);
  }
  ok(planSalesPatch({ whatsapp_status: "yes", contact_method: "whatsapp" }).steps.length === 0 && planSalesPatch({ whatsapp_status: "yes", contact_method: "whatsapp" }).refused.length === 0, "server-written / cosmetic keys are an accepted no-op");
  const hook = read("src/hooks/useOutreach.ts");
  ok(/if \(isSales\(\)\) return salesUpdateLead\(leadId, updates as Record<string, unknown>\);\n\s+const \{ data, error \} = await supabase\n\s+\.from\('outreach_leads'\)\n\s+\.update\(updates\)/.test(hook), "useOutreach.updateLead routes a salesperson before the direct write");
  for (const fn of ["deleteLead", "deleteMultiple", "resetMultiple", "resetToFreshMultiple", "deleteAllLeads", "bulkImportLeads", "bulkLookupPhones", "removeFreshLead", "retryPhoneFetch"]) {
    const at = hook.indexOf(`const ${fn} = useCallback(`);
    ok(at > 0 && /if \(isSales\(\)\) \{ refuseForSales\(/.test(hook.slice(at, at + 400)), `${fn} refuses a salesperson before writing`);
  }
  {
    /* assignCampaign is no longer admin-only (2026-09-28): a salesperson moves their OWN leads through
       leads_set_campaign, which runs lead_set_campaign per lead — routed BEFORE the admin's direct write. */
    const at = hook.indexOf("const assignCampaign = useCallback(");
    const body = hook.slice(at, hook.indexOf("const removeFromMyLeads", at));
    const rpc = body.indexOf("leadsSetCampaign("), direct = body.indexOf(".from('outreach_leads')");
    ok(at > 0 && rpc > 0 && direct > rpc, "assignCampaign routes a salesperson through leads_set_campaign before the direct write");
  }
  for (const fn of ["archiveLeadInternal", "unarchiveLead", "archiveMultiple", "unarchiveMultiple", "markMultipleAsInterested", "updateStatus"]) {
    const at = hook.indexOf(`const ${fn} = useCallback(`);
    ok(at > 0 && /if \(isSales\(\)\)/.test(hook.slice(at, at + 500)) && /salesUpdateLead\(/.test(hook.slice(at, at + 500)), `${fn} goes through the lead functions for a salesperson`);
  }
  const inbox = strip(read("src/pages/Inbox.tsx"));
  ok(/perms\.editLeadRecord\n?\s*\? await updateLeadStatus\(c\.leadId, status\)\n?\s*: await salesPatchLead\(c\.leadId, \{ status \}\)/.test(inbox), "the Inbox status pill routes a salesperson through the lead functions");
  ok((inbox.match(/leadRpc\('lead_set_details'/g) ?? []).length === 2, "the Inbox's contact-name and trade/town saves use lead_set_details for a salesperson");
}

console.log("\n── the new functions (migration 20260927140000) ──");
{
  const mig = read("supabase/migrations/20260927140000_sales_shared_workflow.sql").replace(/^\s*--.*$/gm, "");
  for (const fn of ["lead_mark_interested", "lead_set_details", "lead_set_archived"]) {
    const body = mig.slice(mig.indexOf(`create or replace function public.${fn}(`), mig.indexOf("$$;", mig.indexOf(`create or replace function public.${fn}(`)));
    ok(/security definer set search_path = public/.test(body), `${fn}: security definer with a fixed search_path`);
    ok(/begin\n\s+perform public\._require_work\(_lead_id\);/.test(body), `${fn}: the role + ownership check is the first thing it does`);
    ok(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`).test(mig), `${fn}: not callable by anon`);
    ok(/insert into public\.lead_activity/.test(body), `${fn}: logs to the activity timeline`);
  }
  const det = mig.slice(mig.indexOf("create or replace function public.lead_set_details("), mig.indexOf("$$;", mig.indexOf("create or replace function public.lead_set_details(")));
  const setCols = [...det.matchAll(/^\s+([a-z_]+)\s+= case when/gm)].map((m) => m[1]);
  ok(setCols.join(",") === "contact_name,search_keyword,search_location", "lead_set_details writes exactly contact name, trade and town");
  ok(!/drop (table|view|function|policy)|delete from|truncate/i.test(mig.replace(/drop constraint lead_activity_kind_check/, "")), "the migration is additive (the only drop is the activity kind check, re-added wider in the same statement)");
  ok(!/policy/i.test(mig), "no RLS policy is created, dropped or widened");
}

console.log("\n── one Outreach, one Inbox, no second CRM ──");
{
  ok(!exists("src/pages/SalesHome.tsx") && !exists("src/pages/SalesLead.tsx"), "the My Leads pages are gone");
  const pages = fs.readdirSync(path.join(root, "src/pages"));
  ok(!pages.some((p) => /^(Sales|Admin)(Outreach|Inbox)/.test(p)), "no SalesOutreach / AdminOutreach / SalesInbox fork");
  const out = read("src/pages/Outreach.tsx");
  ok(/<OutreachTable/.test(out) && /useLeadPermissions\(\)/.test(out), "Outreach renders the one OutreachTable with role-aware permissions");
  ok(!/AvailableToClaim|claimPool/.test(out), "no Available to claim inside Outreach (removed 2026-09-28)");
  const table = strip(read("src/components/OutreachTable.tsx"));
  for (const [gate, what] of [["perms.removeLeads", "remove/reset"], ["perms.importLeads", "import"], ["perms.enrichLeads", "enrichment"], ["perms.bulkAudits", "bulk audits"], ["perms.campaigns", "campaigns"], ["perms.product", "product"], ["perms.crawlSite", "crawl"]]) {
    ok(table.includes(gate), `the table withholds ${what} by permission (${gate})`);
  }
  ok(/<HookAuditDialog lead=\{auditLead\}/.test(table) && /setAuditLead\(lead\)/.test(table), "every role's audit button opens the Hook Audit popup (2026-09-28; the AI Audit page is the admin's advanced link inside it)");
  ok(/lead\.assigned_to_user_id && lead\.assigned_to_user_id !== user\?\.id/.test(table), "the row shows who owns a lead that is not yours");
  const dialog = read("src/components/LeadDetailDialog.tsx");
  ok(/<LeadWorkPanel leadId=\{lead\.id\}( onRemoved=\{onClose\})? \/>/.test(dialog) && /<LeadHistoryPanel leadId=\{lead\.id\} \/>/.test(dialog) && /<LeadHookPanel leadId=\{lead\.id\} \/>/.test(dialog), "the shared lead detail carries the CRM panels (both roles, Outreach and Inbox)");
  for (const g of ["perms.clientDelivery && !isDemoLead(lead.id) && (\n          <LeadDeliveryCockpit", "{perms.clientDelivery && (\n            <section className={CARD}>\n              <SectionLabel icon={PoundSterling}", "{perms.privateNote && (", "{perms.clientDelivery && !isPaidLead(lead) && ("]) {
    ok(dialog.includes(g), `the detail withholds: ${g.split("\n")[0].slice(0, 60)}`);
  }
  const crm = read("src/components/LeadCrmPanel.tsx");
  for (const fn of ["lead_set_follow_up", "lead_set_call_booked", "lead_log_contact", "lead_set_website_control", "lead_add_note"]) ok(crm.includes(`'${fn}'`), `the CRM panel saves through ${fn}`);
  ok(/<LeadOwnerControl leadId=\{lead\.id\} \/>/.test(crm) && /<HookVisibilityCard/.test(crm) && /useLeadActivity\(leadId\)/.test(crm), "…with the owner, the Hook Audit and the activity timeline");
  ok(!/\.from\('outreach_leads'\)\.update|\.update\(/.test(strip(crm)), "…and never writes a lead row directly");
  const owner = read("src/components/LeadOwnerControl.tsx");
  ok(/if \(!canAssign\)/.test(owner) && /leadPermissions\(role\)\.assignOwner/.test(owner), "a salesperson sees the owner; only the admin reassigns");
  const inboxPage = read("src/pages/Inbox.tsx");
  ok(/\{perms\.queueControls && <AutoReplyToggle \/>\}/.test(inboxPage), "the Inbox's automation settings are admin-only");
  ok(/perms\.queueControls && <SelectItem value=\{HOOK_DUE_FILTER\}>/.test(inboxPage) && /perms\.queueControls && <SelectItem value=\{CONTACT_DUE_FILTER\}>/.test(inboxPage), "…and the follow-up lanes (they stamp lead rows)");
  ok(/active\.leadId && maySetStatus\(perms, 'closed'\) && \(/.test(inboxPage), "Remove-from-inbox (mark Closed) is not offered to a salesperson");
  ok(/perms\.clientDelivery && active\.leadId && \(\n\s+<WelcomePackButton/.test(inboxPage), "the welcome pack is client delivery — admin only");
}

console.log("\n── Review Replies: admin only, at the server too ──");
{
  const rr = read("supabase/functions/review-reply/index.ts");
  ok(/if \(role !== "admin"\) return json\(\{ ok: false, error: "admin_only" \}, 403\);/.test(rr), "review-reply refuses anyone who is not the admin");
  ok(rr.indexOf('error: "admin_only"') < rr.indexOf("OPENAI_API_KEY"), "…before it spends anything");
}

console.log("\n── the recent Inbox and speed work is intact ──");
{
  const inbox = read("src/pages/Inbox.tsx");
  for (const [needle, what] of [["<VoiceNoteRecorder", "voice notes"], ["<AttachmentPicker", "attachments"], ["MessageMedia", "media viewing"], ["windowFor(", "the 24-hour window"], ["<LeadDetailFromInbox", "the lead detail overlay"]]) {
    ok(inbox.includes(needle), `the Inbox still has ${what}`);
  }
  ok(/useOutreach\(\{ history: false(, progressive: true)? \}\)/.test(read("src/pages/Outreach.tsx")), "Outreach still opts out of the history download");
  ok(/prefetchOutreachAuditMap\(queryClient, user\.id\)/.test(read("src/pages/Outreach.tsx")), "…and still prefetches the audit map");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
