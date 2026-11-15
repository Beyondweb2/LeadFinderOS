/* The Past audits list: the type badge comes from the recorded purpose, and a re-scored copy is recognised by its runs
   being older than the audit that holds them (so its copied cost is not shown as spend). Pure; no database. */
import { auditTypeOf, isRescoredCopy } from "../src/lib/auditListSummary.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const run = (mention_rate: number | null, seo_grade: string | null = null) => ({ mention_rate, seo_grade, status: "complete" });

ok(auditTypeOf({ audit_purpose: "discovery", runs: [run(0.2)] }).label === "Discovery", "discovery purpose -> Discovery");
ok(auditTypeOf({ audit_purpose: "targeted", runs: [run(null)] }).label === "Baseline", "targeted -> Baseline");
ok(auditTypeOf({ audit_purpose: "baseline", baseline_target_runs: 3, runs: [run(0.1)] }).label === "Baseline", "baseline -> Baseline");
ok(auditTypeOf({ audit_purpose: "free_check", baseline_target_runs: 3, runs: [run(0.1)] }).key === "quick", "a 3-run free check is a Quick check, not a baseline");
ok(auditTypeOf({ audit_purpose: "audit", runs: [run(null, "B")] }).key === "website", "grade and no AI measured -> Website check");
ok(auditTypeOf({ audit_purpose: "audit", runs: [run(0.3, "B")] }).key === "quick", "AI measured and graded -> still Quick check");
ok(auditTypeOf({ audit_purpose: null, baseline_target_runs: 3, is_measurement: true, runs: [] }).key === "measurement", "legacy multi-run measurement");

const made = "2026-11-15T04:34:17Z";
ok(isRescoredCopy({ created_at: made, runs: [{ created_at: "2026-11-15T02:40:26Z" }] }) === true, "runs older than the audit -> re-scored copy");
ok(isRescoredCopy({ created_at: made, runs: [{ created_at: "2026-11-15T04:34:18Z" }] }) === false, "runs made with the audit -> not a copy");
ok(isRescoredCopy({ created_at: made, runs: [] }) === false, "no runs -> not a copy");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
