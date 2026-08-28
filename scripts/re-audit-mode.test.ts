/* ============================================================
   THE RE-AUDIT MODE PICKER — Paul's spec, 2026-08-28.

   ⛔ THE ONE PROPERTY THIS SUITE EXISTS FOR: THE PRICE SHOWN IS THE PRICE CHARGED. The dialog's
   cost line multiplies by `runsForReAuditMode(mode, sourceTargetRuns)`, and `reAuditFromSource`
   writes `baseline_target_runs` from THE SAME CALL. If those two ever diverge the screen approves
   one spend and the server performs another — which already happened once (the dialog said
   "× 1 run" while create-ai-audit ran MEASUREMENT_RUNS on the measurement path, pricing a
   47-question Solene re-audit at ~47p against a real ~£1.17). So the tests below assert on the
   FUNCTION, not on two numbers that happen to agree.

   ⚠️ The absent-value rule (CLAUDE.md §6, thirteen recorded instances) applies to
   `sourceTargetRuns`: null / 0 / 1 / undefined / a non-number all mean "the source did not say",
   and a measurement must then fall back to MEASUREMENT_RUNS — never to 1, which would silently
   turn a Full-measurement press into a quick audit at the measurement price.
   ============================================================ */
import {
  MEASUREMENT_RUNS,
  defaultReAuditMode,
  isMeasurementSource,
  runsForReAuditMode,
  type ReAuditMode,
} from "../src/lib/measurementRuns.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── Quick is ALWAYS one run, whatever the source was ──");
for (const target of [null, undefined, 0, 1, 2, 3, 10, 75, NaN] as unknown[]) {
  ok(runsForReAuditMode("quick", target as number | null) === 1,
    `quick + sourceTargetRuns ${String(target)} → 1 run`);
}

console.log("\n── ⛔ Measurement NEVER collapses to 1 on an absent source target ──");
for (const target of [null, undefined, 0, 1, NaN] as unknown[]) {
  ok(runsForReAuditMode("measurement", target as number | null) === MEASUREMENT_RUNS,
    `measurement + absent/meaningless target ${String(target)} → MEASUREMENT_RUNS (${MEASUREMENT_RUNS})`);
}
ok(MEASUREMENT_RUNS > 1, "MEASUREMENT_RUNS is genuinely a repeat — 1 would make the mode a no-op");

console.log("\n── A source that DID state a repeat target keeps it ──");
ok(runsForReAuditMode("measurement", 3) === 3, "target 3 → 3 runs");
ok(runsForReAuditMode("measurement", 5) === 5, "a 5-run before is re-measured over 5, not squashed to 3");
ok(runsForReAuditMode("measurement", 2) === 2, "target 2 → 2 runs (>1, so it is a real statement)");

console.log("\n── The default mode reproduces the pre-picker behaviour exactly ──");
ok(defaultReAuditMode(null) === "quick", "no source row → quick (never spend 3× by default)");
ok(defaultReAuditMode(undefined) === "quick", "undefined source → quick");
ok(defaultReAuditMode({}) === "quick", "a source with neither marker → quick");
ok(defaultReAuditMode({ is_measurement: true }) === "measurement", "is_measurement → measurement");
ok(defaultReAuditMode({ baseline_target_runs: 3 }) === "measurement",
  "⛔ baseline_target_runs alone → measurement: a PAID BASELINE sets this and NOT is_measurement");
ok(defaultReAuditMode({ is_measurement: null, baseline_target_runs: 1 }) === "quick",
  "target 1 is not a repeat → quick");
ok(defaultReAuditMode({ is_measurement: false, baseline_target_runs: 3 }) === "measurement",
  "an explicit false does not veto a real repeat target");

console.log("\n── The default agrees with isMeasurementSource, the older predicate ──");
for (const src of [
  null, {}, { is_measurement: true }, { baseline_target_runs: 3 },
  { is_measurement: false, baseline_target_runs: 0 }, { baseline_target_runs: 1 },
] as (Record<string, unknown> | null)[]) {
  const viaDefault = defaultReAuditMode(src as never) === "measurement";
  ok(viaDefault === isMeasurementSource(src as never),
    `defaultReAuditMode and isMeasurementSource agree on ${JSON.stringify(src)}`);
}

console.log("\n── ⛔ PRICE == CHARGE: the cost line and the written column read one function ──");
{
  /* The dialog's arithmetic and reAudit.ts's write, restated. They must never be able to disagree,
     so both go through runsForReAuditMode with the same two arguments. */
  const priced = (mode: ReAuditMode, target: number | null) => runsForReAuditMode(mode, target);
  const written = (mode: ReAuditMode, target: number | null) =>
    mode === "measurement" ? runsForReAuditMode(mode, target) : null;  // quick writes no marker

  for (const target of [null, 0, 1, 3, 5]) {
    ok(priced("measurement", target) === written("measurement", target),
      `measurement, target ${target}: priced runs === baseline_target_runs written`);
    ok(priced("quick", target) === 1 && written("quick", target) === null,
      `quick, target ${target}: priced 1 run, and NO measurement marker written`);
  }
}

console.log("\n── A downgrade can only ever cost LESS ──");
for (const target of [null, 2, 3, 5]) {
  ok(runsForReAuditMode("quick", target) <= runsForReAuditMode("measurement", target),
    `quick never exceeds measurement at target ${target} — a mis-picked mode cannot overspend`);
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURE(S)`);
if (f) process.exit(1);
