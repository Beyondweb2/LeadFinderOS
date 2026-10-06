/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WHATSAPP QUEUE — ONE UI, BOTH ROLES (2026-10-06, fix/whatsapp-queue-role-parity).
   Before: the admin had the queue panel on Outreach; a salesperson had a separate, simplified
   "Your leads queued" list (MyWhatsAppQueuePanel). Now both open the SAME component on /whatsapp-queue;
   Outreach shows only a summary + "Open queue". The differences are data scope (the server's) and the
   team controls (the admin's). This replaces scripts/sales-queue-panel.test.ts, which tested the deleted panel.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  deriveQueue, queueSummaryParts, recordQueueBatch, readQueueBatch, clearQueueBatch, batchHeadline,
  QUEUE_ROW_STATE, QUEUE_ROW_FILTER, WHATSAPP_QUEUE_KEY, BATCH_SHOWN_MS, type QueueRow,
} from "../src/lib/whatsappQueueView.ts";
import { canOpenRoute, leadPermissions, SALES_ROUTE_PATTERNS, PERMISSION_MATRIX } from "../src/lib/access.ts";
import { BOOK_WIDE_LEAD_KEYS } from "../src/lib/leadSync.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const walk = (d: string): string[] => fs.readdirSync(path.join(root, d), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []);
const SRC = walk("src").map((p) => ({ p: p.replace(/\\/g, "/"), t: strip(read(p)) }));

console.log("── one component, both roles ──");
{
  ok(!fs.existsSync(path.join(root, "src/components/MyWhatsAppQueuePanel.tsx")), "the separate salesperson mini-queue component is deleted");
  ok(!SRC.some((s) => /MyWhatsAppQueuePanel|useMyWhatsAppQueue|my-whatsapp-queue/.test(s.t)), "nothing in src references it any more");
  const rowRenderers = SRC.filter((s) => /data-testid="queue-row"/.test(s.t)).map((s) => s.p);
  ok(rowRenderers.length === 1 && rowRenderers[0] === "src/components/WhatsAppQueuePanel.tsx", `exactly one component renders queue rows (${rowRenderers.join(", ")})`);
  const panelUsers = SRC.filter((s) => /<WhatsAppQueuePanel\b/.test(s.t)).map((s) => s.p);
  ok(panelUsers.length === 1 && panelUsers[0] === "src/pages/WhatsAppQueue.tsx", `the queue panel is mounted in one place — the queue page (${panelUsers.join(", ")})`);
  const page = strip(read("src/pages/WhatsAppQueue.tsx"));
  ok(/<WhatsAppQueuePanel \/>/.test(page) && !/queueControls\s*&&\s*<WhatsAppQueuePanel|!perms\.queueControls/.test(page), "the page renders the SAME panel for both roles (no role fork around it)");
  const app = read("src/App.tsx");
  ok(/<Route path="\/whatsapp-queue" element=\{<WhatsAppQueue \/>\} \/>/.test(app), "route /whatsapp-queue inside the operator shell");
  ok(SALES_ROUTE_PATTERNS.includes("/whatsapp-queue") && canOpenRoute("sales", "/whatsapp-queue") && canOpenRoute("admin", "/whatsapp-queue"), "both roles may open the queue page");
  ok(!canOpenRoute(null, "/whatsapp-queue"), "no role (disabled / login off) → refused");
  ok(PERMISSION_MATRIX.some((r) => /WhatsApp queue/.test(r.feature) && /own leads only/.test(r.sales)), "the permission matrix says Sales sees their own queue rows");
}

console.log("\n── Outreach: a summary and a shortcut, never a second queue ──");
{
  const out = strip(read("src/pages/Outreach.tsx"));
  ok((out.match(/<WhatsAppQueueSummary \/>/g) ?? []).length === 1, "Outreach renders the summary card once");
  ok(!/queueControls\s*&&\s*<WhatsAppQueueSummary|<WhatsAppQueuePanel|MyWhatsAppQueuePanel/.test(out), "…for both roles, and no queue panel or mini-queue on Outreach");
  const sum = strip(read("src/components/WhatsAppQueueSummary.tsx"));
  ok(/WHATSAPP_QUEUE_PATH = '\/whatsapp-queue'/.test(read("src/components/WhatsAppQueueSummary.tsx")) && /to=\{WHATSAPP_QUEUE_PATH\}[^>]*data-testid="open-queue"/.test(sum), "\"Open queue\" goes to the one queue page");
  ok(!/queue-row|leadRpc|lead_unqueue|\.map\(\(l\)/.test(sum), "the summary lists no rows and offers no queue actions");
  ok(/useWhatsAppQueue\(\)/.test(sum) && /deriveQueue\(/.test(sum), "its numbers come from the same read and the same fold as the queue page");
}

console.log("\n── the data: server-scoped, one read for both roles ──");
{
  const hook = strip(read("src/hooks/useWhatsAppQueue.ts"));
  ok(/\.from\('sales_leads'\)\.select\(QUEUE_ROW_COLUMNS\)/.test(hook) && /\.or\(QUEUE_ROW_FILTER\)/.test(hook), "rows come from the server-scoped sales_leads view");
  ok(!/assigned_to_user_id|user_id|created_by|role|queueControls/.test(hook), "no owner filter and no role branch in the browser — the server decides");
  ok(/fetchAllRows</.test(hook) && /\.order\('id'/.test(hook), "paged and totally ordered (never cut at 1,000)");
  ok(/refetchInterval: \(q\) => \(\(q\.state\.data\?\.length \?\? 0\) > 0 \? QUEUE_POLL_MS : false\)/.test(hook), "one poll, both roles, only while something waits");
  ok(/window\.addEventListener\(QUEUE_CHANGED_EVENT, h\)/.test(hook), "re-reads at once on a queue-changed notice");
  ok(BOOK_WIDE_LEAD_KEYS.some((k) => JSON.stringify(k) === JSON.stringify(WHATSAPP_QUEUE_KEY)), "any lead change notice refreshes the queue (leadSync key = WHATSAPP_QUEUE_KEY)");
  ok(QUEUE_ROW_FILTER === "status.eq.queued,contact_followup_queued_at.not.is.null,hook_followup_queued_at.not.is.null", "every lane, nothing else");
  const sql = read("supabase/migrations/20261006130000_lead_unqueue.sql");
  ok(/if public\.my_role\(\) is null then raise exception 'no_role'/.test(sql) && /if not public\.can_work_lead\(_lead_id\) then return jsonb_build_object\('ok', false, 'error', 'not_yours'\)/.test(sql), "lead_unqueue: role, then may this person work this lead");
  ok(/if v_status is distinct from 'queued' then return jsonb_build_object\('ok', true, 'unchanged', true\)/.test(sql), "only a lead still waiting changes — a sent message is never touched");
  ok(/revoke all on function public\.lead_unqueue\(uuid\) from public, anon;/.test(sql), "not callable by anon");
}

console.log("\n── the panel: same states, same refresh; team controls admin-only ──");
{
  const panel = strip(read("src/components/WhatsAppQueuePanel.tsx"));
  ok(/const teamControls = perms\.queueControls;/.test(panel), "the one switch is the permission, never a second component");
  ok(/teamControls && <>\s*<Button[\s\S]*?togglePause[\s\S]*?runTick[\s\S]*?<\/>\}/.test(panel), "Pause / Resume and Run tick render only for the admin");
  ok(/teamControls && <Stat label="Sent today"/.test(panel) && /teamControls && <Stat label="Next send"/.test(panel), "sent today / cap and the next paced send are admin-only tiles");
  ok(/teamControls && team && \(team\.testMode/.test(panel), "test / live mode is admin-only");
  ok(/const refreshTeam = useCallback\(async \(fresh = false\) => \{\s*if \(!teamControls\) return;/.test(panel), "the team status ('status' mode) is never requested for Sales");
  ok(/onRemove=\{teamControls \? \(\) => void removeContactFollowup\(l\) : undefined\}/.test(panel), "cancelling a no-reply follow-up is the admin's");
  ok(/onRemove=\{\(\) => void removeFromQueue\(l\)\}/.test(panel) && /leadRpc\('lead_unqueue', \{ _lead_id: l\.id \}\)/.test(panel), "removing a waiting opener: both roles, the same server act (lead_unqueue)");
  ok(!/onUpdateLead|\.update\(\{ status: prev \?\? 'not_contacted'/.test(panel), "no browser-side row write to remove an opener");
  ok(/onClick=\{\(\) => void refresh\(\)\}/.test(panel) && !/teamControls && <Button[^>]*queue-refresh/.test(panel), "one Refresh button, both roles");
  ok(/QUEUE_ROW_STATE\[state\]/.test(panel) && !/teamControls[^\n]*QUEUE_ROW_STATE/.test(panel), "row chips come from ONE state map, never role-dependent");
  ok(/view\.archivedWaiting > 0/.test(panel) && /queue-count">\{q\.isSuccess \? view\.waiting\.length/.test(panel), "counts are the authorised rows on screen (no global number beside a scoped list)");
  ok(/data-scope=\{teamControls \? 'team' : 'mine'\}/.test(panel) && /\{teamControls \? 'Whole team' : 'Your leads'\}/.test(panel), "the scope is said on the panel");
}

console.log("\n── every queue path refreshes the one queue ──");
{
  const table = strip(read("src/components/OutreachTable.tsx"));
  ok(/handleSalesQueue[\s\S]*?recordQueueBatch\(Number\(r\.queued \?\? 0\), skipList\)[\s\S]*?announceQueueChanged\(\);/.test(table), "Sales bulk queue: records the batch and announces the change");
  ok(/recordQueueBatch\(queuedCount, \[/.test(table) && /Promise\.allSettled\(writes\)\.then\(\(\) => announceQueueChanged\(\)\)/.test(table), "Admin bulk queue: records the batch and announces after the writes land");
  ok(/Promise\.allSettled\(followupWrites\)\.then\(\(\) => announceQueueChanged\(\)\)/.test(table), "Admin follow-up queue announces too");
  const controls = strip(read("src/components/WhatsAppLeadControls.tsx"));
  ok(/salesQueueOpener\(\[lead\.id\], template\)[\s\S]*?announceQueueChanged\(\)/.test(controls) && /finally \{\s*setBusy\(false\);\s*announceQueueChanged\(\);/.test(controls), "the lead popup (both roles) announces the change");
  const camp = strip(read("src/hooks/useMyCampaigns.ts"));
  ok(/qc\.invalidateQueries\(\{ queryKey: WHATSAPP_QUEUE_KEY \}\)/.test(camp) && /announceQueueChanged\(\);/.test(camp), "campaign launch / stop / add refresh the queue");
}

console.log("\n── fixtures: Rep A, Rep B, admin ──");
{
  const A = "rep-a", B = "rep-b";
  type Fx = QueueRow & { assigned_to_user_id: string; amount_paid: number | null; whatsapp_delivery_status?: string | null };
  const row = (id: string, owner: string, o: Partial<Fx> = {}): Fx => ({
    id, business_name: `Biz ${id}`, status: "queued", is_archived: false, queued_at: `2026-10-06T09:0${id.length % 10}:00Z`,
    whatsapp_template: "initial_opener_v2", phone: "07700900000", country: "UK", contact_followup_queued_at: null,
    hook_followup_queued_at: null, assigned_to_user_id: owner, amount_paid: null, ...o,
  });
  const book: Fx[] = [
    row("a1", A, { queued_at: "2026-10-06T09:02:00Z" }), row("a2", A, { queued_at: "2026-10-06T09:01:00Z" }),
    /* "sending" is not a stored state: a tick sends and moves the lead on in one pass. Until then it is queued. */
    row("a3-sending", A, { queued_at: "2026-10-06T09:00:00Z" }),
    row("a4-sent", A, { status: "initial_contact", whatsapp_delivery_status: "sent" }),
    row("a5-sent", A, { status: "initial_contact", whatsapp_delivery_status: "delivered" }),
    row("a6-skipped", A, { status: "not_contacted", whatsapp_delivery_status: "phone_already_contacted" }),
    row("a7-failed", A, { status: "whatsapp_failed", whatsapp_delivery_status: "failed" }),
    row("a8-followup", A, { status: "second_attempt", contact_followup_queued_at: "2026-10-05T10:00:00Z" }),
    row("a9-archived", A, { is_archived: true }),
    row("b1", B), row("b2", B, { hook_followup_queued_at: "2026-10-06T08:00:00Z", status: "replied" }),
    /* Reassigned after queueing: queued by A, now B's. The queue item IS the lead row → it follows the lead. */
    row("x-reassigned", B, { queued_at: "2026-10-06T07:00:00Z" }),
    /* A paid client is never a prospect row (sales_leads excludes it for both roles). */
    row("c-client", A, { amount_paid: 99 }),
  ];
  /* The sales_leads WHERE clause and the PostgREST `or` filter, as the server applies them. */
  const isClient = (r: Fx) => (r.amount_paid ?? 0) > 0 || ["payment_received", "in_delivery", "completed", "refunded"].includes(r.status ?? "");
  const inAnyLane = (r: Fx) => r.status === "queued" || !!r.contact_followup_queued_at || !!r.hook_followup_queued_at;
  const server = (viewer: { role: "admin" | "sales" | null; uid: string }) =>
    book.filter((r) => (viewer.role === "admin" || (viewer.role === "sales" && r.assigned_to_user_id === viewer.uid)) && !isClient(r) && inAnyLane(r));

  const va = deriveQueue(server({ role: "sales", uid: A }));
  ok(va.waiting.map((r) => r.id).join() === "a3-sending,a2,a1", `Rep A: their 3 waiting, oldest first (${va.waiting.map((r) => r.id).join()})`);
  ok(va.followUps.map((r) => r.id).join() === "a8-followup" && va.archivedWaiting === 1, "Rep A: their follow-up listed, their archived-queued counted not listed");
  ok(!server({ role: "sales", uid: A }).some((r) => /sent|skipped|failed/.test(r.id)), "sent / skipped / failed leads are not queue rows (they left the queue)");
  ok(!server({ role: "sales", uid: A }).some((r) => r.assigned_to_user_id !== A), "Rep A receives no Rep B row");
  const vb = deriveQueue(server({ role: "sales", uid: B }));
  ok(vb.waiting.map((r) => r.id).join() === "x-reassigned,b1" && vb.hookCount === 1, "Rep B: their own rows, including the lead reassigned to them after it was queued");
  ok(!vb.waiting.some((r) => r.id.startsWith("a")), "Rep B receives no Rep A row");
  const vadm = deriveQueue(server({ role: "admin", uid: "admin" }));
  ok(vadm.waiting.length === va.waiting.length + vb.waiting.length && vadm.followUps.length === 1 && vadm.hookCount === 1 && vadm.archivedWaiting === 1, "Admin: A + B together");
  ok(!server({ role: "admin", uid: "admin" }).some((r) => r.id === "c-client"), "a paid client is in nobody's prospect queue");
  ok(server({ role: null, uid: A }).length === 0, "disabled (no role) → no rows");
  ok(queueSummaryParts(va).join(" · ") === "3 waiting · 1 no-reply follow-up", "Rep A's summary line counts only their rows");
  ok(queueSummaryParts(deriveQueue([])).length === 0, "empty queue → no parts (the card says \"No messages waiting\")");
  ok(queueSummaryParts(deriveQueue(server({ role: "sales", uid: "rep-c" }))).length === 0, "a rep with nothing queued sees an empty queue, not someone else's");
}

console.log("\n── states: one map, both roles ──");
{
  ok(Object.keys(QUEUE_ROW_STATE).join() === "waiting,follow_up", "only the lanes the processor really has");
  ok(QUEUE_ROW_STATE.waiting.tone === "blue" && QUEUE_ROW_STATE.follow_up.tone === "blue", "waiting = blue (queued / in progress)");
}

console.log("\n── the last batch (skipped-only / failed-only) ──");
{
  clearQueueBatch();
  const t0 = new Date("2026-10-06T10:00:00Z");
  ok(readQueueBatch(t0) === null, "no batch yet");
  const b = recordQueueBatch(0, [{ n: 1, label: "already contacted" }, { n: 1, label: "not a UK or Indian mobile" }, { n: 0, label: "opted out" }], t0);
  ok(batchHeadline(b) === "Queued 0 · 2 skipped" && b.skipped.length === 2, "skipped-only: \"Queued 0 · 2 skipped\" with the reasons, zero rows dropped");
  ok(readQueueBatch(new Date(t0.getTime() + 60_000))?.queued === 0, "kept for this tab");
  ok(readQueueBatch(new Date(t0.getTime() + BATCH_SHOWN_MS + 1)) === null, "and forgotten after an hour");
  ok(batchHeadline(recordQueueBatch(3, [], t0)) === "Queued 3", "a clean batch says so");
  clearQueueBatch();
}

console.log("\n── role gating ──");
{
  ok(leadPermissions("sales", true).queueControls === false && leadPermissions("admin").queueControls === true, "team controls: admin only");
  ok(canOpenRoute("sales", "/whatsapp-queue") && leadPermissions("sales", true).queueControls === false, "an active salesperson opens the queue whatever their practical-onboarding checklist (readiness is account status only)");
}

if (f) { console.log(`\n${f} failure(s)`); process.exit(1); }
console.log("\nall WhatsApp queue role-parity checks passed");
