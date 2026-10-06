/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OUTREACH LEAD OWNERSHIP (2026-10-05, fix/outreach-lead-ownership;
   docs/pre-sales-certification/outreach-ownership-safety.md).

   The rule (src/lib/outreachOwnerScope.ts) and the wiring that makes it binding: the page scopes the leads
   BEFORE the table, the scope is not remembered, a tick cannot outlive it, and a WhatsApp batch spanning
   owners needs "Queue across team". The server half is supabase/tests/outreach-ownership.sql (live, rolled
   back) plus the source checks at the bottom of this file.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  CLAIM_BATCH_MAX, contactScopeCheck, ownerScopeExplainer, crossOwnerHeadline, DEFAULT_OWNER_SCOPE, leadInOwnerScope, normaliseOwnerScope, ownerGroupsLine,
  ownerScopeLabel, OWNER_SCOPE_MINE, OWNER_SCOPE_TEAM, OWNER_SCOPE_UNASSIGNED, scopeLeads, scopeShowingLead,
} from "../src/lib/outreachOwnerScope.ts";
import { LAUNCH_SKIP_TEXT } from "../src/lib/campaignRules.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const PAUL = "paul-0000", A = "rep-a-000", B = "rep-b-000";
const leads = [
  { id: "p1", assigned_to_user_id: PAUL }, { id: "p2", assigned_to_user_id: PAUL },
  { id: "u1", assigned_to_user_id: null }, { id: "u2" } as { id: string; assigned_to_user_id?: string | null },
  { id: "a1", assigned_to_user_id: A }, { id: "a2", assigned_to_user_id: A },
  { id: "b1", assigned_to_user_id: B },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort().join(",");

// ── SALESPERSON ──────────────────────────────────────────────────────────────────────────────────
ok(ids(scopeLeads(leads, OWNER_SCOPE_MINE, "sales", A)) === "a1,a2", "sales: sees only own leads");
ok(ids(scopeLeads(leads, OWNER_SCOPE_TEAM, "sales", A)) === "a1,a2", "sales: asking for All team still gives only own leads");
ok(ids(scopeLeads(leads, B, "sales", A)) === "a1,a2", "sales: asking for another rep's scope still gives only own leads");
ok(normaliseOwnerScope(OWNER_SCOPE_TEAM, "sales", [A, B]) === OWNER_SCOPE_MINE, "sales: scope always normalises to My leads");
ok(!scopeLeads(leads, OWNER_SCOPE_MINE, "sales", A).some((l) => l.assigned_to_user_id == null), "sales: never the unassigned pool in Outreach");
{
  const own = scopeLeads(leads, OWNER_SCOPE_MINE, "sales", A);
  const selectAll = new Set(own.map((l) => l.id));
  ok([...selectAll].every((id) => id.startsWith("a")), "sales: Select all = only own visible leads");
  ok(contactScopeCheck(own, "sales", A).refuse === false, "sales: own batch may be queued");
  ok(contactScopeCheck([...own, leads[6]], "sales", A).refuse === true, "sales: a batch holding another rep's lead is REFUSED (not warned)");
  ok(contactScopeCheck([leads[2]], "sales", A).refuse === true, "sales: an unassigned lead in a batch is refused");
  ok(contactScopeCheck(own, "sales", A).needsConfirm === false, "sales: never offered a 'queue across team' route");
}
ok(scopeLeads(leads, OWNER_SCOPE_MINE, "sales", null).length === 0, "no signed-in id → nothing (fails closed)");
ok(scopeLeads(leads, OWNER_SCOPE_TEAM, null, PAUL).length === 0, "no role → nothing (fails closed)");

// ── ADMIN ────────────────────────────────────────────────────────────────────────────────────────
ok(DEFAULT_OWNER_SCOPE === OWNER_SCOPE_MINE, "admin: default scope is My leads");
ok(ids(scopeLeads(leads, DEFAULT_OWNER_SCOPE, "admin", PAUL)) === "p1,p2", "admin: My leads = ONLY leads Paul owns (no unassigned, no rep's lead)");
ok(!scopeLeads(leads, DEFAULT_OWNER_SCOPE, "admin", PAUL).some((l) => l.assigned_to_user_id == null), "admin: My leads excludes every unassigned lead");
ok(ids(scopeLeads(leads, A, "admin", PAUL)) === "a1,a2", "admin: can explicitly inspect one salesperson");
ok(ids(scopeLeads(leads, OWNER_SCOPE_UNASSIGNED, "admin", PAUL)) === "u1,u2", "admin: Unassigned = the pool only");
ok(ids(scopeLeads(leads, OWNER_SCOPE_TEAM, "admin", PAUL)) === "a1,a2,b1,p1,p2", "admin: All team = every OWNED lead (Paul + reps), unassigned NOT included");
ok(ownerScopeLabel(OWNER_SCOPE_TEAM, () => null) === "All team (owned)" && /Unassigned leads are not included/.test(ownerScopeExplainer(OWNER_SCOPE_TEAM, () => null)), "All team says on screen that it excludes unassigned");
ok(ownerScopeExplainer(OWNER_SCOPE_MINE, () => null) === "Leads you own." && /nobody owns/.test(ownerScopeExplainer(OWNER_SCOPE_UNASSIGNED, () => null)), "My leads / Unassigned explain themselves in one line");
ok(normaliseOwnerScope(undefined, "admin", [A]) === OWNER_SCOPE_MINE, "admin: absent scope → My leads");
ok(normaliseOwnerScope("all", "admin", [A]) === OWNER_SCOPE_MINE, "admin: the old remembered 'all' (Any owner) → My leads, never everyone");
ok(normaliseOwnerScope("someone-who-left", "admin", [A]) === OWNER_SCOPE_MINE, "admin: an unknown member id → My leads");
ok(normaliseOwnerScope(B, "admin", [A, B]) === B, "admin: a current member id is kept");
{
  // Select all in the default view = the scoped list; counts = the scoped list's length.
  const mine = scopeLeads(leads, DEFAULT_OWNER_SCOPE, "admin", PAUL);
  ok(mine.length === 2 && mine.every((l) => l.assigned_to_user_id === PAUL), "admin: default Select all / count holds only Paul's owned leads (2 of 7)");
  const pool = scopeLeads(leads, OWNER_SCOPE_UNASSIGNED, "admin", PAUL);
  ok(pool.length === 2 && contactScopeCheck(pool, "admin", PAUL).needsConfirm === false, "admin: Unassigned count = the pool only (2), one group");
  ok(contactScopeCheck([...mine, ...pool], "admin", PAUL).needsConfirm === true, "admin: Paul's + unassigned together are TWO owners (unassigned is not Paul's)");
  ok(contactScopeCheck(mine, "admin", PAUL).needsConfirm === false, "admin: queueing My leads needs no team confirmation");
  ok(contactScopeCheck(scopeLeads(leads, A, "admin", PAUL), "admin", PAUL).needsConfirm === false, "admin: one salesperson's leads = one owner, no confirmation");
  const team = scopeLeads(leads, OWNER_SCOPE_TEAM, "admin", PAUL);
  const chk = contactScopeCheck(team, "admin", PAUL);
  ok(chk.needsConfirm && chk.owners === 3 && !chk.refuse, "admin: All team across 3 owners requires confirmation");
  ok(chk.groups[0].self && chk.groups[0].count === 2, "admin: own group listed first, own leads only");
  ok(crossOwnerHeadline("queue WhatsApp", 37, 3) === "You're about to queue WhatsApp for 37 leads across 3 owners.", "admin: the confirmation headline is Paul's sentence");
  const line = ownerGroupsLine(chk.groups, (id) => ({ [A]: "test1", [B]: "Test" } as Record<string, string>)[id]);
  ok(line === "You 2 · test1 2 · Test 1", `admin: owners and counts are named (${line})`);
  const withPool = ownerGroupsLine(contactScopeCheck(leads, "admin", PAUL).groups, () => null);
  ok(/ · Unassigned 2$/.test(withPool), `unassigned is named as its own owner group, last (${withPool})`);
}
ok(ownerScopeLabel(OWNER_SCOPE_MINE, () => null) === "My leads" && ownerScopeLabel(OWNER_SCOPE_UNASSIGNED, () => null) === "Unassigned", "labels: My leads / Unassigned");
ok(scopeShowingLead({ assigned_to_user_id: A }, PAUL) === A && scopeShowingLead({ assigned_to_user_id: null }, PAUL) === OWNER_SCOPE_UNASSIGNED && scopeShowingLead({ assigned_to_user_id: PAUL }, PAUL) === OWNER_SCOPE_MINE, "a lead opened by link moves the view to its owner (unassigned → Unassigned)");

// ── WIRING: the page scopes before the table, the scope is not remembered ─────────────────────────
const page = read("src/pages/Outreach.tsx");
ok(/<OutreachTable[\s\S]*?leads=\{scopedLeads\}/.test(page), "Outreach page passes the SCOPED leads to the table");
ok(!/<OutreachTable[^>]*?leads=\{allLeads\}/.test(page), "Outreach page never passes the unscoped list to the table");
/* The WhatsApp queue (2026-10-06) is its own page and reads its own rows from sales_leads, scoped by the SERVER —
   the admin's is the whole team's, whatever the Outreach owner scope says. Outreach shows only its summary. */
ok(/<WhatsAppQueueSummary \/>/.test(page) && !/<WhatsAppQueuePanel/.test(page) && !/<WhatsAppQueueSummary[^>]*leads=/.test(page), "the queue is not built from the scoped Outreach list (its own server-scoped read; admin = whole team)");
ok(/useState<OwnerScope>\(DEFAULT_OWNER_SCOPE\)/.test(page) && !/usePersistedState[^\n]*[Oo]wner/.test(page), "the owner scope starts at My leads on every visit (not persisted)");
ok(/onOwnerScopeChange=\{role === 'admin' \? /.test(page), "only the admin gets the owner control");
const table = read("src/components/OutreachTable.tsx");
ok(!/Any owner/.test(table) && !/Any owner/.test(read("src/components/OwnerFilterSelect.tsx")), "'Any owner' is gone");
ok(!/ownerFilter/.test(table), "the table keeps no owner filter of its own (nothing to restore from a saved state)");
ok(/const selectedIds = useMemo\(/.test(table) && /scopeLeadIds\.has/.test(table), "selection is the ticks INTERSECTED with the scoped leads");
ok(/useEffect\(\(\) => \{ setSelectedIds\(new Set\(\)\); \}, \[ownerScope\]\)/.test(table), "changing the owner scope clears the ticks");
{
  const h = table.slice(table.indexOf("const handleQueueForWhatsApp"), table.indexOf("// Archive selected leads"));
  const guard = h.indexOf("contactScopeCheck(");
  ok(guard > 0 && guard < h.indexOf("handleQueueContactFollowup()") && guard < h.indexOf("handleSalesQueue(template)") && guard < h.indexOf("onUpdateLead(id, patch)"),
    "the queue handler checks owners BEFORE any queue write (opener, follow-up lane, sales path)");
  ok(/needsConfirm && !opts\.crossOwnerConfirmed/.test(h), "a cross-owner batch without the confirmation does not queue");
  ok(/ownerCheck\.refuse/.test(h), "a refused (sales) batch does not queue");
}
ok(/Queue across team/.test(table) && /crossOwnerConfirmed: true/.test(table), "the second step says 'Queue across team' and is the only caller passing the confirmation");
ok(/<AlertDialogCancel autoFocus>Cancel<\/AlertDialogCancel>/.test(table), "Cancel is the default focus on the cross-owner confirmation");

// ── SERVER ───────────────────────────────────────────────────────────────────────────────────────
const mig = read("supabase/migrations/20261009150000_campaign_launch_owner_scope.sql");
ok(/create or replace function public\.campaign_launch\(_campaign_id uuid\)/.test(mig), "migration re-creates campaign_launch (same signature)");
ok(/and o\.assigned_to_user_id = v_owner\s/.test(mig), "campaign launch queues only the campaign owner's leads");
ok(/'other_owner'/.test(mig) && !!LAUNCH_SKIP_TEXT.other_owner, "skipped other owners are reported (other_owner), with words on screen");
ok(/public\.sales_queue_opener\(v_chunk, v_template\)/.test(mig), "launch still goes through sales_queue_opener (the one opener door + contact guard)");
const enrich = read("supabase/functions/enrich-lead/index.ts");
ok(enrich.indexOf("mayLookUpBusiness(service, who.actor, { placeId })") > 0
  && enrich.indexOf("mayLookUpBusiness(service, who.actor, { placeId })") < enrich.indexOf('.from("enrichment_cache")'),
  "enrich-lead checks the place id's owner BEFORE reading the cache keyed by it");
const queue = read("supabase/functions/process-whatsapp-queue/index.ts");
{
  const cc = queue.slice(queue.indexOf('if (mode === "contact_check")'));
  const cut = cc.indexOf("if (salesActor && asked.length)");
  ok(cut > 0 && cut < cc.indexOf('.from("contact_suppressions")') && cut < cc.indexOf('from("whatsapp_messages")'),
    "contact_check: a salesperson's phones are cut to their own leads before any history / suppression read");
}
// FIND LEADS OWNERSHIP: the person who adds it owns it — decided by the DATABASE from the signed-in caller.
const addMig = read("supabase/migrations/20261009160000_lead_owner_on_add.sql");
const has = (hay: string, needle: string) => hay.replace(/\s+/g, " ").includes(needle);
ok(has(addMig, "before insert on public.outreach_leads") && has(addMig, "new.assigned_to_user_id := v_uid;"), "a team member's insert with no owner is owned by the caller (server trigger)");
ok(has(addMig, "if v_uid is null then return new; end if;"), "an insert with no signed-in user (system / service role) stays unassigned");
ok(has(addMig, "if v_role = 'sales' and new.assigned_to_user_id is not null and new.assigned_to_user_id <> v_uid then raise exception 'owner_not_yours'"), "a salesperson can never insert a lead owned by someone else");
ok(!/\bupdate\s+public\.outreach_leads\b/i.test(addMig), "prospective only: the migration rewrites no existing lead");
const outreachHook = read("src/hooks/useOutreach.ts");
{
  const add = outreachHook.slice(outreachHook.indexOf("const addLead = useCallback"), outreachHook.indexOf("const logActivity"));
  ok(has(add, "assigned_to_user_id: user.id,") && has(add, "added_by_user_id: user.id,"), "Find Leads add (admin) also sends the adding person as owner");
}
ok(has(read("supabase/tests/outreach-ownership.sql"), "'assigned_to_user_id', 'bbbbbbbb-0000-4000-8000-00000000000b'"), "live suite tries a salesperson nominating another owner");
// LAUNCH: unassigned members are nobody's
ok(has(mig, "and o.assigned_to_user_id = v_owner order by o.created_at") && !has(mig, "v_owner_admin"), "campaign launch queues ONLY the owner's leads — unassigned is not the admin's");
ok(has(mig, "jsonb_build_object('unassigned', v_unowned)") && !!LAUNCH_SKIP_TEXT.unassigned, "unassigned campaign members are reported (skipped.unassigned), with words on screen");
// CLAIM
ok(CLAIM_BATCH_MAX === 200 && has(table, "perms.assignOwner && ownerScope === OWNER_SCOPE_UNASSIGNED && (") && has(table, "leadRpc('assign_lead', { _lead_id: id, _to_user_id: user.id })"), "Claim for me: Unassigned view only, through assign_lead to yourself");
ok(has(table, ".slice(0, CLAIM_BATCH_MAX)") && has(table, "!l.assigned_to_user_id"), "Claim takes only still-unowned ticked leads, at most CLAIM_BATCH_MAX per press");
const sqlSuite = read("supabase/tests/outreach-ownership.sql");
for (const name of ["A sees only own lead", "queue B / unassigned / Paul", "Next Action on B''s lead refused", "lead_set_stage on B''s lead refused",
  "cannot pull B / Paul leads into own campaign", "add a lead → owned by A", "membership never overrides ownership",
  "a Find Leads add with no owner field is owned by Paul", "a direct insert owned by B is refused", "skipped as unassigned",
  "claiming an unassigned lead makes it his", "an insert with no signed-in user stays unassigned"]) {
  ok(sqlSuite.includes(name), `live SQL suite covers: ${name.replace(/''/g, "'")}`);
}

console.log(f ? `\n${f} FAILED` : "\nall passed");
process.exit(f ? 1 : 0);
