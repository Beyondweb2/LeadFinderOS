/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE PAYMENT MUST CREATE ONE BASELINE.

   🔴 THE INCIDENT THIS PINS (2026-09-12): a single payment on one lead created TEN paid baselines,
   343 queue rows and ~£3.70 of Apify, once every queue tick, until the onboarding row was reset by
   hand. Nothing threw. Nothing logged a duplicate. The ten audits differed only in their generated
   questions — 8, 9, 10, 10, 9 … on identical inputs.

   ⛔ AND IT WAS NOT A BUG IN EITHER GUARD. Each was correct about the problem it was written for:
     · create-ai-audit marked every MULTI-RUN audit `is_measurement`, so an unmarked 3-run free
       check could not be mistaken for a baseline;
     · startPaidBaseline recognised a baseline as multi-run AND NOT `is_measurement`.
   Together they are a loop: the paid baseline is multi-run, so the writer marked it, so the reader
   excluded it, so it never found the audit it had just made.

   ⛔ WHICH IS WHY THE TEST IS A ROUND TRIP AND NOT TWO UNIT TESTS. Testing each rule against its own
   expectations is exactly what both files already did — in comments, one of which had been false
   for weeks. The only assertion that could have caught this is: TAKE WHAT THE WRITER SETS, HAND IT
   TO THE READER, AND REQUIRE THE READER TO RECOGNISE IT.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  measurementFlagFor, auditKind, findPaidBaseline, findAmbiguousMultiRun,
  type AuditKindRow,
} from "../src/lib/auditKind.ts";
import { BASELINE_RUNS } from "../src/lib/auditQuestionCounts.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ── THE WRITER, MODELLED EXACTLY AS create-ai-audit WRITES IT ────────────────────────────────────
   Mirrors the two lines that build auditRow:
     if (baselineTargetRuns > 1) auditRow.baseline_target_runs = baselineTargetRuns;
     if (measurementFlagFor(isMeasurement)) auditRow.is_measurement = true;
   ⚠️ If those two lines change, THIS changes with them — that is the point. A helper that models
   the writer loosely would pass while the real writer regressed. */
function rowAsCreated(opts: { purposeIsMeasurement: boolean; targetRuns: number }): AuditKindRow {
  const row: AuditKindRow = { id: "aud_" + Math.random().toString(36).slice(2, 8) };
  if (opts.targetRuns > 1) row.baseline_target_runs = opts.targetRuns;
  if (measurementFlagFor(opts.purposeIsMeasurement)) row.is_measurement = true;
  return row;
}
/** startPaidBaseline stamps the frozen contract onto the audit immediately after creating it. */
const withContract = (row: AuditKindRow): AuditKindRow =>
  ({ ...row, baseline_contract: { questions: ["q1", "q2"], measuredAt: "2026-09-12" } });

/* The three real creation shapes, named for what actually makes them. */
const paidBaseline = () => withContract(rowAsCreated({ purposeIsMeasurement: false, targetRuns: BASELINE_RUNS }));
const freeCheck = () => rowAsCreated({ purposeIsMeasurement: false, targetRuns: 3 });
const reMeasure = () => rowAsCreated({ purposeIsMeasurement: true, targetRuns: 3 });
const outreachHook = () => rowAsCreated({ purposeIsMeasurement: false, targetRuns: 1 });

console.log("── THE ROUND TRIP: THE READER RECOGNISES WHAT THE WRITER WROTE ──");
/* 🔴 THE ONE ASSERTION THAT WOULD HAVE CAUGHT THE LOOP. Everything else here is detail. */
const b = paidBaseline();
ok(findPaidBaseline([b])?.id === b.id,
   "a baseline as CREATED by startPaidBaseline is found by startPaidBaseline's own guard");
ok(findAmbiguousMultiRun([b]) === null, "and it is not treated as ambiguous");

console.log("\n── CALLED TWICE, ONE PAYMENT STILL HAS ONE BASELINE ──");
/* The loop in miniature: tick 1 creates it, tick 2 must see it and stop. */
let audits: AuditKindRow[] = [];
let created = 0;
for (let tick = 1; tick <= 10; tick++) {
  if (findPaidBaseline(audits)) continue;              // the real early return
  if (findAmbiguousMultiRun(audits)) continue;         // the new refusal
  audits = [...audits, paidBaseline()];
  created++;
}
ok(created === 1, `ten backstop ticks created ${created} baseline(s) — must be exactly 1`);
ok(audits.length === 1, `the lead ends with ${audits.length} audit(s)`);

console.log("\n── is_measurement IS THE PURPOSE, NEVER THE RUN COUNT ──");
/* ⛔ The precise regression. A 3-run baseline must NOT be flagged; only a measurement is. */
ok(measurementFlagFor(false) === false, "purpose 'baseline' → is_measurement NOT set");
ok(measurementFlagFor(true) === true, "purpose 'measurement' → is_measurement set");
ok(paidBaseline().is_measurement !== true, "a 3-run PAID BASELINE is not flagged as a measurement");
ok(freeCheck().is_measurement !== true, "a 3-run FREE CHECK is not flagged as a measurement");
ok(reMeasure().is_measurement === true, "a re-measure IS flagged");

console.log("\n── THE FOUR KINDS ──");
ok(auditKind(paidBaseline()) === "paid_baseline", "paid baseline");
ok(auditKind(reMeasure()) === "measurement", "re-measure");
ok(auditKind(freeCheck()) === "multi_run_unmarked", "free check → ambiguous, never a baseline");
ok(auditKind(outreachHook()) === "single_run", "outreach hook");

console.log("\n── A MEASUREMENT NEVER SATISFIES THE BASELINE GUARD ──");
/* The ORIGINAL 2026-08-22 guarantee guard, still required: a Full Measurement on this lead must not
   make the paying client's day-0 get skipped. */
ok(findPaidBaseline([reMeasure()]) === null,
   "a lead with only a re-measure still needs its baseline");
ok(findPaidBaseline([outreachHook(), reMeasure()]) === null,
   "…and an outreach hook alongside it changes nothing");

console.log("\n── AMBIGUITY REFUSES, IT DOES NOT SPEND ──");
/* 🔴 THE FAILURE DIRECTION, INVERTED. A free-check audit used to let a second baseline be created
   silently; it now stops and is reported. Visible and wrong beats invisible and expensive. */
const fc = freeCheck();
ok(findPaidBaseline([fc]) === null, "a free-check audit is NOT accepted as a baseline");
ok(findAmbiguousMultiRun([fc])?.id === fc.id, "it is surfaced as ambiguous so the caller can refuse");
ok(findAmbiguousMultiRun([paidBaseline(), fc])?.id === fc.id,
   "ambiguity is still reported when a real baseline exists too");
ok(findPaidBaseline([paidBaseline(), fc]) !== null,
   "…but the real baseline still wins the idempotency check, so no duplicate is bought");

console.log("\n── A CONTRACT THAT IS NOT A CONTRACT ──");
/* An empty stamp must not count — an empty object is absence, never a record. A
   baseline that validated on `{}` would make the guard pass on a write that stored nothing. */
for (const [label, c] of [["null", null], ["undefined", undefined], ["empty object", {}],
                          ["empty string", ""], ["a number", 7]] as const) {
  ok(auditKind({ baseline_target_runs: 3, baseline_contract: c }) === "multi_run_unmarked",
     `contract = ${label} → ambiguous, never a baseline`);
}

console.log("\n── ABSENT AND JUNK RUN COUNTS ──");
for (const r of [undefined, null, 0, 1]) {
  ok(auditKind({ baseline_target_runs: r as number | null | undefined }) === "single_run",
     `baseline_target_runs = ${JSON.stringify(r)} → single_run, never a baseline`);
}
ok(findPaidBaseline([]) === null, "no audits → no baseline");
ok(findPaidBaseline(null) === null, "a failed read (null) → no baseline, never a false positive");
ok(findAmbiguousMultiRun(null) === null, "a failed read (null) → no ambiguity claim either");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
