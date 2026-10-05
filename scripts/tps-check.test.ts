/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TPS / CTPS STATE (2026-10-05, docs/salesperson-onboarding.md §5).
   ⛔ The property under test: NOTHING can read as screened-clear without a genuine answer from a
   connected provider, for both registers, inside the recheck window. Today no provider is connected, so
   every number must read "not screened" — even if a row claiming "not registered" were somehow stored.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  TPS_PROVIDERS, TPS_RECHECK_DAYS, tpsRowFromAnswer, tpsVerdict, type TpsCheckRow, type TpsProviderInfo,
} from "../src/lib/tpsCheck.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const NOW = new Date("2026-10-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const row = (over: Partial<TpsCheckRow> = {}): TpsCheckRow => ({
  lead_id: "l1", phone: "+441234567890", register: "tps", result: "not_registered", provider: "test-provider", provider_reference: "REF-1", checked_at: daysAgo(1), ...over,
});
const TEST: TpsProviderInfo[] = [{ id: "test-provider", name: "Test Provider", registers: ["tps", "ctps"] }];
const both = (over: Partial<TpsCheckRow> = {}) => [row(over), row({ register: "ctps", provider_reference: "REF-2", ...over })];

console.log("── today: no provider is connected ──");
ok(TPS_PROVIDERS.length === 0, "TPS_PROVIDERS is empty — nothing is connected");
{
  const v = tpsVerdict([], NOW);
  ok(v.state === "no_service" && !v.screenedClear, `no rows: ${v.label}`);
  const forged = tpsVerdict(both(), NOW);
  ok(forged.state === "no_service" && !forged.screenedClear, "rows claiming 'not registered' from an unconnected provider are ignored — still not screened");
  ok(/Do not treat this number as screened/.test(v.detail), "the card tells the caller plainly it is not screened");
}

console.log("\n── with a connected provider (injected for the test) ──");
{
  const clear = tpsVerdict(both(), NOW, TEST);
  ok(clear.state === "clear" && clear.screenedClear, "both registers not registered, recent, with references: clear");
  ok(tpsVerdict([row()], NOW, TEST).state === "partial", "only the TPS checked: partial, not clear");
  ok(tpsVerdict([row({ register: "ctps" })], NOW, TEST).state === "partial", "only the CTPS checked: partial, not clear");
  const reg = tpsVerdict(both({ result: "registered" }), NOW, TEST);
  ok(reg.state === "registered" && !reg.screenedClear && /Do not make a sales call/.test(reg.detail), "registered: do not call");
  ok(tpsVerdict([row({ result: "registered" }), row({ register: "ctps" })], NOW, TEST).state === "registered", "registered on one register wins over clear on the other");
  ok(tpsVerdict(both({ checked_at: daysAgo(TPS_RECHECK_DAYS + 1) }), NOW, TEST).state === "expired", `older than ${TPS_RECHECK_DAYS} days: expired, not clear`);
  ok(tpsVerdict(both({ checked_at: daysAgo(TPS_RECHECK_DAYS - 1) }), NOW, TEST).state === "clear", "inside the window: clear");
  ok(tpsVerdict(both({ provider_reference: "  " }), NOW, TEST).state === "not_checked", "a blank provider reference is not an answer");
  ok(tpsVerdict(both({ provider: "manual" }), NOW, TEST).state === "not_checked", "a provider not in the registry (e.g. a manual tick) is not an answer");
  ok(tpsVerdict(both({ checked_at: new Date(NOW.getTime() + 3_600_000).toISOString() }), NOW, TEST).state === "not_checked", "a future-dated check is not an answer");
  ok(tpsVerdict(both({ result: "probably_fine" as TpsCheckRow["result"] }), NOW, TEST).state === "not_checked", "an unknown result is not an answer");
  ok(tpsVerdict([], NOW, TEST).state === "not_checked", "no rows: not checked");
  const newer = tpsVerdict([...both({ checked_at: daysAgo(10) }), row({ result: "registered", checked_at: daysAgo(2) })], NOW, TEST);
  ok(newer.state === "registered", "the newest answer per register is the one that counts");
}

console.log("\n── the provider boundary stores only genuine answers ──");
{
  const ctx = { providerId: "test-provider", leadId: "l1", phone: "+441234567890", checkedAt: NOW.toISOString() };
  ok(tpsRowFromAnswer({ ok: true, register: "tps", result: "not_registered", reference: "R1" }, ctx, TEST)?.provider_reference === "R1", "a real answer becomes a row");
  ok(tpsRowFromAnswer({ ok: false, error: "timeout" }, ctx, TEST) === null, "an error is never stored");
  ok(tpsRowFromAnswer(null, ctx, TEST) === null, "no answer is never stored");
  ok(tpsRowFromAnswer({ ok: true, register: "tps", result: "not_registered", reference: " " }, ctx, TEST) === null, "a blank reference is never stored");
  ok(tpsRowFromAnswer({ ok: true, register: "tps", result: "not_registered", reference: "R1" }, { ...ctx, providerId: "other" }, TEST) === null, "an unknown provider is never stored");
  ok(tpsRowFromAnswer({ ok: true, register: "tps", result: "not_registered", reference: "R1" }, ctx) === null, "with no connected provider, nothing is ever stored");
  ok(tpsRowFromAnswer({ ok: true, register: "ctps", result: "not_registered", reference: "R1" }, ctx, [{ id: "test-provider", name: "TPS only", registers: ["tps"] }]) === null, "a register the provider does not screen is never stored");
}

console.log("\n── the database refuses a hand-made 'clear' ──");
{
  const mig = read("supabase/migrations/20261010120000_salesperson_onboarding_compliance.sql");
  const t = mig.slice(mig.indexOf("create table if not exists public.phone_tps_checks"), mig.indexOf("create index if not exists phone_tps_checks_lead"));
  ok(/provider text not null check \(char_length\(btrim\(provider\)\) > 0\)/.test(t), "provider is required");
  ok(/provider_reference text not null check \(char_length\(btrim\(provider_reference\)\) > 0\)/.test(t), "provider reference is required");
  ok(/result text not null check \(result in \('registered', 'not_registered'\)\)/.test(t), "result is one of two values");
  ok(/revoke all on public\.phone_tps_checks from public, anon, authenticated;\ngrant select on public\.phone_tps_checks to authenticated;/.test(mig), "signed-in users may only READ (no insert, update or delete)");
  ok(/phone_tps_checks_sales_read[\s\S]*?lead_id in \(select public\.my_sales_lead_ids\(\)\)/.test(mig), "a salesperson reads only their own leads' checks");
}

console.log("\n── nothing tells a caller a number is safe without a genuine check ──");
{
  /* Comments may discuss the rule; only code and on-screen text count. */
  const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(path.join(ROOT, dir))) {
      const p = path.join(dir, n);
      if (statSync(path.join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(n) && /safe to call|tps[- ]?(cleared|safe)/i.test(stripComments(read(p)))) hits.push(p);
    }
  };
  walk("src");
  ok(hits.length === 0, `no screen says "safe to call" (${hits.join(", ") || "none"})`);
  const card = read("src/components/LeadComplianceFacts.tsx");
  ok(/TpsValue/.test(card) && /t\.label/.test(card) && !/screenedClear \?[^:]*safe/i.test(card), "the card prints the verdict's own words");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
