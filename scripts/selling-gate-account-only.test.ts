/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SELLING GATE IS ACCOUNT RESTRICTIONS ONLY (sales-team-today release, Paul, 2026-10-06).
   Migration 20261012120000_selling_gate_account_only.sql. The practical onboarding checklist — 18+, right to
   work, bank details, VAT, individual / company, start date, team guide — is Paul's admin record on the Team
   page and NO LONGER BLOCKS SELLING. Only genuine account restrictions do: no sales role (not_sales), login
   off / no team member (login), suspended, engagement ended.
   ⛔ This suite FAILS if anyone reintroduces the old hard gate — in the database rule, in the screen's rule,
      in the permissions, in the lead popup, or in the words a salesperson reads.
   Run: npx tsx scripts/selling-gate-account-only.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  CHECKLIST_KEYS, SELLING_GATE_KEYS, emptyOnboardingRecord, onboardingSummary, type MemberState, type OnboardingRecord,
} from "../src/lib/salespersonOnboarding.ts";
import { leadPermissions } from "../src/lib/access.ts";
import { notReadyMessage } from "../src/lib/readinessWords.ts";
import { NOT_READY_DETAIL } from "../src/lib/protectionLimits.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const stripTs = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

console.log("── (a)(b) the database rule: the NEWEST definition of salesperson_onboarding_missing ──");
{
  const MIGS = "supabase/migrations";
  const SIG = "create or replace function public.salesperson_onboarding_missing";
  const definers = readdirSync(path.join(ROOT, MIGS)).filter((n) => n.endsWith(".sql")).filter((n) => read(`${MIGS}/${n}`).includes(SIG)).sort();
  const newest = definers[definers.length - 1];
  ok(!!newest && newest.slice(0, 14) >= "20261012120000", `the newest definition is the account-only gate or later (${newest})`);
  const txt = read(`${MIGS}/${newest}`);
  const lastAt = txt.lastIndexOf(SIG);
  const body = txt.slice(lastAt, txt.indexOf("$$;", lastAt)).replace(/--[^\n]*/g, "");
  ok(body.length > 100 && /returns text\[\]/.test(body), "the function body was found");
  for (const needle of ["age_18_confirmed_on", "rtw_", "bank_details_received_on", "vat_registered", "contractor_type", "start_date", "team_guide", "salesperson_document_versions", "agreement", "privacy_notice", "tps"]) {
    ok(!body.includes(needle), `the selling gate does not read "${needle}"`);
  }
  const emitted = new Set([
    ...[...body.matchAll(/m := m \|\| '([a-z_0-9]+)'/g)].map((x) => x[1]),
    ...[...body.matchAll(/array\['([a-z_0-9]+)'\]/g)].map((x) => x[1]),
  ]);
  ok(emitted.size > 0, `it returns keys (${[...emitted].join(", ")})`);
  for (const k of emitted) ok((SELLING_GATE_KEYS as readonly string[]).includes(k), `"${k}" is a selling-gate key (an account restriction)`);
  for (const k of SELLING_GATE_KEYS) ok(emitted.has(k), `the gate can still return "${k}"`);
  ok(!/'::text|\|\| '[a-z_]+'/.test(body.replace(/m := m \|\| '[a-z_0-9]+'::text/g, "")), "no other way of adding a key to the answer");
  ok(/revoke all on function public\.salesperson_onboarding_missing\(uuid\) from public, anon, authenticated;/.test(txt.slice(lastAt))
    && /grant execute on function public\.salesperson_onboarding_missing\(uuid\) to service_role;/.test(txt.slice(lastAt)), "still service-role only");
  /* Every other gate reads this one function — none reads a checklist column itself. */
  const READY = "create or replace function public.salesperson_ready_to_sell";
  const rdefs = readdirSync(path.join(ROOT, MIGS)).filter((n) => n.endsWith(".sql")).filter((n) => read(`${MIGS}/${n}`).includes(READY)).sort();
  const rtxt = read(`${MIGS}/${rdefs[rdefs.length - 1]}`);
  const rbody = rtxt.slice(rtxt.lastIndexOf(READY), rtxt.indexOf("$$;", rtxt.lastIndexOf(READY)));
  ok(/select cardinality\(public\.salesperson_onboarding_missing\(_user_id\)\) = 0/.test(rbody), "salesperson_ready_to_sell is still exactly 'nothing missing' from the one rule");
  const sr = read("supabase/functions/_shared/sales-ready.ts");
  ok(/rpc\("salesperson_onboarding_missing"/.test(sr), "quick-close's edge check asks the same one rule");
  const ck = (s: string) => s.replace(/--[^\n]*/g, "");
  const later = readdirSync(path.join(ROOT, MIGS)).filter((n) => n.endsWith(".sql") && n.slice(0, 14) >= "20261012120000");
  for (const n of later) {
    const t = ck(read(`${MIGS}/${n}`));
    for (const fn of ["guard_action", "trg_lead_activity_ready_to_sell", "trg_outreach_leads_assign_ready"]) {
      const at = t.indexOf(`create or replace function public.${fn}`);
      if (at >= 0) ok(!/age_18|rtw_|bank_details|vat_registered|contractor_type|start_date|team_guide/.test(t.slice(at, t.indexOf("$$;", at))), `${n}: ${fn} reads no checklist column`);
    }
  }
}

console.log("\n── (c) the screen's rule: onboardingSummary ──");
{
  const TODAY = "2026-10-20";
  const ACTIVE: MemberState = { status: "active", role: "sales", suspended_at: null, has_signed_in: true };
  const empty = emptyOnboardingRecord("u1");
  const s = onboardingSummary(empty, ACTIVE, [], TODAY);
  ok(s.readyToSell && s.missing.length > 0, `an EMPTY checklist on an active sales login → CAN sell (checklist ${s.done}/${s.total})`);
  ok(onboardingSummary(null, ACTIVE, [], TODAY).readyToSell, "no record at all → CAN sell");
  ok(!onboardingSummary(empty, { ...ACTIVE, suspended_at: "2026-10-10T10:00:00Z" }, [], TODAY).readyToSell, "suspended → cannot sell");
  ok(!onboardingSummary(empty, { ...ACTIVE, status: "disabled" }, [], TODAY).readyToSell, "login disabled → cannot sell");
  ok(!onboardingSummary(empty, { status: "disabled", role: null }, [], TODAY).readyToSell, "disabled and the sales role removed → cannot sell");
  ok(!onboardingSummary(empty, { status: "active", role: null }, [], TODAY).readyToSell, "no sales role → cannot sell");
  const ended: OnboardingRecord = { ...empty, end_date: "2026-10-15", end_reason: "resigned" } as OnboardingRecord;
  ok(!onboardingSummary(ended, ACTIVE, [], TODAY).readyToSell, "end date in the past → cannot sell");
  ok(!onboardingSummary({ ...ended, end_date: TODAY } as OnboardingRecord, ACTIVE, [], TODAY).readyToSell, "end date today → cannot sell (ended = today or earlier)");
  ok(onboardingSummary({ ...ended, end_date: "2026-11-01", end_reason: "ended_on_notice" } as OnboardingRecord, ACTIVE, [], TODAY).readyToSell, "end date still to come → can sell");
  ok(onboardingSummary({ ...empty, start_date: "2026-12-01" } as OnboardingRecord, ACTIVE, [], TODAY).readyToSell, "a FUTURE start date → can sell");
  ok(onboardingSummary(empty, ACTIVE, [], TODAY, []).readyToSell && !onboardingSummary(empty, ACTIVE, [], TODAY, ["suspended"]).readyToSell, "the server's answer still decides when supplied");
  ok(!(SELLING_GATE_KEYS as readonly string[]).some((k) => ["age_18", "right_to_work", "bank_details", "vat", "contractor_status", "start_date", "team_guide", "not_started"].includes(k)),
    "SELLING_GATE_KEYS names no checklist item");
  ok(CHECKLIST_KEYS.length === 8, "the checklist itself is kept (admin information)");
}

console.log("\n── (d) permissions: src/lib/access.ts ──");
{
  const ready = leadPermissions("sales", true), notReady = leadPermissions("sales", false), admin = leadPermissions("admin", false);
  ok(ready.salesChecks && ready.moveToCampaign && (ready.settableStatuses ?? []).length > 0, "a salesperson who can sell has the selling actions");
  ok(!notReady.salesChecks && !notReady.moveToCampaign && (notReady.settableStatuses ?? []).length === 0, "a restricted salesperson does not");
  ok(admin.salesChecks !== undefined && admin.settableStatuses === null && admin.editLeadRecord, "the admin is never gated");
  ok(JSON.stringify(leadPermissions("sales")) === JSON.stringify(ready), "the default (no flag) is selling");
}

console.log("\n── (e) the lead popup does not carry the banner ──");
{
  ok(!/NotReadyToSellBanner/.test(read("src/components/LeadDetailDialog.tsx")), "src/components/LeadDetailDialog.tsx does not mount NotReadyToSellBanner");
  const banner = read("src/components/NotReadyToSellBanner.tsx");
  ok(/Your sales access is not active/.test(banner) && !/onboarding|Ready to Sell|team guide/i.test(stripTs(banner)), "the banner speaks of sales access only");
}

console.log("\n── (f) the old wording is gone from src/ ──");
{
  /* Code only (comments stripped). src/lib/whatsNew.ts is the dated release-notes record: an old entry may quote
     what an older release said; it is not live wording. */
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(path.join(ROOT, d))) { const p = `${d}/${n}`; if (statSync(path.join(ROOT, p)).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n)) files.push(p); } };
  walk("src");
  for (const needle of ["Complete your onboarding before using", "You are not Ready to Sell yet", "Complete your onboarding"]) {
    const hits = files.filter((p) => p !== "src/lib/whatsNew.ts" && stripTs(read(p)).includes(needle));
    ok(hits.length === 0, `no live src wording says "${needle}" (${hits.join(", ") || "none"})`);
  }
}

console.log("\n── (g) the refusal words ──");
{
  const m = notReadyMessage("Find Leads", ["suspended"]);
  ok(/sales access is not active/.test(m) && !/onboarding/i.test(m), `notReadyMessage('Find Leads', ['suspended']) = "${m}"`);
  ok(NOT_READY_DETAIL === "Your sales access is not active. Speak to Paul.", "the server-refusal detail says the same");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
