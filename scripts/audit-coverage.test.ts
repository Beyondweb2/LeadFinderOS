/* The London Domestic Maintenance case (21 Nov 2026): 39 questions x 3 runs, 47 rows answered. Pins the app page's
   "in progress" rule and the per-run cap that caused it. */
import { auditCoverage } from "../src/lib/auditCoverage.ts";
import { auditRunCapUsd, AUDIT_RUN_CAP_USD } from "../src/lib/auditLimits.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const mk = (perRun: number, doneByRun: number[]) => ({
  runs: doneByRun.map((_, i) => ({ id: "r" + i, status: "capped" })),
  rows: doneByRun.flatMap((d, i) => Array.from({ length: perRun }, (_, k) => ({ run_id: "r" + i, status: k < d ? "done" : "failed" }))),
});
const a = auditCoverage({ purpose: "discovery", targetRuns: 3, ...mk(39, [15, 14, 18]) });
ok(a.applies && !a.complete && a.label === "94 of 234 answers", "London case reads 94 of 234, not complete: " + a.label);
const b = auditCoverage({ purpose: "discovery", targetRuns: 3, ...mk(39, [39, 39, 39]) });
ok(b.complete && b.label === "234 of 234 answers", "all answered = complete");
const c = auditCoverage({ purpose: "discovery", targetRuns: 3, runs: [{ id: "r0", status: "complete" }], rows: mk(39, [39]).rows });
ok(!c.complete && c.label === "78 of 234 answers", "runs 2-3 never created still reads incomplete");
const d = auditCoverage({ purpose: "audit", targetRuns: null, ...mk(3, [1]) });
ok(!d.applies && d.complete, "a hook / ordinary audit is never judged here");
const e = auditCoverage({ purpose: "discovery", targetRuns: 3, runs: [{ id: "r0", status: "running" }, { id: "r1", status: "complete" }, { id: "r2", status: "complete" }], rows: mk(2, [2, 2, 2]).rows });
ok(!e.complete, "a run still running is not complete");
ok(auditRunCapUsd(8) === AUDIT_RUN_CAP_USD, "an 8-question run keeps the flat floor");
ok(auditRunCapUsd(39) > 39 * 3 * 0.0125, "39 questions get room for 3 starts each (cap " + auditRunCapUsd(39) + ")");
ok(auditRunCapUsd(0) === AUDIT_RUN_CAP_USD && auditRunCapUsd(NaN) === AUDIT_RUN_CAP_USD, "bad counts fall back to the floor");
if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
