/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALESPERSON'S WHATSAPP QUEUE PANEL (2026-10-03). The admin's queue panel shows the whole queue and its
   controls; a salesperson had no panel at all (only a paused banner). Now they get the useful half:
     1. their OWN queued leads, read from the server-scoped `sales_leads` view (never a browser owner filter);
     2. whether the queue is sending (queue_state — both roles), never the team's numbers or the controls;
     3. remove one of their queued leads through fn lead_unqueue (role + can_work_lead, only a waiting lead);
     4. it re-reads at once after every sales queue path — bulk queue, the lead popup, campaign launch / stop —
        and on lead change notices, and polls while anything waits (Sales gets no outreach_leads realtime).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const panel = strip(read("src/components/MyWhatsAppQueuePanel.tsx"));
ok(/\.from\('sales_leads'\)\s*\.select\('id, business_name, queued_at, whatsapp_template, phone'\)\s*\.eq\('status', 'queued'\)/.test(panel), "the list is the server-scoped sales_leads view (a rep's own leads only)");
ok(!/assigned_to_user_id|user_id|created_by/.test(panel), "no browser-side owner filter — the server decides");
ok(!/mode: '(tick|pause|resume|status)'/.test(panel) && !/sentToday|cap\b/.test(panel), "no queue controls and no team numbers for Sales");
ok(/leadRpc\('lead_unqueue', \{ _lead_id: id \}\)/.test(panel) && /notifyLeadChanged\(id\)/.test(panel), "remove = fn lead_unqueue, then every screen re-reads the lead");
ok(/refetchInterval: \(q\) => \(\(q\.state\.data\?\.length \?\? 0\) > 0 \? QUEUE_POLL_MS : false\)/.test(panel), "polls only while something waits");
ok(/window\.addEventListener\(QUEUE_CHANGED_EVENT, h\)/.test(panel), "re-reads at once on a queue-changed notice");

const out = strip(read("src/pages/Outreach.tsx"));
ok(/\{perms\.queueControls && <WhatsAppQueuePanel /.test(out) && /\{!perms\.queueControls && <MyWhatsAppQueuePanel \/>\}/.test(out), "Outreach: the admin keeps the full panel; a salesperson gets theirs");
ok(/window\.addEventListener\('campaign-leads-changed', handler\)/.test(out), "a campaign launch / stop / add re-reads the Outreach list");
ok(/handleSalesQueue[\s\S]*?onRefreshLeads\?\.\(\);\s*announceQueueChanged\(\);/.test(strip(read("src/components/OutreachTable.tsx"))), "bulk queue (Sales) announces the change");
ok(/salesQueueOpener\(\[lead\.id\], template\)[\s\S]*?announceQueueChanged\(\)/.test(strip(read("src/components/WhatsAppLeadControls.tsx"))), "the lead popup's queue (Sales) announces the change");
const camp = strip(read("src/hooks/useMyCampaigns.ts"));
ok(/qc\.invalidateQueries\(\{ queryKey: MY_QUEUE_KEY \}\)/.test(camp) && /announceQueueChanged\(\);/.test(camp) && /new CustomEvent\('campaign-leads-changed'\)/.test(camp), "campaign launch / stop / add refresh the queue panel and Outreach");
ok(/\['my-whatsapp-queue'\]/.test(read("src/lib/leadSync.ts")), "any lead change notice refreshes the queue panel (book-wide, debounced)");

const sql = read("supabase/migrations/20261006130000_lead_unqueue.sql");
ok(/if public\.my_role\(\) is null then raise exception 'no_role'/.test(sql) && /if not public\.can_work_lead\(_lead_id\) then return jsonb_build_object\('ok', false, 'error', 'not_yours'\)/.test(sql), "lead_unqueue: role, then may this person work this lead");
ok(/if v_status is distinct from 'queued' then return jsonb_build_object\('ok', true, 'unchanged', true\)/.test(sql), "only a lead still waiting changes — a sent message is never touched");
ok(/revoke all on function public\.lead_unqueue\(uuid\) from public, anon;/.test(sql), "not callable by anon");

if (f) { console.log(`\n${f} failure(s)`); process.exit(1); }
console.log("\nall sales queue panel checks passed");
