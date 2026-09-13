/* measuringState — the one predicate behind "still measuring" on the report, in the sender and on
 * the PDF button. Pins the incident shape (run 3 in flight → measuring), the stall release, and
 * the absent-value cases. Run: npx tsx scripts/measuring-state.test.ts */
import { measuringState, MEASURING_STALL_MS, SETTLED_RUN_STATUSES } from "../src/lib/measuringState.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const NOW = Date.parse("2026-09-13T04:40:00Z");
const at = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

console.log("── THE INCIDENT: two runs done, run 3 in flight ──");
{
  const s = measuringState([
    { status: "complete", created_at: at(13) },
    { status: "complete", created_at: at(9) },
    { status: "running", created_at: at(4) },
  ], 3, NOW);
  ok(s.measuring === true, "run 3 in flight → measuring (the 4-of-12 page must not render a number)");
  ok(s.runsDone === 2 && s.runsTarget === 3, `runs done ${s.runsDone} of ${s.runsTarget}`);
  ok(s.inFlight === 1 && s.stalled === false, "one in flight, not stalled");
}

console.log("\n── FINISHED: three complete ──");
{
  const s = measuringState([
    { status: "complete", created_at: at(20) }, { status: "complete", created_at: at(14) }, { status: "complete", created_at: at(8) },
  ], 3, NOW);
  ok(s.measuring === false && s.runsDone === 3, "all complete → not measuring, the 18-answer page renders");
}

console.log("\n── A PENDING RUN COUNTS AS IN FLIGHT (advanceBaseline has queued it, nothing has answered yet) ──");
{
  const s = measuringState([{ status: "complete", created_at: at(6) }, { status: "pending", created_at: at(0) }], 3, NOW);
  ok(s.measuring === true, "pending → measuring");
}

console.log("\n── THE STALL RELEASE: the report and the sender agree ──");
{
  const s = measuringState([
    { status: "complete", created_at: at(60) }, { status: "complete", created_at: at(54) },
    { status: "running", created_at: at(MEASURING_STALL_MS / 60_000 + 1) },
  ], 3, NOW);
  ok(s.measuring === false && s.stalled === true, "a run wedged past the stall window is abandoned → the page renders what completed, as the email did");
  ok(s.inFlight === 0, "and it no longer counts as in flight");
  const justUnder = measuringState([{ status: "running", created_at: at(MEASURING_STALL_MS / 60_000 - 1) }], 1, NOW);
  ok(justUnder.measuring === true, "one minute inside the window → still measuring");
}

console.log("\n── THE CHAIN DIED: two complete, nothing in flight, target 3 ──");
{
  const s = measuringState([{ status: "complete", created_at: at(30) }, { status: "complete", created_at: at(24) }], 3, NOW);
  ok(s.measuring === false, "nothing in flight → not measuring (the sender releases here too; both sides show 12)");
  ok(s.runsDone === 2 && s.runsTarget === 3, "…and the state still says 2 of 3, so a caller CAN say so");
}

console.log("\n── AN OPERATOR APPENDS A RUN TO A FINISHED AUDIT ──");
{
  const s = measuringState([
    { status: "complete", created_at: at(500) }, { status: "complete", created_at: at(490) }, { status: "complete", created_at: at(480) },
    { status: "running", created_at: at(2) },
  ], 3, NOW);
  ok(s.measuring === true, "a fourth run in flight → measuring: the number is about to change, so it is withheld");
}

console.log("\n── SETTLED IS A POSITIVE LIST; UNKNOWN IS IN FLIGHT ──");
for (const st of ["complete", "failed", "cancelled", "capped"]) ok(SETTLED_RUN_STATUSES.has(st), `${st} is settled`);
{
  const s = measuringState([{ status: "weird_new_status", created_at: at(1) }], 1, NOW);
  ok(s.measuring === true, "an unrecognised status counts as in flight — never a number on a state we cannot identify");
  const f2 = measuringState([{ status: "failed", created_at: at(1) }, { status: "capped", created_at: at(1) }], 3, NOW);
  ok(f2.measuring === false && f2.runsDone === 0, "failed/capped are settled, not measuring, and count 0 done");
}

console.log("\n── ABSENT VALUES ──");
{
  ok(measuringState(null, 3, NOW).measuring === false, "no runs → not measuring");
  ok(measuringState([], null, NOW).runsTarget === 1, "no target → 1");
  ok(measuringState([], 0, NOW).runsTarget === 1, "target 0 → 1");
  ok(measuringState([], "3", NOW).runsTarget === 3, "a numeric string target is read");
  const s = measuringState([{ status: "running", created_at: "not a date" }], 1, NOW);
  ok(s.measuring === true && s.stalled === false, "an unreadable created_at → age 0 → keeps waiting, never declares abandonment");
  const s2 = measuringState([{ status: null, created_at: null }], 1, NOW);
  ok(s2.measuring === true, "a null status is unknown → in flight");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exit(1);
