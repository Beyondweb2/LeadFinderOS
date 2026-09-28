/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES: "REMOVE FROM MY LEADS" + "MOVE TO CAMPAIGN" FROM OUTREACH (2026-09-28).

   ⛔ The failures this guards: a remove that deletes (or makes a contacted lead look untouched and
   claimable again), a second campaign path beside lead_set_campaign, a Sales button that only the UI
   stops, and a Sales picker that can create a campaign. The live-database half — released / archived /
   refused per case, the pool and the claim afterwards, one and many campaign moves, another rep's
   lead, Paul's, a client — is supabase/tests/sales-remove-move-campaign.sql (always rolled back).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { leadPermissions, PERMISSION_MATRIX } from "../src/lib/access.ts";
import { archiveViewFor, rowsForArchiveView } from "../src/lib/outreachLoad.ts";
import { REMOVE_FROM_MY_LEADS_EXPLAINER, REMOVE_FROM_MY_LEADS_LABEL, campaignMoveText, refusalText, removeOutcomeText } from "../src/lib/salesCrm.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const MIG = read("supabase/migrations/20260928230000_sales_remove_and_move_campaign.sql");
const fn = (name: string) => MIG.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`))?.[0] ?? "";
const REMOVE = fn("sales_remove_leads");
const MOVE = fn("leads_set_campaign");
const HOOK = read("src/hooks/useOutreach.ts");
const TABLE = read("src/components/OutreachTable.tsx");
const PANEL = read("src/components/LeadCrmPanel.tsx");
const PAGE = read("src/pages/Outreach.tsx");

console.log("── permissions ──");
{
  const s = leadPermissions("sales"), a = leadPermissions("admin"), none = leadPermissions(null);
  ok(s.moveToCampaign && a.moveToCampaign && !none.moveToCampaign, "move to an existing campaign: admin and sales, nobody else");
  ok(s.removeFromMyLeads && !a.removeFromMyLeads && !none.removeFromMyLeads, "remove from my leads: sales only");
  ok(!s.campaigns && a.campaigns, "creating / editing campaigns stays the admin's");
  ok(!s.removeLeads, "sales still has no hard remove / reset");
  ok(PERMISSION_MATRIX.some((r) => /Remove from my leads/.test(r.feature)) && PERMISSION_MATRIX.some((r) => /existing campaign/.test(r.feature)), "the Team page matrix names both");
}

console.log("── sales_remove_leads: never a delete, the claim rule decides ──");
{
  ok(REMOVE.length > 0 && MOVE.length > 0, "both functions are in the migration");
  ok(!/\bdelete\s+from\b/i.test(MIG), "the migration deletes nothing");
  ok(/my_role\(\) is distinct from 'sales'/.test(REMOVE), "sales only (the admin gets sales_only)");
  ok(/for update/.test(REMOVE), "each lead is read under a row lock");
  ok(/assigned_to_user_id is distinct from v_uid or not public\.can_work_lead/.test(REMOVE), "only a lead assigned to the caller that they may work");
  ok(/lead_is_client\(/.test(REMOVE), "a client is refused");
  ok(/'queued'/.test(REMOVE) && /won_pending_onboarding/.test(REMOVE) && /onboarding_responses/.test(REMOVE), "an opener waiting to send and a won / onboarding lead are refused");
  const branch = REMOVE.match(/if public\.lead_contact_attempt_at\(v_id\) is null then([\s\S]*?)else([\s\S]*?)end if;\s*end loop/);
  ok(!!branch, "the choice is lead_contact_attempt_at — the claim rule's own test, every channel");
  ok(!!branch && /assigned_to_user_id = null/.test(branch[1]) && /'lead_unassigned'/.test(branch[1]) && /removed_from_my_leads/.test(branch[1]),
    "never contacted → unassigned, logged with the reason");
  ok(!!branch && /is_archived = true/.test(branch[2]) && !/assigned_to_user_id/.test(branch[2]) && /'archived_set'/.test(branch[2]),
    "contacted → archived, the OWNER IS KEPT (never looks untouched), logged");
  ok(!/status\s*=/.test(REMOVE.replace(/coalesce\(v_lead\.status[^)]*\)\s*=/g, "")), "status is never rewritten (removing is not a contact and not a stage)");
  ok(!/lead_activity[^;]*'(call_outcome|contact_logged)'/.test(REMOVE), "removing never writes a contact row");
  ok(/revoke all on function public\.sales_remove_leads\(uuid\[\]\) from public, anon/.test(MIG) && /grant execute on function public\.sales_remove_leads\(uuid\[\]\) to authenticated/.test(MIG), "anon revoked, authenticated granted");
}

console.log("── leads_set_campaign: the SAME rule as the workspace card ──");
{
  ok(/public\.lead_set_campaign\(v_id, _campaign_id\)/.test(MOVE), "every lead goes through lead_set_campaign (no second campaign path)");
  ok(!/update public\.outreach_leads/.test(MOVE), "…and it never writes the table itself");
  ok(/not exists \(select 1 from public\.campaigns where id = _campaign_id\)/.test(MOVE), "an unknown campaign moves nothing");
  ok(/exception when insufficient_privilege then\s*v_reason := 'not_yours'/.test(MOVE), "a lead the caller may not work is skipped and counted, not fatal");
  ok(!/insert into public\.campaigns/.test(MIG), "nothing creates a campaign");
  ok(/revoke all on function public\.leads_set_campaign\(uuid\[\], uuid\) from public, anon/.test(MIG), "anon revoked");
}

console.log("── the screens ──");
{
  ok(/if \(isSales\(\)\) \{\s*const r = await leadsSetCampaign\(/.test(HOOK), "a salesperson's bulk move calls leads_set_campaign (never a direct update)");
  ok(!/refuseForSales\('Moving leads between campaigns'\)/.test(HOOK), "the old 'admin only' refusal for moving campaigns is gone");
  ok(/const removeFromMyLeads = useCallback/.test(HOOK) && /salesRemoveLeads\(leadIds\)/.test(HOOK), "the hook's remove calls sales_remove_leads");
  ok(/onAssignCampaign && perms\.moveToCampaign/.test(TABLE) && /hideCreate=\{!perms\.campaigns\}/.test(TABLE), "bulk Move to campaign shows for sales, pick-only (no New / Manage)");
  ok(/onRemoveFromMyLeads && perms\.removeFromMyLeads/.test(TABLE) && /<AlertDialog open=\{removeMineOpen\}/.test(TABLE), "bulk Remove from my leads is behind a confirmation");
  ok(/onRemoveFromMyLeads=\{perms\.removeFromMyLeads/.test(PAGE) && /onAssignCampaign=\{perms\.moveToCampaign/.test(PAGE), "Outreach wires both by permission");
  ok(/leadPermissions\(role\)\.removeFromMyLeads && <RemoveFromMyLeads/.test(PANEL) && /salesRemoveLeads\(\[leadId\]\)/.test(PANEL), "the lead workspace has the same action, one lead");
  ok(/onRemoved=\{onClose\}/.test(read("src/components/LeadDetailDialog.tsx")), "…and closes the workspace once the lead has left the list");
  ok(/if \(!data\) \{\s*if \(roleRef\.current === 'sales'\)/.test(HOOK), "a lead no longer in the salesperson's view leaves their Outreach list");
  ok(!/Trash2/.test(PANEL.match(/function RemoveFromMyLeads[\s\S]*?\n}\n/)?.[0] ?? "Trash2"), "the workspace action has no delete icon");
}

console.log("── a removed (archived) lead leaves the salesperson's ACTIVE list (2026-09-28 closeout) ──");
{
  const rows = [{ id: "a", is_archived: false }, { id: "b", is_archived: true }, { id: "c", is_archived: null }];
  ok(archiveViewFor(true, false) === "active" && archiveViewFor(true, true) === "archived" && archiveViewFor(false, false) === "all" && archiveViewFor(false, true) === "all",
    "sales: active by default, archived on request; the admin keeps the unified list");
  ok(rowsForArchiveView(rows, "active").map((r) => r.id).join() === "a,c", "active view hides archived rows (absent = not archived)");
  ok(rowsForArchiveView(rows, "archived").map((r) => r.id).join() === "b", "archived view shows only archived rows — still viewable");
  ok(rowsForArchiveView(rows, "all").length === 3, "the admin still sees every row");
  ok(/const archiveView = archiveViewFor\(perms\.removeFromMyLeads && !isArchiveView, showArchived\)/.test(TABLE), "the table decides the view from the role, not a stored flag");
  ok(/result = rowsForArchiveView\(result, archiveView\)/.test(TABLE), "…and filters the list with the one rule");
  ok(/data-testid="filter-archived"/.test(TABLE) && /archiveView !== 'all' &&/.test(TABLE), "Filters → Archived exists for sales only");
  ok(/setShowArchived\(false\)/.test(TABLE), "Clear filters returns to the active list");
}

console.log("── the words ──");
{
  ok(REMOVE_FROM_MY_LEADS_LABEL === "Remove from my leads", "the label is Paul's wording");
  const all = REMOVE_FROM_MY_LEADS_EXPLAINER.join(" ");
  ok(/Available to claim/.test(all) && /archived/.test(all) && /Nothing is deleted/.test(all), "the confirmation says released, archived and nothing deleted");
  ok(/never goes back to Available to claim/.test(all), "…and that a contacted lead is never claimable again");
  ok(removeOutcomeText({ released: 1, archived: 2, skipped: { queued: 1 } }) ===
    "1 lead back in Available to claim · 2 contacted leads archived (still yours) · 1 not removed — " + refusalText("queued"), "the outcome sentence");
  ok(removeOutcomeText({}) === "Nothing changed", "…nothing done says so");
  ok(campaignMoveText({ moved: 3, skipped: { not_yours: 1 } }, "Spring roofers") === "3 moved to Spring roofers · 1 not moved — " + refusalText("not_yours"), "the move sentence");
  ok(campaignMoveText({ moved: 1 }, null) === "1 moved out of their campaign", "…and for No campaign");
  for (const code of ["sales_only", "queued", "onboarding", "not_yours", "no_leads", "too_many"]) ok(!refusalText(code).startsWith("Refused:"), `refusal '${code}' has words`);
}

console.log(f ? `\n${f} FAILURE(S)` : "\nall passed");
if (f) process.exit(1);
