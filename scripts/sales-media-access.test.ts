/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES CAN OPEN THE MEDIA OF THE LEADS THEY WORK — AND NOTHING ELSE (2026-09-27).

   ⛔ The boundary is the storage policy "whatsapp media read assigned sales" (migration
   20260927110000). Its behaviour against real rows — own image/voice/document open; Paul's, another
   rep's, a paid client's, an unreferenced object, a reassigned lead and a disabled account refused;
   the admin unchanged — is proved by supabase/tests/sales-media-rls.sql against the live database.
   This suite fences the SHAPE so a later edit cannot quietly undo it:
     · the sales policy decides from whatsapp_messages.media_path, never from the object name;
     · a message with a lead id counts only through that lead (not through a shared phone);
     · the admin policy is not touched by the migration;
     · there is ONE attachment viewer, used by both the Inbox and the salesperson's lead page;
     · nothing makes the bucket public.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from "node:fs";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** SQL without its comments, so a rule written in prose cannot satisfy an assertion about code. */
const code = (s: string) => s.replace(/--[^\n]*/g, "");

const mig = code(read("supabase/migrations/20260927110000_sales_whatsapp_media.sql"));
const policy = mig.slice(mig.indexOf('create policy "whatsapp media read assigned sales"'));
const fn = mig.slice(mig.indexOf("create or replace function public.my_sales_media_paths()"), mig.indexOf("revoke execute"));

console.log("── the storage policy ──");
ok(policy.startsWith('create policy "whatsapp media read assigned sales" on storage.objects for select to authenticated'), "a SELECT-only policy on storage.objects for authenticated");
ok(/bucket_id = 'whatsapp-media'/.test(policy), "scoped to the whatsapp-media bucket");
ok(/\(select public\.my_role\(\)\) = 'sales'/.test(policy), "positive match on the sales role, evaluated once per statement");
ok(/name in \(select public\.my_sales_media_paths\(\)\)/.test(policy), "the object must be in the caller's media set");
ok(!/foldername/.test(policy), "never decided from the object's folder (a path is not an owner)");
ok(!/for (insert|update|delete|all)/i.test(mig), "grants no upload, overwrite or delete");
ok(!/public\s*=\s*true/i.test(mig) && !/storage\.buckets/.test(mig), "does not touch the bucket (it stays private)");
ok(!/"whatsapp media read own or admin"/.test(mig), "leaves the admin policy exactly as it was");

console.log("── the media set ──");
ok(/security definer/.test(fn) && /set search_path = public/.test(fn), "security definer with a pinned search_path");
ok(/if public\.my_role\(\) is distinct from 'sales' then return; end if;/.test(fn), "returns nothing at once for anyone who is not sales (admin, disabled, anon)");
ok(/select m\.media_path from public\.whatsapp_messages m/.test(fn), "built from the messages that reference the file");
ok(/m\.lead_id in \(select public\.my_sales_lead_ids\(\)\)/.test(fn), "through the caller's assigned, non-client leads");
ok(/m\.lead_id is null and m\.phone in \(select public\.my_sales_message_phones\(\)\)/.test(fn), "a phone match only for a message with NO lead (a Paul-owned lead sharing the phone stays Paul's)");
ok(/revoke execute on function public\.my_sales_media_paths\(\) from public, anon;/.test(mig), "not callable by anon");

console.log("── one attachment viewer ──");
const viewer = read("src/components/WhatsAppMedia.tsx");
ok(/createSignedUrl\(message\.media_path!/.test(viewer), "the viewer asks Storage under the caller's own session");
ok(!/service_role|SERVICE_ROLE/.test(viewer), "no service key anywhere near it");
const inbox = read("src/pages/Inbox.tsx");
const salesLead = read("src/pages/SalesLead.tsx");
ok(/import \{ InboundMedia, isPlayableVoice \} from '@\/components\/WhatsAppMedia';/.test(inbox), "the Inbox uses the shared viewer");
ok(/import \{ InboundMedia, isPlayableVoice \} from '@\/components\/WhatsAppMedia';/.test(salesLead), "the salesperson's lead page uses the same viewer");
ok(/<InboundMedia message=\{m\} \/>/.test(salesLead), "the sales thread renders attachments");
ok(/media_path, media_filename, error/.test(salesLead), "the sales thread reads the media columns");
const srcFiles: string[] = [];
const walk = (d: string) => { for (const e of readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) srcFiles.push(p); } };
walk("src");
const signers = srcFiles.filter((p) => /from\('whatsapp-media'\)/.test(read(p)));
ok(signers.length === 1 && signers[0] === "src/components/WhatsAppMedia.tsx", `exactly one place in src opens whatsapp-media (${signers.join(", ")})`);
ok(!/function InboundMedia/.test(inbox) && !/function InboundMedia/.test(salesLead), "no second copy of the viewer in a page");

console.log("── the live proof exists ──");
const live = read("supabase/tests/sales-media-rls.sql");
for (const name of ["A: opens image on own lead", "A: opens voice note on own lead", "A: opens document on own lead", "A: cannot open Sales B media",
  "A: cannot open Paul media", "A: cannot open paid-client media (assigned to A)", "A: cannot open an unreferenced object", "A after reassign: opens nothing",
  "B disabled: opens nothing", "admin: opens all 15 fixtures", "anon: opens nothing"]) {
  ok(live.includes(`'${name}'`), `live test covers: ${name}`);
}
ok(/raise exception 'RESULTS %'/.test(live) && /^begin;/m.test(live) && !/\bcommit\b/i.test(code(live)), "the live test can never commit");

console.log(f ? `\n${f} FAILURE(S)` : "\nall passed");
process.exit(f ? 1 : 0);
