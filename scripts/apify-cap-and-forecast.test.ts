/* The Apify cap and the spend forecast (Paul, 2026-09-28). The cap that blocks is Apify's own account
   limit — read from Apify, never a number of ours — and the screen shows that same number. Warnings at
   80 / 90 / 95% never block. Forecasts quote the observed billed cost; the ledger rate is unchanged.
   Run: npx tsx scripts/apify-cap-and-forecast.test.ts */
import { readFileSync } from "node:fs";
import { apifyTone, apifyWarningText, APIFY_WARN_PCT, APIFY_HIGH_PCT, APIFY_CRITICAL_PCT } from "../src/lib/apifyTiers.ts";
import { AUDIT_EST_USD_PER_QUESTION } from "../src/lib/marketView.ts";
import { RE_AUDIT_EST_USD_PER_QUESTION } from "../src/lib/reAudit.ts";
import { DISCOVERY_USD_PER_QUESTION_RUN } from "../supabase/functions/_shared/baseline-discovery.ts";
import { AI_SEARCH_USD_PER_QUESTION } from "../supabase/functions/_shared/enrichment/sources.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const norm = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("── the enforced cap is Apify's, and the screen shows the same one ──");
const writer = norm("../supabase/functions/_shared/enrichment/apify-usage.ts");
ok(/limits\.maxMonthlyUsageUsd === "number" \? limits\.maxMonthlyUsageUsd : null/.test(writer), "the snapshot takes the cap from Apify's limits (no default, no constant)");
ok(/max_monthly_usage_usd: snap\.maxMonthlyUsageUsd/.test(writer), "and stores exactly that");
const status = norm("../supabase/functions/apify-usage-status/index.ts");
ok(/const cap = data\.max_monthly_usage_usd === null \? null : Number\(data\.max_monthly_usage_usd\)/.test(status), "the screen reads the same stored cap");
ok(!/\b(175|30|40)(\.0+)?\s*[,;)]/.test(status.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "").replace(/60|1000/g, "")), "no cap number written into the status function");
// $40 cap arithmetic — the percentage the operator sees is used / cap.
const pctAt = (used: number) => used / 40;
ok(apifyTone(pctAt(25.94)) === "ok" && apifyWarningText(pctAt(25.94)) === null, "$25.94 of $40 (65%): no warning");
ok(apifyTone(pctAt(32)) === "warn" && apifyTone(pctAt(36)) === "high" && apifyTone(pctAt(38)) === "critical", "$32 / $36 / $38 of $40 → 80 / 90 / 95% tiers");
ok(apifyTone(pctAt(25.94 * 40 / 30)) !== "ok", "the same spend against the old $30 cap WAS a warning (86%) — the cap is what moves the tier");

console.log("── warnings never claim a block ──");
ok(APIFY_WARN_PCT === 0.8 && APIFY_HIGH_PCT === 0.9 && APIFY_CRITICAL_PCT === 0.95, "tiers are 80 / 90 / 95%");
for (const [p, at] of [[0.8, "80%"], [0.91, "90%"], [0.96, "95%"]] as const) {
  const t = apifyWarningText(p)!;
  ok(t.includes(`Over ${at}`) && /Nothing is blocked yet/.test(t), `${p * 100}%: "${t.slice(0, 45)}…"`);
}
ok(/At the Apify cap/.test(apifyWarningText(1)!), "at 100% it says the cap stops them");
ok(apifyWarningText(0.79) === null && apifyWarningText(null) === null && apifyWarningText(NaN) === null, "below 80% or unreadable: nothing");

console.log("── forecasts use the observed cost; the ledger does not move ──");
ok(AUDIT_EST_USD_PER_QUESTION === 0.014 && RE_AUDIT_EST_USD_PER_QUESTION === 0.014 && DISCOVERY_USD_PER_QUESTION_RUN === 0.014,
  "Coverage, re-audit and paid-baseline discovery estimates all quote $0.014/question");
ok(Math.abs((17.35 + 5.80) / 1668 - 0.0139) < 0.0001, "provenance: $23.15 billed over 1,668 questions = $0.0139");
ok(AI_SEARCH_USD_PER_QUESTION === 0.0104, "the ledger/reserve rate is unchanged (charging logic untouched)");
ok(AUDIT_EST_USD_PER_QUESTION >= AI_SEARCH_USD_PER_QUESTION, "a quote is never below the reserve");
ok(/rule: 'quote >= reserve'/.test(norm("./check-cross-repo-sync.mjs")), "the sync check enforces quote >= reserve rather than equality");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILED`);
if (f > 0) process.exit(1);
