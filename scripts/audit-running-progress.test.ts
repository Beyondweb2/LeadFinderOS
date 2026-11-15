/* wholeAuditProgress — a running audit's progress on the Past audits row is for the WHOLE audit:
 * "Run 2 of 3 · 20 of 40 searches" and the % = 60 of 120 = 50%. Runs come from measuringState (the
 * report's "X of Y runs"), searches from the run's queue counts. A queued audit says "Queued".
 * Run: npx tsx scripts/audit-running-progress.test.ts */
import { wholeAuditProgress } from "../src/lib/auditRunningProgress.ts";
import { readFileSync } from "node:fs";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const now = new Date().toISOString();
const run = (status: string, done = 0, total = 0) => ({ status, created_at: now, done, total });

console.log("── Paul's example: run 2 of 3, 20 of 40 searches ──");
{
  const p = wholeAuditProgress([run("complete"), run("running", 20, 40)], 3);
  ok(p?.label === "Run 2 of 3 · 20 of 40 searches", `label "${p?.label}"`);
  ok(p?.pct === 50 && p.doneAll === 60 && p.totalAll === 120, `whole audit ${p?.doneAll} of ${p?.totalAll} = ${p?.pct}%`);
}

console.log("\n── Run 1 of 3 just started ──");
{
  const p = wholeAuditProgress([run("running", 4, 40)], 3);
  ok(p?.label === "Run 1 of 3 · 4 of 40 searches" && p.pct === 3, `${p?.label} · ${p?.pct}%`);
}

console.log("\n── Last run nearly done ──");
{
  const p = wholeAuditProgress([run("complete"), run("complete"), run("running", 39, 40)], 3);
  ok(p?.label === "Run 3 of 3 · 39 of 40 searches" && p.pct === 99, `${p?.label} · ${p?.pct}%`);
}

console.log("\n── Single-run audit: no 'Run 1 of 1' noise ──");
{
  const p = wholeAuditProgress([run("running", 18, 40)], null);
  ok(p?.label === "18 of 40 searches" && p.pct === 45, `${p?.label} · ${p?.pct}%`);
}

console.log("\n── Queued: queue rows not readable yet ──");
{
  const p = wholeAuditProgress([run("complete"), run("pending", 0, 0)], 3);
  ok(p?.label === "Queued" && p.pct === null, `"${p?.label}"`);
}

console.log("\n── Two runs overlapping (the stagger) ──");
{
  const p = wholeAuditProgress([run("complete"), run("running", 30, 40), run("running", 5, 40)], 3);
  ok(p?.label === "Runs 2–3 of 3 · 35 of 80 searches" && p.doneAll === 75 && p.pct === 63, `${p?.label} · ${p?.pct}%`);
}

console.log("\n── A failed run does not count as a finished one (same as the report) ──");
{
  const p = wholeAuditProgress([run("failed"), run("running", 20, 40)], 3);
  ok(p?.label === "Run 1 of 3 · 20 of 40 searches" && p.pct === 17, `${p?.label} · ${p?.pct}%`);
}

console.log("\n── More runs seen than the target says: target grows, % never above 100 ──");
{
  const p = wholeAuditProgress([run("complete"), run("running", 40, 40)], 1);
  ok(p?.label === "Run 2 of 2 · 40 of 40 searches" && p.pct === 100, `${p?.label} · ${p?.pct}%`);
}

console.log("\n── Nothing in flight → null (row shows its result) ──");
ok(wholeAuditProgress([run("complete")], 3) === null, "settled audit → null");

console.log("\n── The row uses this function, not a second count ──");
{
  const src = readFileSync(new URL("../src/components/audit/AuditBusinessBlock.tsx", import.meta.url), "utf8");
  ok(src.includes("wholeAuditProgress(audit.runs, audit.baseline_target_runs)"), "RunningProgress calls wholeAuditProgress");
  ok(!/function progressOf\b/.test(src), "the old in-flight-only progressOf is gone");
  const lib = readFileSync(new URL("../src/lib/auditRunningProgress.ts", import.meta.url), "utf8");
  ok(lib.includes("measuringState(runs, targetRuns)"), "runs done / target come from measuringState");
}

if (f) { console.error(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
