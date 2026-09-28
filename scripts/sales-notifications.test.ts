/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS (Sales Experience release 3, docs/sales-experience.md §5). Pins the shape; the live
   proof is supabase/tests/notifications.sql (rolled back: 16 checks — replies coalesce, a failed send,
   own-row reads, no forged insert, assignment rules, follow-up once per date, mark read, clear).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { whatsAppLinkForLead } from "../src/lib/conversationState.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const mig = read("supabase/migrations/20260929140000_notifications.sql");
console.log("\n── ownership & security ──");
ok(/constraint notifications_dedupe_uq unique \(user_id, dedupe_key\)/.test(mig), "every event is idempotent per person (unique dedupe key)");
ok(/for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/.test(mig) && /revoke insert, update, delete on public\.notifications from authenticated/.test(mig) && /revoke all on public\.notifications from anon/.test(mig), "a person reads only their own; the browser never writes; anon nothing");
ok((mig.match(/where user_id = auth\.uid\(\)/g) ?? []).length === 2, "mark read / clear touch only the caller's own rows");
ok(/revoke all on function public\.notify_person\([^)]*\) from public, anon, authenticated/.test(mig), "only the server can create a notification");
ok(/if public\.my_role\(\) is distinct from 'admin' then raise exception 'admin_only'/.test(mig), "only the admin decides a template request");

console.log("\n── a notification never blocks what it reports ──");
for (const fn of ["trg_notify_whatsapp", "trg_notify_signup_opened", "trg_notify_audit_finished", "trg_notify_lead_assigned"]) {
  const body = mig.slice(mig.indexOf(`function public.${fn}()`), mig.indexOf("$$;", mig.indexOf(`function public.${fn}()`)));
  ok(/exception when others then raise warning/.test(body) && /return new;\s*end \$\$/.test(body + "$$"), `${fn}: swallows its own failure and always returns the row`);
}
ok(/after insert or update of status on public\.whatsapp_messages/.test(mig) && /after update of assigned_to_user_id on public\.outreach_leads/.test(mig), "AFTER triggers only — they cannot change the row");

console.log("\n── no duplicate spam ──");
ok(/update public\.notifications set count = count \+ 1[\s\S]{0,400}read_at is null and cleared_at is null/.test(mig), "WhatsApp replies coalesce while unread");
ok(/'signup_opened:' \|\| new\.lead_id \|\| ':' \|\| to_char/.test(mig), "sign-up opens: one per lead per day");
ok(/'followup:' \|\| r\.id \|\| ':' \|\| r\.na \|\| ':' \|\| r\.next_action_date/.test(mig), "follow-ups: once per scheduled date (overdue is not re-announced daily)");
ok(/new\.assigned_to_user_id = auth\.uid\(\) or new\.assigned_to_user_id = public\.book_owner_id\(\)/.test(mig), "no notice for claiming your own lead, nor the automatic book-owner assignment");
ok(/e\.kind = 'sent'/.test(mig), "a sign-up open counts only after a recorded send (the dashboard's rule)");
ok(/v_purpose <> 'audit' or v_measure/.test(mig), "only hook audits notify — never a measurement or market audit");

console.log("\n── deep links ──");
ok(/'\/inbox\?lead=' \|\| new\.lead_id/.test(mig) && whatsAppLinkForLead("x") === "/inbox?lead=x", "a WhatsApp notification opens that exact thread (the one deep link)");
ok(/check \(link is null or link like '\/%'\)/.test(mig), "links are in-app paths only");

console.log("\n── money ──");
const w = read("supabase/functions/_shared/payment-ledger.ts");
ok(/if \(row\.source !== "backfill"\) await notifyMoney/.test(w), "a backfill never announces old payments");
ok(/commissionLines\(\{ ledger, payouts: \[\], isCommissionable/.test(w), "the commission amount comes from the commission rule, not SQL");
ok(/dedupe_key: `commission:\$\{me\.id\}`/.test(w) && /ignoreDuplicates: true/.test(w), "money notifications are idempotent too");

console.log("\n── the bell ──");
const c = read("src/components/NotificationCenter.tsx"), layout = read("src/components/AppLayout.tsx");
ok(/<NotificationCenter variant="desktop" \/>/.test(layout) && /<NotificationCenter variant="mobile" \/>/.test(layout), "desktop bell + phone top-bar bell, both in the shell that mounts once");
ok(/fixed bottom-4 right-4/.test(c) && /md:inline-flex/.test(c), "desktop: bottom-right");
ok(/const go = \(x: AppNotification\) => \{ if \(!x\.read_at\) void n\.markRead\(\[x\.id\]\); setOpen\(false\); if \(x\.link\) navigate\(x\.link\); \}/.test(c), "clicking marks it read and opens its link");
ok(/variant === 'mobile' \? undefined :/.test(c), "desktop alerts fire from one instance only");
ok(/x\.priority < 2 \|\| !readAlerts\(\) \|\| typeof document === 'undefined' \|\| !document\.hidden/.test(c), "desktop alerts: opt-in, priority only, only when the tab is hidden");
ok(/fixed bottom-20 right-4 z-50/.test(read("src/components/ReviewQueueTab.tsx")), "the admin's review card sits above the bell");

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
