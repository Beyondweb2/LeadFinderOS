/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ROLE RULES, AND THE PLACES THAT MUST AGREE WITH THEM (multi-user, 2026-09-27).

   ⛔ The security boundary is the database (RLS, sales_leads, the SECURITY DEFINER functions) and
   the edge functions. This suite holds three things together that live in different languages:
     · src/lib/roleRules.ts          — the pure rules the edge functions and the SPA import;
     · the SQL migration             — public.lead_is_client, lead_set_stage's allowlist, claim's lock;
     · the edge functions themselves — every admin-only function calls requireAdmin, every
                                       sales-reachable one resolves a role, none reads a role from
                                       the request.
   The live RLS behaviour is proven separately by supabase/tests/multi-user-rls.sql (run against the
   database inside a transaction that is always rolled back — see docs/multi-user.md).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { CLIENT_STATUSES, canWorkLead, isClientLead, pickRole, salesAuditRefusal, type Actor } from "../src/lib/roleRules.ts";
import { SALES_SETTABLE_STATUSES } from "../src/lib/salesCrm.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const admin: Actor = { id: "a", role: "admin" };
const salesA: Actor = { id: "sa", role: "sales" };

console.log("── pickRole: positive match, admin outranks sales ──");
ok(pickRole([{ role: "admin" }]) === "admin", "admin row → admin");
ok(pickRole([{ role: "sales" }]) === "sales", "sales row → sales");
ok(pickRole([{ role: "sales" }, { role: "admin" }]) === "admin", "both → admin");
ok(pickRole([{ role: "moderator" }]) === null, "moderator → no role");
ok(pickRole([{ role: "user" }]) === null, "user → no role");
ok(pickRole([]) === null && pickRole(null) === null && pickRole(undefined) === null, "no rows / null → no role");
ok(pickRole([{ role: "ADMIN" }]) === null, "case matters — 'ADMIN' is not admin");

console.log("\n── canWorkLead ──");
ok(canWorkLead(admin, { assigned_to_user_id: null }), "admin: an unassigned lead");
ok(canWorkLead(admin, { assigned_to_user_id: "sb" }), "admin: another rep's lead");
ok(canWorkLead(salesA, { assigned_to_user_id: "sa" }), "sales: their own lead");
ok(!canWorkLead(salesA, { assigned_to_user_id: "sb" }), "sales: NOT another rep's lead");
ok(!canWorkLead(salesA, { assigned_to_user_id: null }), "sales: NOT an unassigned lead (claim first)");
ok(!canWorkLead(salesA, {}), "sales: NOT a lead whose owner is absent");
ok(!canWorkLead(admin, null), "nobody: a missing lead");
ok(!canWorkLead({ id: "x", role: "nope" as never }, { assigned_to_user_id: "x" }), "an unknown role works nothing");

console.log("\n── isClientLead ──");
ok(isClientLead({ amount_paid: 99, status: "replied" }), "paid anything → client");
ok(isClientLead({ amount_paid: 0, status: "refunded" }), "refunded → client (ex-client, still not a prospect)");
ok(isClientLead({ amount_paid: null, status: "in_delivery" }), "in delivery → client");
ok(!isClientLead({ amount_paid: null, status: "won_pending_onboarding" }), "won (rep closed it) is NOT a client — admin onboards");
ok(!isClientLead({ amount_paid: 0, status: "interested" }), "a £0 interested prospect → not a client");
ok(!isClientLead(null), "absent → not a client (and canWorkLead refuses a missing lead anyway)");

console.log("\n── salesAuditRefusal: the hook audit and nothing else ──");
const hook = { purpose: undefined, hookAudit: true, leadId: "L", reuseAuditId: null };
ok(salesAuditRefusal(hook) === null, "hook audit on a lead → allowed");
for (const p of ["measurement", "discovery", "baseline", "remeasure", "free_check", "anything_new"]) {
  ok(salesAuditRefusal({ ...hook, purpose: p }) === "audit_mode_admin_only", `purpose '${p}' → refused`);
}
ok(salesAuditRefusal({ ...hook, leadId: null }) === "audit_needs_lead", "no lead (a market audit) → refused");
ok(salesAuditRefusal({ ...hook, reuseAuditId: "A" }) === "audit_mode_admin_only", "a repeat of an existing audit → refused");
ok(salesAuditRefusal({ ...hook, hookAudit: false }) === "audit_mode_admin_only", "not declared a hook → refused");

console.log("\n── SQL agrees with the TypeScript ──");
const mig = read("supabase/migrations/20260927100100_multi_user_sales.sql");
const clientFn = mig.slice(mig.indexOf("function public.lead_is_client"), mig.indexOf("function public.phone_key"));
const sqlClient = [...clientFn.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
ok(JSON.stringify(sqlClient) === JSON.stringify([...CLIENT_STATUSES].sort()), `lead_is_client statuses = CLIENT_STATUSES (${sqlClient.join(", ")})`);
const stageFn = mig.slice(mig.indexOf("function public.lead_set_stage"), mig.indexOf("function public.lead_set_follow_up"));
const allow = stageFn.match(/_status not in \(([^)]*)\)/)?.[1] ?? "";
const sqlStages = [...allow.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
ok(JSON.stringify(sqlStages) === JSON.stringify([...SALES_SETTABLE_STATUSES].sort()), `lead_set_stage allowlist = SALES_SETTABLE_STATUSES (${sqlStages.join(", ")})`);
ok(!sqlStages.some((s) => CLIENT_STATUSES.has(s)), "no money status is sales-settable");
const claimFn = mig.slice(mig.indexOf("function public.claim_lead("), mig.indexOf("function public.assign_lead("));
ok(/for update/.test(claimFn), "claim_lead locks the row (FOR UPDATE) before reading it — two claims cannot both win");
ok(/lead_first_contact_at\(_lead_id\) is not null/.test(claimFn), "claim_lead refuses a contacted lead whatever its assignment");
ok(/my_role\(\) is distinct from 'admin'/.test(mig.slice(mig.indexOf("function public.assign_lead("))), "assign_lead is admin-only");
ok(/as restrictive for all to authenticated\s+using \(\(select public\.my_role\(\)\) = 'admin'\)/.test(mig), "outreach_leads writes/reads are restricted to the admin (sales reads the view)");
ok(/grant select on public\.sales_leads to authenticated/.test(mig) && /revoke all on public\.sales_leads from public, anon, authenticated/.test(mig), "sales_leads: SELECT only, never anon");
ok(!/amount_paid,|stripe_|refund_|delivery_notes|payment_date/.test(mig.slice(mig.indexOf("create or replace view public.sales_leads"), mig.indexOf("null::numeric as amount_paid"))), "the sales view selects no money or delivery column");

console.log("\n── The edge functions ──");
const ADMIN_ONLY = ["paid-client-hub", "paid-baseline", "page-generator", "submissions", "apify-usage-status"];
for (const fn of ADMIN_ONLY) ok(/requireAdmin\(req, /.test(read(`supabase/functions/${fn}/index.ts`)), `${fn} calls requireAdmin`);
ok(/role', 'admin'/.test(read("supabase/functions/admin-users/index.ts")), "admin-users still checks the admin role");
const ROLE_REQUIRED = [
  "send-whatsapp-message", "send-whatsapp-voice", "create-ai-audit", "voice-note-script", "warm-lead-reply", "prospect-preview",
  "coverage", "market-view", "playbook-evidence", "enrich-business", "enrich-lead", "process-whatsapp-queue",
];
for (const fn of ROLE_REQUIRED) ok(/resolveActor\(req, /.test(read(`supabase/functions/${fn}/index.ts`)), `${fn} resolves the caller's role server-side`);
for (const fn of ["google-place-details", "check-website", "extract-email", "extract-facebook", "review-reply", "scan-site-details"]) {
  ok(/userTeamRole\(/.test(read(`supabase/functions/${fn}/index.ts`)), `${fn} requires a team role`);
}
ok(/pickRole\(roleRows\)/.test(read("supabase/functions/search-leads/index.ts")), "search-leads requires a team role (admin or sales)");
const all = [...ADMIN_ONLY, ...ROLE_REQUIRED, "admin-users", "search-leads"];
ok(all.every((fn) => !/body\.role\b|body\?\.role\b/.test(read(`supabase/functions/${fn}/index.ts`))), "no function reads a role from the request body");
const cc = read("supabase/functions/create-ai-audit/index.ts");
ok(/salesAuditRefusal\(/.test(cc) && /canWorkLead\(actor, workLead\)/.test(cc), "create-ai-audit: sales → hook only, on a lead they work");
const q = read("supabase/functions/process-whatsapp-queue/index.ts");
ok(/who\.actor\.role === "sales" && mode === "contact_check"/.test(q), "the queue lets sales run contact_check and nothing else");
const s = read("supabase/functions/send-whatsapp-message/index.ts");
ok(/sent_by_user_id: operatorId/.test(s) && /user_id: bookUserId/.test(s), "send-whatsapp-message files the message in the book and records who sent it");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
