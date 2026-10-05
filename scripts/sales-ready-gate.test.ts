/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE READY TO SELL GATE — its wiring (2026-10-05, docs/salesperson-onboarding.md §3).
   ⛔ The gate is enforced on the SERVER: guard_action ('not_onboarded'), the lead_activity trigger, the
      assignment trigger, the attribution trigger and quick-close. This suite fences that each piece is
      there, that the admin is exempt everywhere, that no WhatsApp code was touched, and that business
      type stays display-only. Its BEHAVIOUR is proven live by supabase/tests/salesperson-onboarding-rls.sql
      (rolled back; 47/47 on 2026-10-05).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { leadPermissions } from "../src/lib/access.ts";
import { refusalText } from "../src/lib/salesCrm.ts";
import { SEED_DOCUMENT_VERSIONS } from "../src/lib/salespersonOnboarding.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const MIG = read("supabase/migrations/20261010120000_salesperson_onboarding_compliance.sql");
const fnBody = (name: string) => { const s = MIG.indexOf(`create or replace function public.${name}`); return s < 0 ? "" : MIG.slice(s, MIG.indexOf("$$;", s)); };

console.log("── guard_action: the live body + ONE refusal ──");
{
  const g = MIG.slice(MIG.indexOf("create or replace function public.guard_action"));
  ok(/v_unready := v_role = 'sales' and not v_susp and not public\.salesperson_ready_to_sell\(_actor\);/.test(g), "only a SALES actor is checked (the admin is never gated)");
  ok(/if v_susp then v_reason := 'suspended';\n  elsif v_unready then v_reason := 'not_onboarded';/.test(g), "not_onboarded is refused right after suspended, before any spend or rate rule");
  ok(/'not_onboarded', v_unready\);/.test(g), "the answer says so");
  ok(/v_reason in \('suspended', 'not_onboarded'\) then 'any'/.test(g), "one alert per person per day, like a suspended account");
  ok(!/grant execute on function public\.guard_action[^;]*authenticated/.test(MIG), "still service-role only");
}

console.log("\n── the database gates ──");
{
  const act = fnBody("trg_lead_activity_ready_to_sell");
  ok(/new\.actor_user_id is distinct from auth\.uid\(\)/.test(act), "lead_activity: only a salesperson acting in their OWN session (service-role writers, incl. every WhatsApp path, untouched)");
  ok(/public\.my_role\(\) is distinct from 'sales' then return new/.test(act), "lead_activity: the admin is never gated");
  const allowed = (act.match(/new\.kind in \(([^)]*)\)/)?.[1] ?? "").replace(/\s+/g, " ");
  for (const k of ["note", "opted_out", "lead_unassigned", "archived_set", "handoff_saved"]) ok(allowed.includes(`'${k}'`), `a not-ready rep may still: ${k}`);
  for (const k of ["call_outcome", "contact_logged", "lead_claimed", "bulk_queued", "stage_changed", "follow_up_set", "audit_run", "payment_link_shared", "marked_interested", "lead_added"]) {
    ok(!allowed.includes(`'${k}'`), `a not-ready rep may NOT: ${k}`);
  }
  ok(/raise exception 'not_ready_to_sell'/.test(act), "the refusal is the code the screens translate");
  const asg = fnBody("trg_outreach_leads_assign_ready");
  ok(/auth\.uid\(\) is null then return new/.test(asg) && /role = 'admin'\) then return new/.test(asg), "assignment: signed-in sessions only; an admin assignee is never gated");
  ok(/before insert or update of assigned_to_user_id on public\.outreach_leads/.test(MIG), "assignment: claims, sales adds and admin assigns all pass through it");
  const sold = fnBody("trg_outreach_leads_sold_by_ready");
  ok(/old\.sold_by_user_id is not null then return new/.test(sold), "attribution: an existing stamp never moves (history intact)");
  ok(/new\.sold_by_user_id := new\.user_id/.test(sold) && /attribution_withheld_not_onboarded/.test(sold), "attribution: a not-ready rep's new sale goes to the book owner, with a security event");
  ok("trg_outreach_leads_sold_by" < "trg_outreach_leads_sold_by_ready", "attribution: runs after the existing stamp trigger (triggers fire by name)");
  ok(/function public\.my_acknowledge_team_guide/.test(MIG) && /function public\.my_onboarding_status/.test(MIG), "a not-ready rep can see their status and acknowledge the guide");
}

console.log("\n── the edge gates ──");
{
  const qc = read("supabase/functions/quick-close/index.ts");
  ok(/actor\.role === "sales" && \(mode === "save" \|\| mode === "generate_link" \|\| mode === "share_link"\)/.test(qc), "quick-close: save / payment link / share are gated for sales");
  ok(qc.indexOf("salesReadiness(service, actor.id)") > qc.indexOf("const mode =") && qc.indexOf("salesReadiness(service, actor.id)") < qc.indexOf('if (mode === "save")'), "quick-close: checked before any mode runs");
  const sr = read("supabase/functions/_shared/sales-ready.ts");
  ok(/return \{ ready: false, missing: \["unknown"\] \}/.test(sr), "the shared check FAILS CLOSED");
  const au = read("supabase/functions/admin-users/index.ts");
  ok(/salesperson_ready_to_sell', \{ _user_id: to \}/.test(au) && /if \(!roles\.has\('admin'\)\)/.test(au), "Team → move all leads: never to a not-ready salesperson (an admin target is fine)");
  ok(read("supabase/config.toml").includes("[functions.quick-close]"), "quick-close keeps its config entry");
}

console.log("\n── the screens (presentation; the server decides) ──");
{
  const notReady = leadPermissions("sales", false), ready = leadPermissions("sales", true), admin = leadPermissions("admin", false);
  ok(!notReady.salesChecks && !notReady.moveToCampaign && !notReady.crawlOwnLead && (notReady.settableStatuses ?? []).length === 0, "a not-ready rep sees no selling actions");
  ok(notReady.removeFromMyLeads, "…but can still give leads back");
  ok(ready.salesChecks && ready.moveToCampaign && (ready.settableStatuses ?? []).length > 0, "a ready rep's screen is unchanged");
  ok(admin.editLeadRecord && admin.bulkAudits && admin.settableStatuses === null, "the admin is unaffected (the readiness flag is ignored)");
  ok(JSON.stringify(leadPermissions("sales")) === JSON.stringify(ready), "the default is the old behaviour (every existing caller unchanged)");
  ok(/You are not Ready to Sell yet/.test(refusalText("not_ready_to_sell")), "the refusal reads in plain words");
  ok(/NotReadyToSellBanner/.test(read("src/pages/SalesDashboard.tsx")) && /NotReadyToSellBanner/.test(read("src/components/LeadDetailDialog.tsx")), "the banner is on the Sales dashboard and in the lead workspace");
  ok(/useMyReadiness/.test(read("src/hooks/useLeadPermissions.ts")), "permissions fold in the rep's own readiness");
  const hook = read("src/hooks/useMyReadiness.ts");
  ok(/ready: q\.data\?\.ready === true/.test(hook), "the screen fails closed for a salesperson (unknown = not ready)");
}

ok(fnBody("approve_salesperson_document").includes("if d.id ~ '(^|-)draft(-|$)' then return jsonb_build_object('ok', false, 'error', 'draft_named_version')"),
  "a version named as a draft (draft v2) can never be approved — the final is added as its own version");

console.log("\n── seeds match the migration ──");
for (const d of SEED_DOCUMENT_VERSIONS) {
  ok(new RegExp(`\\('${d.id}', '${d.kind}', '[^']*', '${d.status}'`).test(MIG), `${d.id} is seeded as ${d.status}`);
}

console.log("\n── WhatsApp behaviour unchanged ──");
{
  const senders = ["supabase/functions/send-whatsapp-message/index.ts", "supabase/functions/send-whatsapp-voice/index.ts", "supabase/functions/send-whatsapp-media/index.ts",
    "supabase/functions/process-whatsapp-queue/index.ts", "supabase/functions/_shared/whatsapp-send.ts", "supabase/functions/_shared/whatsapp-inbound.ts", "supabase/functions/whatsapp-status/index.ts"];
  for (const s of senders) ok(!/salespersonOnboarding|sales-ready|tpsCheck|businessType|salesperson_onboarding|phone_tps_checks|lead_business_type_records|not_onboarded/.test(read(s)), `${s} is untouched by this work`);
  const replaced = [...MIG.matchAll(/create or replace function public\.([a-z_0-9]+)/g)].map((m) => m[1]);
  ok(!replaced.some((n) => /whatsapp|opener|queue|template|opt_?out|suppress/.test(n)), `no WhatsApp, queue, template or opt-out function is replaced (${replaced.length} functions, none of them)`);
  ok(!/contact_suppressions/.test(MIG), "the suppression / do-not-contact list is untouched");
  ok(!/call-first|call first|whatsapp_permission|whatsapp_consent/i.test(strip(MIG)), "the draft agreement's call-first WhatsApp clause is not implemented");
}

console.log("\n── business type stays display / evidence only ──");
{
  const users: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(path.join(ROOT, dir))) {
      const p = path.join(dir, n);
      if (n === "node_modules") continue;
      if (statSync(path.join(ROOT, p)).isDirectory()) walk(p);
      /* The MODULE (import path) and the table — `businessType` alone is also the audits' trade field. */
      else if (/\.(ts|tsx)$/.test(n) && /lib\/businessType(\.ts)?['"]|lead_business_type_records|lead_record_business_type/.test(read(p))) users.push(p.replace(/\\/g, "/"));
    }
  };
  walk("src"); walk("supabase/functions");
  const allowed = new Set(["src/lib/businessType.ts", "src/hooks/useLeadCompliance.ts", "src/components/LeadComplianceFacts.tsx"]);
  ok(users.every((u) => allowed.has(u)), `only the business-type display reads it (${users.join(", ")})`);
  for (const fn of ["salesperson_onboarding_missing", "trg_lead_activity_ready_to_sell", "trg_outreach_leads_assign_ready"]) ok(!/business_type/.test(fnBody(fn)), `${fn} never reads business type`);
  ok(!/business_type/.test(MIG.slice(MIG.indexOf("create or replace function public.guard_action"))), "guard_action never reads business type");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
