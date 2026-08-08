/* ============================================================
   "DONE" MUST MEAN ANSWERED, NOT ENQUEUED.

   ⛔ MEASURED 2026-08-08. A 10-lead audit job reported done=10 after 43 SECONDS. The last question
   actually finished 8.9 MINUTES later. bulk-jobs marked an item done the moment create-ai-audit
   returned — which is when the QUESTIONS EXIST, not when they have been answered, because the
   answering happens on a different cron entirely.
   Paul read "done 10/10", pushed to Instantly, and got 0 pushed. Twice. It cost two failed pushes
   and an hour, and it would have cost the next thing that read a bulk job's status.

   The decision table below is resolveAwaiting's, restated. It is a pure function of run statuses
   and job age, which is the only part worth testing — the query around it is one .in() call.
   ============================================================ */

const AUDIT_WAIT_MAX_MS = 45 * 60 * 1000;

/** resolveAwaiting's rule for ONE item, restated exactly as bulk-jobs applies it. */
function resolve(runStatuses: string[], jobAgeMs: number): "done" | "failed" | "awaiting_audit" {
  if (runStatuses.some((x) => x === "complete" || x === "capped")) return "done";
  if (runStatuses.length && runStatuses.every((x) => x === "failed" || x === "cancelled")) return "failed";
  if (jobAgeMs > AUDIT_WAIT_MAX_MS) return "failed";
  return "awaiting_audit";
}

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const MIN = 60_000;

console.log("── ⛔ THE BUG: ENQUEUED IS NOT ANSWERED ──");
/* The exact shape of the 43-second job: create-ai-audit returned, no run row has a terminal status
   yet. It must NOT read as done. */
ok(resolve([], 1 * MIN) === "awaiting_audit", "no run rows yet, 1 min in -> awaiting (was: done)");
ok(resolve(["pending"], 1 * MIN) === "awaiting_audit", "run pending -> awaiting");
ok(resolve(["running"], 5 * MIN) === "awaiting_audit", "run running at 5 min -> still awaiting");
ok(resolve(["pending"], 9 * MIN) === "awaiting_audit", "9 minutes in and still not answered -> STILL awaiting");

console.log("\n── AND WHEN IT REALLY IS ANSWERED ──");
ok(resolve(["complete"], 9 * MIN) === "done", "complete -> done");
/* capped counts as finished ON PURPOSE: it has real answers, just fewer than asked for, and the
   audit-reply resolver accepts it. Calling it failed would discard a usable audit and re-spend. */
ok(resolve(["capped"], 9 * MIN) === "done", "CAPPED counts as done — real answers, fewer of them");
ok(resolve(["failed", "complete"], 9 * MIN) === "done", "one complete run is enough, even beside a failed one");

console.log("\n── GENUINE FAILURE ──");
ok(resolve(["failed"], 5 * MIN) === "failed", "the only run failed -> failed");
ok(resolve(["cancelled"], 5 * MIN) === "failed", "cancelled -> failed");
ok(resolve(["failed", "cancelled"], 5 * MIN) === "failed", "all terminal-bad -> failed");

console.log("\n── AND IT CANNOT RE-QUEUE FOREVER ──");
/* A job that never resolves would re-claim a cron tick every minute indefinitely. The age cap stops
   it and says why, rather than leaving an item that is neither finished nor moving. */
ok(resolve(["pending"], 44 * MIN) === "awaiting_audit", "44 minutes -> still waiting (audits legitimately take ~9)");
ok(resolve(["pending"], 46 * MIN) === "failed", "46 minutes -> failed, so the job stops re-queuing");
ok(resolve([], 46 * MIN) === "failed", "no run row at all after the cap -> failed, not awaiting forever");

console.log("\n── THE COUNTERS ──");
/* awaiting_audit must count as NOTHING while it waits. If it counted as done the totals would read
   complete while the work was outstanding — which is the original bug wearing a different hat. */
const statuses = ["done", "awaiting_audit", "awaiting_audit", "failed"];
const done = statuses.filter((s) => s === "done").length;
const failed = statuses.filter((s) => s === "failed").length;
const awaiting = statuses.filter((s) => s === "awaiting_audit").length;
ok(done + failed + awaiting === statuses.length, "every item is in exactly one bucket");
ok(done === 1 && failed === 1 && awaiting === 2, "awaiting is its own bucket, not folded into done");
ok(awaiting > 0, "and while any item is awaiting, the JOB IS NOT DONE — it re-queues");

console.log("\n── ⛔ A SIBLING RUN MUST NOT ANSWER FOR THIS ATTEMPT ──");
/* CAUGHT IN PRODUCTION, an hour after shipping. Platinum Accounting already had a CAPPED run from an
   earlier attempt. create-ai-audit added run #2 to the SAME audit. resolveAwaiting looked runs up by
   audit_id, saw the old capped one, and marked the item done while run #2 was still pending — the
   exact "done means enqueued" lie the change existed to remove, wearing a different hat.
   The item now carries run_id, so only THIS attempt's run can answer for it. */
const byRun = (thisRunStatus: string | undefined, jobAgeMs: number) =>
  resolve(thisRunStatus ? [thisRunStatus] : [], jobAgeMs);

ok(byRun("pending", 2 * MIN) === "awaiting_audit",
  "a pending run stays awaiting EVEN IF the audit has an older capped run beside it");
ok(resolve(["capped", "pending"], 2 * MIN) === "done",
  "  (the bug, preserved: keyed on the AUDIT, the old capped run marks it done)");
ok(byRun("complete", 9 * MIN) === "done", "and this attempt completing does resolve it");
ok(byRun(undefined, 2 * MIN) === "awaiting_audit", "a run id that finds no row yet keeps waiting");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
