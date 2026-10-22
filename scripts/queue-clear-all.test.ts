/* ONE-PRESS "CLEAR QUEUE" (2026-10-17). Static checks on the migration and the panel; the database behaviour (owner scoping,
   previous-status restore, exact count, no-role refusal) is proven by supabase/tests/queue-clear-all.sql (live, always rolled back). */
import fs from "node:fs";
import path from "node:path";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261107090000_lead_unqueue_all.sql");
const panel = read("src/components/WhatsAppQueuePanel.tsx");

console.log("── the bulk function ──");
ok(/if public\.my_role\(\) is null then raise exception 'no_role'/.test(sql), "role check first");
ok(/public\.can_work_lead\(id\)/.test(sql), "owner scope: can_work_lead per lead (sales = own, admin = all)");
ok(/status = 'queued' and is_archived = false/.test(sql), "only a lead still waiting changes");
ok(/status = coalesce\(o\.previous_status, 'not_contacted'\), previous_status = null, queued_at = null/.test(sql), "restores previous_status (same rule as lead_unqueue)");
ok(/skip locked/.test(sql), "a row in flight is skipped, not waited on");
ok(/insert into public\.lead_activity/.test(sql), "history is written");
ok(!/whatsapp_messages|whatsapp_sends|net\.http/.test(sql), "sends nothing");
ok(/revoke all on function public\.lead_unqueue_all\(\) from public, anon;/.test(sql) && /grant execute on function public\.lead_unqueue_all\(\) to authenticated;/.test(sql), "not callable by anon");

console.log("── the button ──");
ok(/leadRpc\('lead_unqueue', \{ _lead_id: id \}\)/.test(panel) && !/leadRpc\('lead_unqueue_all'/.test(panel), "2026-10-22: Clear queue acts on the country on screen, per lead through lead_unqueue (the all-countries function is not called)");
ok(/from the \$\{TAB_LABEL\[tab\]\} queue/.test(panel) && /Other countries are not touched/.test(panel), "the confirm names the country and says the others are untouched");
ok(/data-testid="queue-clear-all"/.test(panel) && /data-testid="queue-clear-confirm"/.test(panel), "button + confirm dialog");
ok(/Remove \{view\.waiting\.length\}/.test(panel) || /Remove \$\{view\.waiting\.length\}/.test(panel), "the confirm states how many leads");
ok(/Removed \$\{n\}/.test(panel), "the result count is shown afterwards");
ok(/notifyLeadChanged\(id\)/.test(panel) && /announceQueueChanged\(\)/.test(panel), "lead change + queue-changed notices fired");
const btn = panel.slice(panel.indexOf('data-testid="queue-clear-all"') - 400, panel.indexOf('data-testid="queue-clear-all"'));
ok(!/teamControls &&/.test(btn.slice(-120)), "the button is for both roles (the server scopes it)");
ok(!/select\('\*'\)/.test(panel), "no select('*') of outreach_leads");

process.exit(f ? 1 : 0);
