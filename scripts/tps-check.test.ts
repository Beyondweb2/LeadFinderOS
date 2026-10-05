/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TPS / CTPS — POSTPONED BY PAUL (2026-10-05, docs/salesperson-onboarding.md §5).
   What this proves now:
     · it is NOT part of Ready to Sell, it does NOT block a call, and no provider or external API exists;
     · the dormant groundwork still cannot say "clear" without a genuine answer, for the day it is switched on.
   (The live test supabase/tests/salesperson-onboarding-rls.sql proves a ready rep logs calls with no TPS
   provider and no TPS result.)
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { TPS_PROVIDERS, TPS_RECHECK_DAYS, tpsRowFromAnswer, tpsVerdict, type TpsCheckRow, type TpsProviderInfo } from "../src/lib/tpsCheck.ts";
import { BLOCKING_KEYS } from "../src/lib/salespersonOnboarding.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/^\s*--.*$/gm, "");
const MIG = read("supabase/migrations/20261010120000_salesperson_onboarding_compliance.sql");

const files: string[] = [];
const walk = (dir: string) => {
  for (const n of readdirSync(path.join(ROOT, dir))) {
    const p = path.join(dir, n);
    if (n === "node_modules") continue;
    if (statSync(path.join(ROOT, p)).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(n)) files.push(p.replace(/\\/g, "/"));
  }
};
walk("src"); walk("supabase/functions");

console.log("── postponed: nothing active ──");
ok(TPS_PROVIDERS.length === 0, "no provider is registered");
ok(!files.some((p) => /tpsapi|tpschecker|tps-check|TPSAPI_|TPS_API/i.test(strip(read(p)))), "no external TPS/CTPS API, endpoint, secret or edge function exists");
ok(!files.some((p) => p.startsWith("supabase/functions/") && /phone_tps_checks|tpsCheck/.test(read(p))), "no edge function reads or writes TPS state");
const users = files.filter((p) => p !== "src/lib/tpsCheck.ts" && /from ['"]@\/lib\/tpsCheck['"]|tpsCheck\.ts['"]/.test(read(p)));
ok(users.length === 0, `no screen or hook imports the TPS module (${users.join(", ") || "none"})`);
ok(!/TPS|CTPS/.test(strip(read("src/components/ProspectFacts.tsx"))), "the lead card shows no TPS/CTPS line (nothing that looks broken)");

console.log("\n── TPS/CTPS is NOT part of Ready to Sell, and does NOT block a call ──");
ok(!BLOCKING_KEYS.some((k) => /tps/i.test(k)), "not a Ready to Sell item");
const gateFns = ["salesperson_onboarding_missing", "trg_lead_activity_ready_to_sell", "trg_outreach_leads_assign_ready", "trg_outreach_leads_sold_by_ready"];
for (const fn of gateFns) {
  const start = MIG.indexOf(`create or replace function public.${fn}`);
  const body = MIG.slice(start, MIG.indexOf("$$;", start));
  ok(start > 0 && !/tps|ctps/i.test(body), `${fn} never reads TPS/CTPS`);
}
const guard = MIG.slice(MIG.indexOf("create or replace function public.guard_action"));
ok(!/tps|ctps/i.test(guard), "guard_action never reads TPS/CTPS");
ok(!/call_outcome/.test(MIG.slice(MIG.indexOf("function public.trg_lead_activity_ready_to_sell"), MIG.indexOf("drop trigger if exists trg_lead_activity_ready_to_sell"))),
  "the call gate is onboarding only: a READY rep's call is not filtered by kind or by any screening result");
for (const p of ["src/components/LeadCrmPanel.tsx", "src/components/ColdCallPlaybook.tsx", "src/components/OutreachTable.tsx", "src/components/OutreachMobileCard.tsx"]) {
  ok(!/\b(tps|ctps)\b|phone_tps_checks|tpsCheck/i.test(strip(read(p))), `${p} (call button / call screen) has no TPS dependency`);
}

console.log("\n── the dormant groundwork still cannot say clear without a genuine answer ──");
const NOW = new Date("2026-10-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const row = (over: Partial<TpsCheckRow> = {}): TpsCheckRow => ({ lead_id: "l1", phone: "+441234567890", register: "tps", result: "not_registered", provider: "test-provider", provider_reference: "REF-1", checked_at: daysAgo(1), ...over });
const TEST: TpsProviderInfo[] = [{ id: "test-provider", name: "Test Provider", registers: ["tps", "ctps"] }];
const both = (over: Partial<TpsCheckRow> = {}) => [row(over), row({ register: "ctps", provider_reference: "REF-2", ...over })];
ok(!tpsVerdict(both(), NOW).screenedClear, "with no provider registered, even a stored 'not registered' is not clear");
ok(tpsVerdict(both(), NOW, TEST).screenedClear, "with a provider: both registers clear and current = clear");
ok(tpsVerdict([row()], NOW, TEST).state === "partial", "one register only: not clear");
ok(tpsVerdict(both({ result: "registered" }), NOW, TEST).state === "registered", "registered: not clear");
ok(tpsVerdict(both({ checked_at: daysAgo(TPS_RECHECK_DAYS + 1) }), NOW, TEST).state === "expired", `older than ${TPS_RECHECK_DAYS} days: expired`);
ok(tpsVerdict(both({ provider_reference: " " }), NOW, TEST).state === "not_checked", "no provider reference: not an answer");
ok(tpsRowFromAnswer({ ok: false, error: "x" }, { providerId: "test-provider", leadId: null, phone: "+44", checkedAt: NOW.toISOString() }, TEST) === null, "an error is never stored");
ok(/provider_reference text not null check \(char_length\(btrim\(provider_reference\)\) > 0\)/.test(MIG), "the database refuses a stored answer without a provider reference");
ok(/revoke all on public\.phone_tps_checks from public, anon, authenticated;\ngrant select on public\.phone_tps_checks to authenticated;/.test(MIG), "signed-in users may only read it (nothing writes it today)");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
