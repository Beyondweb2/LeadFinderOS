/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TPS / CTPS SCREENING BEFORE A CALL (built 2026-11-16, v1-tps-templates-callable; docs/tps-screening.md).
   What this proves:
     · it is SWITCHED OFF until both tpsmydata secrets exist — off = nothing read, fetched or charged;
     · once on: a UK number on either register is refused like Do Not Contact; a failed / unreadable check refuses too;
     · answers are cached per NUMBER for 28 days (never paid for twice); errors are never stored;
     · nothing can say "clear" without a genuine answer for BOTH registers;
     · it is still NOT part of Ready to Sell.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { TPS_PROVIDERS, TPSMYDATA, TPS_RECHECK_DAYS, tpsCallDecision, tpsMyDataAnswers, tpsRowFromAnswer, tpsScreenable, tpsVerdict, type TpsCheckRow, type TpsProviderInfo } from "../src/lib/tpsCheck.ts";
import { CHECKLIST_KEYS, SELLING_GATE_KEYS } from "../src/lib/salespersonOnboarding.ts";
import { CALL_FAILURE_WORDS, REDIAL_FAILURES } from "../src/lib/callManager.ts";
import { TPS_CALL_WORDS } from "../src/lib/callRules.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/^\s*--.*$/gm, "");
const MIG = read("supabase/migrations/20261010120000_salesperson_onboarding_compliance.sql");
const SCREEN = read("supabase/functions/_shared/tps-screen.ts");
const TOKEN = read("supabase/functions/twilio-voice-token/index.ts");

console.log("── switched off until Paul adds the tpsmydata secrets ──");
ok(TPS_PROVIDERS.length === 1 && TPS_PROVIDERS[0].id === "tpsmydata" && TPSMYDATA.registers.join() === "tps,ctps", "one provider: tpsmydata, both registers");
ok(SCREEN.includes('return !!(Deno.env.get("TPSMYDATA_API_KEY") ?? "").trim() && /^https:\\/\\//.test((Deno.env.get("TPSMYDATA_API_URL") ?? "").trim());'), "on = BOTH secrets set (an https address)");
ok(/if \(!tpsScreeningOn\(\)\) return \{ state: "off" \};/.test(SCREEN) && SCREEN.indexOf('return { state: "off" }') < SCREEN.indexOf('from("phone_tps_checks")'), "off → nothing is read or fetched");
ok(!/console\.(log|warn|error)\([^)]*\bkey\b/.test(strip(SCREEN)), "the key is never logged");
ok(!/TPSMYDATA_API_KEY/.test(read("src/lib/tpsCheck.ts").replace(/\/\*[\s\S]*?\*\//g, "")), "no secret in browser code");

console.log("\n── the call is refused like Do Not Contact ──");
ok(/const tps = await screenNumberForCall\(service, digits, leadId\);\s*if \(tps\.state === "registered"\) return json\(\{ ok: false, error: "tps_registered", detail: TPS_CALL_WORDS \}\);\s*if \(tps\.state === "unchecked"\) return json\(\{ ok: false, error: "tps_unchecked", detail: TPS_UNCHECKED_WORDS \}\);/.test(TOKEN), "twilio-voice-token refuses on the register, and when it could not check");
{
  const at = TOKEN.indexOf("screenNumberForCall(service, digits, leadId)");
  ok(at > TOKEN.indexOf("checkSuppressed(service") && at > TOKEN.indexOf("if (!simulated) {") && at < TOKEN.indexOf('from("call_logs").insert'), "after Do Not Contact, only for a real call, before any call row is written");
}
ok(CALL_FAILURE_WORDS.tps_registered === TPS_CALL_WORDS && /^TPS – do not call/.test(TPS_CALL_WORDS), "the words: \"TPS – do not call…\"");
ok(!REDIAL_FAILURES.has("tps_registered") && REDIAL_FAILURES.has("tps_unchecked"), "never redialled when on the register; a failed check may be tried again");
const panel = read("src/components/CallPanel.tsx");
ok(/const tpsBlocked = useLeadTpsBlock\(leadId\);/.test(panel) && /data-testid="call-tps-block"/.test(panel), "the call panel shows the block before dialling");
ok(/probeTpsMyData/.test(TOKEN) && /if \(who\.actor\.role !== "admin"\) return json\(\{ ok: false, error: "forbidden" \}, 403\);/.test(TOKEN), "the probe is admin-only");

console.log("\n── cached per number, 28 days, never twice ──");
ok(/\.eq\("phone", phone\)\.gte\("checked_at", since\)/.test(SCREEN) && SCREEN.indexOf("tpsCallDecision(rows") < SCREEN.indexOf("askTpsMyData(phone)"), "the cache is read (by number) before tpsmydata is asked");
ok(/if \(cached === "block"\) return[\s\S]*if \(cached === "clear"\) return/.test(SCREEN), "a current answer is reused — no second check");
ok(/if \(fresh\.length !== 2 \|\| fresh\.some\(\(r\) => !r\)\)[\s\S]*return \{ state: "unchecked"/.test(SCREEN) && SCREEN.indexOf('return { state: "unchecked"') < SCREEN.indexOf('.insert(fresh)'), "an unreadable answer is never stored and never clear");
ok(readdirSync(path.join(ROOT, "supabase/migrations")).includes("20261219090100_tps_checks_by_phone.sql"), "an index for the per-number read");
ok(tpsScreenable("447700900123") && tpsScreenable("441132345678") && !tpsScreenable("353851234567") && !tpsScreenable("60123456789"), "only UK numbers are screened");

const NOW = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const row = (over: Partial<TpsCheckRow> = {}): TpsCheckRow => ({ lead_id: "l1", phone: "+447700900123", register: "tps", result: "not_registered", provider: "tpsmydata", provider_reference: "REF-1", checked_at: daysAgo(1), ...over });
const both = (over: Partial<TpsCheckRow> = {}) => [row(over), row({ register: "ctps", ...over })];
ok(tpsCallDecision([], NOW) === "need_check", "no answer → check");
ok(tpsCallDecision(both(), NOW) === "clear", "both clear, current → clear (no check)");
ok(tpsCallDecision([row()], NOW) === "need_check", "one register only → check");
ok(tpsCallDecision([row({ result: "registered" })], NOW) === "block", "on the TPS → block");
ok(tpsCallDecision([row(), row({ register: "ctps", result: "registered" })], NOW) === "block", "on the CTPS → block");
ok(tpsCallDecision(both({ checked_at: daysAgo(TPS_RECHECK_DAYS + 1) }), NOW) === "need_check", `older than ${TPS_RECHECK_DAYS} days → re-check`);
ok(tpsCallDecision(both({ checked_at: daysAgo(TPS_RECHECK_DAYS - 1) }), NOW) === "clear", `under ${TPS_RECHECK_DAYS} days → reused`);
ok(tpsCallDecision(both({ provider: "someone-else" }), NOW) === "need_check", "an unknown provider's row never counts");
ok(tpsCallDecision(both({ provider_reference: " " }), NOW) === "need_check", "no reference → not an answer");

console.log("\n── reading tpsmydata's answer (strict) ──");
const yes = (a: ReturnType<typeof tpsMyDataAnswers>) => a.every((x) => x.ok);
ok(yes(tpsMyDataAnswers({ tps: false, ctps: true, reference: "R9" }, "fb")) && tpsMyDataAnswers({ tps: false, ctps: true, reference: "R9" }, "fb").map((x) => x.ok && x.result).join() === "not_registered,registered", "booleans read per register");
ok(yes(tpsMyDataAnswers({ results: [{ on_tps: "No", on_ctps: "No" }] }, "fb")), "the first of results[] read");
ok(yes(tpsMyDataAnswers({ data: { tps_status: "Not Registered", ctps_status: "Registered" } }, "fb")), "words read");
ok(!yes(tpsMyDataAnswers({ tps: false }, "fb")), "one register missing → error (never half an answer)");
ok(!yes(tpsMyDataAnswers({ tps: "maybe", ctps: false }, "fb")), "an unknown value → error");
ok(!yes(tpsMyDataAnswers({ status: "ok" }, "fb")) && !yes(tpsMyDataAnswers(null, "fb")) && !yes(tpsMyDataAnswers("x", "fb")), "an unknown shape → error");
{
  const a = tpsMyDataAnswers({ tps: false, ctps: false }, "tpsmydata Thu, 20 Nov 2026 12:00:00 GMT");
  const r = a.map((x) => tpsRowFromAnswer(x, { providerId: "tpsmydata", leadId: "l1", phone: "+447700900123", checkedAt: NOW.toISOString() }));
  ok(r.every((x) => !!x && x.provider_reference.startsWith("tpsmydata ")), "no reference in the body → the response date names it");
}
ok(tpsRowFromAnswer({ ok: false, error: "x" }, { providerId: "tpsmydata", leadId: null, phone: "+44", checkedAt: NOW.toISOString() }) === null, "an error is never stored");

console.log("\n── the verdict still cannot say clear without a genuine answer ──");
const TEST: TpsProviderInfo[] = [{ id: "test-provider", name: "Test Provider", registers: ["tps", "ctps"] }];
ok(!tpsVerdict(both({ provider: "test-provider" }), NOW).screenedClear, "a provider that is not connected never reads clear");
ok(tpsVerdict(both({ provider: "test-provider" }), NOW, TEST).screenedClear, "a connected provider: both registers clear and current = clear");
ok(/provider_reference text not null check \(char_length\(btrim\(provider_reference\)\) > 0\)/.test(MIG), "the database refuses a stored answer without a provider reference");
ok(/revoke all on public\.phone_tps_checks from public, anon, authenticated;\ngrant select on public\.phone_tps_checks to authenticated;/.test(MIG), "signed-in users may only read it (only the service role writes)");

console.log("\n── still NOT part of Ready to Sell ──");
ok(![...CHECKLIST_KEYS, ...SELLING_GATE_KEYS].some((k) => /tps/i.test(k)), "not a checklist item and not a selling-gate key");
{
  const defs = readdirSync(path.join(ROOT, "supabase/migrations")).filter((n) => n.endsWith(".sql"))
    .filter((n) => read(`supabase/migrations/${n}`).includes("create or replace function public.salesperson_onboarding_missing")).sort();
  const latest = read(`supabase/migrations/${defs[defs.length - 1]}`);
  const s = latest.indexOf("create or replace function public.salesperson_onboarding_missing");
  ok(s >= 0 && !/tps|ctps/i.test(strip(latest.slice(s, latest.indexOf("$;", s)))), `the live selling gate (${defs[defs.length - 1]}) never reads TPS/CTPS`);
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
