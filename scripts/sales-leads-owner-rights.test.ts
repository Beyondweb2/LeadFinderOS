/* ════════════════════════════════════════════════════════════════════════════════════════════════
   sales_leads RUNS AS ITS OWNER (2026-10-20, fix/sales-leads-view-invoker; migration 20261112090000).

   Live, the view had been switched to security_invoker=true outside the code (most likely the Supabase advisor's
   "security definer view" fix) and every salesperson's Outreach read 0 rows. This pins:
     1. the migration that turns it back off, with its "do not apply the advisor fix" comment;
     2. no migration ever turns security_invoker ON for sales_leads, and every redefinition keeps security_barrier;
     3. the view's WHERE is still the access rule (own leads only, no clients, money NULL);
     4. Find Leads says what the person can really see after an add.
   The live reloptions are checked by supabase/tests/sales-leads-owner-rights.sql (read-only).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from "node:fs";
import { addVisibilityLine, isAccessProblem, visibilityOf } from "../src/lib/findLeadsBulkAdd.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const FIX = "20261112090000_sales_leads_owner_rights.sql";
const migs = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((n) => n.endsWith(".sql")).sort();

console.log("── 1. the fix ──");
{
  const m = read(`supabase/migrations/${FIX}`);
  ok(/alter view public\.sales_leads set \(security_invoker = false\);/.test(m), "the migration sets security_invoker = false");
  ok(/do not apply the supabase advisor/i.test(m) && /comment on view public\.sales_leads/.test(m), "it says, on the view itself, not to accept the advisor fix");
  ok(!/\b(drop|truncate|delete)\b/i.test(m.replace(/--.*$/gm, "")), "additive only");
}

console.log("── 2. no migration turns it back on ──");
{
  const bad: string[] = [];
  const barrierLost: string[] = [];
  for (const n of migs) {
    const s = read(`supabase/migrations/${n}`).replace(/--.*$/gm, "");
    for (const stmt of s.split(";")) {
      if (!/\bsales_leads\b/.test(stmt)) continue;
      if (/security_invoker\s*=\s*(true|on|1)\b/i.test(stmt)) bad.push(n);
      if (/create\s+or\s+replace\s+view\s+public\.sales_leads/i.test(stmt) && !/security_barrier\s*=\s*true/i.test(stmt)) barrierLost.push(n);
    }
  }
  ok(bad.length === 0, `no migration sets security_invoker on for sales_leads${bad.length ? ": " + bad.join(", ") : ""}`);
  ok(barrierLost.length === 0, `every sales_leads redefinition keeps security_barrier${barrierLost.length ? ": " + barrierLost.join(", ") : ""}`);
  const last = [...migs].reverse().find((n) => /create\s+or\s+replace\s+view\s+public\.sales_leads/i.test(read(`supabase/migrations/${n}`)));
  ok(!!last && last < FIX, "the fix runs after the newest redefinition (a later CREATE OR REPLACE resets options: keep it off)");
}

console.log("── 3. the WHERE is the access rule ──");
{
  const last = [...migs].reverse().find((n) => /create\s+or\s+replace\s+view\s+public\.sales_leads/i.test(read(`supabase/migrations/${n}`)))!;
  const s = read(`supabase/migrations/${last}`);
  const view = s.slice(s.search(/create\s+or\s+replace\s+view\s+public\.sales_leads/i));
  const body = view.slice(0, view.indexOf(";"));
  ok(/assigned_to_user_id = \(\( SELECT auth\.uid\(\) AS uid\)\)/.test(body) || /assigned_to_user_id = \(select auth\.uid\(\)\)/i.test(body), "a rep sees only leads assigned to them");
  ok(/NOT lead_is_client\(/i.test(body), "clients never appear");
  ok(/NULL::numeric AS amount_paid/i.test(body), "money is a literal NULL");
  ok(/my_role\(\)/.test(body) && /'sales'::text, 'admin'::text/.test(body), "no role → no rows");
}

console.log("── 4. Find Leads says what is really there ──");
{
  ok(addVisibilityLine(21, { visible: 0, queued: 0 }) === "21 added to CRM, 0 visible in your Outreach: tell Paul (lead access problem)", "none visible → the access-problem line");
  ok(addVisibilityLine(21, { visible: 21, queued: 0 }) === "21 added to CRM, 0 queued: you haven't queued them yet", "all visible, none queued");
  ok(addVisibilityLine(21, { visible: 21, queued: 5 }) === "21 added to CRM, 5 queued", "the real queued count");
  ok(addVisibilityLine(21, null) === null && addVisibilityLine(0, { visible: 0, queued: 0 }) === null, "a failed read-back or nothing added claims nothing");
  ok(isAccessProblem(3, { visible: 2, queued: 0 }) && !isAccessProblem(3, null) && !isAccessProblem(3, { visible: 3, queued: 0 }), "access problem = fewer visible than added, known");
  const v = visibilityOf([{ status: "queued" }, { status: "not_contacted", sms_queued_at: "2026-10-20T08:00:00Z" }, { status: "not_contacted" }]);
  ok(v.visible === 3 && v.queued === 2, "queued = WhatsApp queued or an SMS queued");
  const hook = read("src/hooks/useFindLeadsBulkAdd.ts");
  ok(/leadSourceFor\(role\)\.table/.test(hook) && /res\.visibility = await readBack\(role, ids\)/.test(hook), "the read-back uses the person's own Outreach source");
  const idx = read("src/pages/Index.tsx");
  ok(/addVisibilityLine\(res\.summary\.added, res\.visibility\)/.test(idx), "the add's toast uses the read-back line");
}

if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
console.log("\nall passed");
