/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TEST-DAY GUARDS (2026-10-14, feat/test-day-outreach; docs/test-day-outreach.md).

   Job 1 — the roles and double-contact check found three narrow gaps; each fix is pinned here:
     A. a salesperson's allow_resend never skips the phone-history check across ANOTHER lead row;
     B. a number already TEXTED never gets a cold WhatsApp opener (both senders ask one SQL rule);
     C. Find Leads' region mode (dearer, and it reads back the day's Google spend) is admin-only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("── Job 1: roles and double contact ──");
{
  const swm = read("supabase/functions/send-whatsapp-message/index.ts");
  ok(/isColdOutreachTemplate\(templateName\) && \(!allowResend \|\| actor\.role !== "admin"\)/.test(swm),
    "A: the cross-row phone-history check runs for a salesperson even with allow_resend");
  ok(/!allowResend \|\| !resolvedLeadId \|\| m\.lead_id !== resolvedLeadId/.test(swm),
    "A: with allow_resend, only this lead's OWN thread is waved through");
  ok(/rpc\("phone_already_texted", \{ _phone: to \}\)/.test(swm) && /error: "phone_already_texted"/.test(swm),
    "B: send-whatsapp-message refuses a cold template to a texted number");
  ok(/textedErr\) return json\(\{ ok: false, error: "contact_guard_unreadable"/.test(swm), "B: an unreadable answer refuses (fails closed)");

  const drip = read("supabase/functions/process-whatsapp-queue/index.ts");
  ok(/rpc\("phone_already_texted", \{ _phone: toNumber \}\)/.test(drip) && /skipped: "phone_already_texted"/.test(drip),
    "B: the drip asks the same rule at send time and drops the lead from the queue");

  const mig = read("supabase/migrations/20261024090000_phone_already_texted.sql");
  ok(/m\.direction = 'outbound'/.test(mig) && /not in \('failed', 'undelivered', 'simulated'\)/.test(mig),
    "B: the SQL rule matches queue_sms_openers' already_texted predicate");
  ok(/revoke all on function public\.phone_already_texted\(text\) from public, anon, authenticated/.test(mig),
    "B: browsers cannot call it (service role only)");

  const search = read("supabase/functions/search-leads/index.ts");
  ok(/const region = regionAsked && role === 'admin';/.test(search), "C: region mode runs only for the admin");
}

console.log(f ? `\n${f} FAILURE(S)` : "\nALL PASS");
process.exit(f ? 1 : 0);
