/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE PAYMENT MUST CREATE ONE BASELINE — AND A FREE CHECK MUST NOT STOP IT.

   🔴 THE FIRST INCIDENT (2026-09-12): a single payment on one lead created TEN paid baselines,
   343 queue rows and ~£3.70 of Apify, once every queue tick, until the onboarding row was reset by
   hand. Nothing threw. Nothing logged a duplicate.

   ⛔ AND IT WAS NOT A BUG IN EITHER GUARD. Each was correct about the problem it was written for:
     · create-ai-audit marked every MULTI-RUN audit `is_measurement`, so an unmarked 3-run free
       check could not be mistaken for a baseline;
     · startPaidBaseline recognised a baseline as multi-run AND NOT `is_measurement`.
   Together they are a loop: the paid baseline is multi-run, so the writer marked it, so the reader
   excluded it, so it never found the audit it had just made.

   🔴 THE SECOND (2026-09-13, caught before a customer met it): the fix graded EVERY 3-run free check
   as ambiguous, so a prospect who took the free check and then paid was never baselined — the
   funnel's own happy path, refused by design, with an error row every 30 seconds.

   ⛔ WHICH IS WHY THE TEST IS A ROUND TRIP AND NOT TWO UNIT TESTS. Testing each rule against its own
   expectations is exactly what both files already did — in comments, one of which had been false
   for weeks. The assertions that matter: TAKE WHAT THE WRITER SETS, HAND IT TO THE READER, REQUIRE
   THE READER TO RECOGNISE A BASELINE — and require it to IGNORE a free check.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  measurementFlagFor, auditKind, findPaidBaseline, findAmbiguousMultiRun, freeCheckSendGate,
  BASELINE_AUDIT_PURPOSE, MEASUREMENT_AUDIT_PURPOSE, REMEASURE_AUDIT_PURPOSE,
  FREE_CHECK_AUDIT_PURPOSE, ORDINARY_AUDIT_PURPOSE,
  isInternalMeasurement, INTERNAL_MEASUREMENT_LABEL,
  type AuditKindRow,
} from "../src/lib/auditKind.ts";
import { BASELINE_RUNS } from "../src/lib/auditQuestionCounts.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ── THE WRITER, MODELLED EXACTLY AS create-ai-audit WRITES IT ────────────────────────────────────
   Mirrors the lines that build auditRow:
     if (baselineTargetRuns > 1) auditRow.baseline_target_runs = baselineTargetRuns;
     if (measurementFlagFor(isMeasurement || isRemeasure)) auditRow.is_measurement = true;
     auditRow.audit_purpose = isBaseline ? 'baseline' : isRemeasure ? 'remeasure'
                            : isMeasurement ? 'measurement' : isFreeCheck ? 'free_check' : 'audit';
   ⚠️ If those lines change, THIS changes with them — that is the point. A helper that models the
   writer loosely would pass while the real writer regressed. */
type Purpose = "baseline" | "measurement" | "remeasure" | "free_check" | "audit";
function rowAsCreated(opts: { purpose: Purpose; targetRuns: number }): AuditKindRow {
  const row: AuditKindRow = { id: "aud_" + Math.random().toString(36).slice(2, 8) };
  if (opts.targetRuns > 1) row.baseline_target_runs = opts.targetRuns;
  const isMeasurement = opts.purpose === "measurement" || opts.purpose === "remeasure";
  if (measurementFlagFor(isMeasurement)) row.is_measurement = true;
  row.audit_purpose = opts.purpose;
  return row;
}
/** startPaidBaseline stamps the frozen contract onto the audit immediately after creating it. */
const withContract = (row: AuditKindRow): AuditKindRow =>
  ({ ...row, baseline_contract: { version: 2, mainTown: "Huntingdon", createdAt: "2026-09-13" } });

/* The real creation shapes, named for what actually makes them. */
const paidBaseline = () => withContract(rowAsCreated({ purpose: "baseline", targetRuns: BASELINE_RUNS }));
const baselineContractFailed = () => rowAsCreated({ purpose: "baseline", targetRuns: BASELINE_RUNS });
const freeCheck = () => rowAsCreated({ purpose: "free_check", targetRuns: 3 });
const fullMeasure = () => rowAsCreated({ purpose: "measurement", targetRuns: 3 });
const dayTwentyEight = () => rowAsCreated({ purpose: "remeasure", targetRuns: 3 });
const outreachHook = () => rowAsCreated({ purpose: "audit", targetRuns: 1 });
const manualReAudit = () => rowAsCreated({ purpose: "audit", targetRuns: 1 });
/* Rows from before audit_purpose existed (every audit before 2026-09-12): no purpose at all. */
const legacyBaseline = (): AuditKindRow => ({ id: "legacy_b", baseline_target_runs: 3, baseline_contract: { questions: ["q1"] } });
const legacyFreeCheck = (): AuditKindRow => ({ id: "legacy_fc", baseline_target_runs: 3 });
const legacyMeasurement = (): AuditKindRow => ({ id: "legacy_m", baseline_target_runs: 3, is_measurement: true });
const legacyHook = (): AuditKindRow => ({ id: "legacy_h" });

console.log("── THE ROUND TRIP: THE READER RECOGNISES WHAT THE WRITER WROTE ──");
const b = paidBaseline();
ok(findPaidBaseline([b])?.id === b.id,
   "a baseline as CREATED by startPaidBaseline is found by startPaidBaseline's own guard");
ok(findAmbiguousMultiRun([b]) === null, "and it is not treated as ambiguous");

console.log("\n── THE SECOND INCIDENT: FREE CHECK, THEN PAY, MUST PRODUCE A BASELINE ──");
/* The funnel's happy path in miniature: the free check already exists on the lead, then the
   payment lands and the backstop ticks ten times. Exactly ONE baseline must be created. */
{
  let audits: AuditKindRow[] = [freeCheck()];
  let created = 0;
  for (let tick = 1; tick <= 10; tick++) {
    if (findPaidBaseline(audits)) continue;              // the real early return
    if (findAmbiguousMultiRun(audits)) continue;         // the refusal
    audits = [...audits, paidBaseline()];
    created++;
  }
  ok(created === 1, `free check then pay: ten backstop ticks created ${created} baseline(s) — must be exactly 1`);
  ok(audits.length === 2, `the lead ends with ${audits.length} audits (the free check and the baseline)`);
}
const fc = freeCheck();
ok(auditKind(fc) === "free_check", "a free-check audit is graded 'free_check'");
ok(findPaidBaseline([fc]) === null, "a free-check audit is NOT accepted as a baseline");
ok(findAmbiguousMultiRun([fc]) === null, "a free-check audit is NOT ambiguous — it is ignored, so the baseline is bought");
ok(findAmbiguousMultiRun([fc, outreachHook(), fullMeasure()]) === null,
   "a free check beside a hook and a full measure still holds nothing");

console.log("\n── CALLED TWICE, ONE PAYMENT STILL HAS ONE BASELINE ──");
{
  let audits: AuditKindRow[] = [];
  let created = 0;
  for (let tick = 1; tick <= 10; tick++) {
    if (findPaidBaseline(audits)) continue;
    if (findAmbiguousMultiRun(audits)) continue;
    audits = [...audits, paidBaseline()];
    created++;
  }
  ok(created === 1, `ten backstop ticks created ${created} baseline(s) — must be exactly 1`);
}

console.log("\n── AMBIGUITY STILL REFUSES THE CASE IT WAS BUILT FOR ──");
/* A baseline whose contract write failed claims to be a baseline and cannot prove it. Refuse. */
const broken = baselineContractFailed();
ok(auditKind(broken) === "multi_run_unmarked", "purpose 'baseline' with no contract → ambiguous");
ok(findPaidBaseline([broken]) === null, "…it is not accepted as the baseline");
ok(findAmbiguousMultiRun([broken])?.id === broken.id, "…and it is surfaced so startPaidBaseline refuses to spend");
ok(findAmbiguousMultiRun([paidBaseline(), broken])?.id === broken.id,
   "ambiguity is still reported when a real baseline exists too");
ok(findPaidBaseline([paidBaseline(), broken]) !== null,
   "…but the real baseline still wins the idempotency check, so no duplicate is bought");

console.log("\n── is_measurement IS THE PURPOSE, NEVER THE RUN COUNT ──");
ok(measurementFlagFor(false) === false, "purpose 'baseline' → is_measurement NOT set");
ok(measurementFlagFor(true) === true, "purpose 'measurement' → is_measurement set");
ok(paidBaseline().is_measurement !== true, "a 3-run PAID BASELINE is not flagged as a measurement");
ok(freeCheck().is_measurement !== true, "a 3-run FREE CHECK is not flagged as a measurement");
ok(fullMeasure().is_measurement === true, "a full measure IS flagged");
ok(dayTwentyEight().is_measurement === true, "the day-28 replay IS flagged");

console.log("\n── THE KINDS, BY RECORDED PURPOSE ──");
ok(auditKind(paidBaseline()) === "paid_baseline", "paid baseline");
ok(auditKind(fullMeasure()) === "measurement", "full measure");
ok(auditKind(dayTwentyEight()) === "measurement", "day-28 replay");
ok(auditKind(freeCheck()) === "free_check", "free check");
ok(auditKind(outreachHook()) === "ordinary", "outreach hook → ordinary");
ok(auditKind({ audit_purpose: "audit", baseline_target_runs: 3 }) === "ordinary",
   "an ordinary audit asked three times is STILL ordinary — run count is not kind");
ok(auditKind({ audit_purpose: "market", baseline_target_runs: 2 }) === "ordinary",
   "an unknown recorded purpose is ordinary, never ambiguous and never a baseline");
ok(auditKind({ audit_purpose: " Baseline ", baseline_contract: { a: 1 } }) === "paid_baseline",
   "the purpose is read case- and whitespace-insensitively");

console.log("\n── THE PURPOSE WINS OVER THE OLD COLUMNS ──");
ok(auditKind({ audit_purpose: "free_check", baseline_target_runs: 3, baseline_contract: { a: 1 } }) === "free_check",
   "a free check that somehow carries a contract is still a free check, not a baseline");
ok(auditKind({ audit_purpose: "baseline", baseline_target_runs: 3, is_measurement: true, baseline_contract: { a: 1 } }) === "paid_baseline",
   "a baseline stays a baseline whatever is_measurement says");

console.log("\n── LEGACY ROWS (NO PURPOSE) KEEP THE OLD RULE, REFUSAL INCLUDED ──");
ok(auditKind(legacyBaseline()) === "paid_baseline", "legacy multi-run + contract → paid baseline (RG, Ronnie)");
ok(auditKind(legacyMeasurement()) === "measurement", "legacy multi-run + is_measurement → measurement");
ok(auditKind(legacyFreeCheck()) === "multi_run_unmarked",
   "legacy multi-run, no contract → STILL ambiguous (a pre-2026-09-12 free check holds a later payment — stated, not hidden)");
ok(auditKind(legacyHook()) === "single_run", "legacy one-run → single_run");
ok(findPaidBaseline([legacyBaseline()]) !== null, "a legacy baseline still satisfies the guard, so no duplicate is bought");

console.log("\n── A MEASUREMENT NEVER SATISFIES THE BASELINE GUARD ──");
ok(findPaidBaseline([fullMeasure()]) === null, "a lead with only a full measure still needs its baseline");
ok(findPaidBaseline([outreachHook(), fullMeasure(), freeCheck()]) === null,
   "…and a hook and a free check alongside it change nothing");

console.log("\n── A CONTRACT THAT IS NOT A CONTRACT ──");
for (const [label, c] of [["null", null], ["undefined", undefined], ["empty object", {}],
                          ["empty string", ""], ["a number", 7]] as const) {
  ok(auditKind({ audit_purpose: "baseline", baseline_target_runs: 3, baseline_contract: c }) === "multi_run_unmarked",
     `purpose 'baseline', contract = ${label} → ambiguous, never a baseline`);
}

console.log("\n── ABSENT AND JUNK RUN COUNTS ──");
for (const r of [undefined, null, 0, 1]) {
  ok(auditKind({ baseline_target_runs: r as number | null | undefined }) === "single_run",
     `no purpose, baseline_target_runs = ${JSON.stringify(r)} → single_run, never a baseline`);
}
ok(findPaidBaseline([]) === null, "no audits → no baseline");
ok(findPaidBaseline(null) === null, "a failed read (null) → no baseline, never a false positive");
ok(findAmbiguousMultiRun(null) === null, "a failed read (null) → no ambiguity claim either");

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FREE-CHECK SENDER: ONLY THE FREE CHECK SENDS. Everything else on the lead sends NOTHING.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
console.log("\n── THE SENDER FIRES ON THE FREE CHECK AND ON NOTHING ELSE ──");
ok(freeCheckSendGate(FREE_CHECK_AUDIT_PURPOSE).send === true, "a free-check audit sends");
const silent: Array<[string, string]> = [
  ["a paid baseline", BASELINE_AUDIT_PURPOSE],
  ["a full measure", MEASUREMENT_AUDIT_PURPOSE],
  ["the day-28 replay", REMEASURE_AUDIT_PURPOSE],
  ["a manual re-audit / outreach hook", ORDINARY_AUDIT_PURPOSE],
  ["a market audit", "market"],
];
for (const [label, purpose] of silent) {
  ok(freeCheckSendGate(purpose).send === false, `${label} (purpose '${purpose}') sends the person NOTHING`);
}
for (const [label, v] of [["null", null], ["undefined", undefined], ["empty", ""], ["blank", "   "], ["a number", 3]] as const) {
  ok(freeCheckSendGate(v).send === false, `no recorded purpose (${label}) → not sent automatically`);
}
ok(freeCheckSendGate(" Free_Check ").send === true, "the purpose is read case- and whitespace-insensitively");

console.log("\n── THE OPERATOR RESEND IS THE ONE EXCEPTION, AND IT IS NARROW ──");
ok(freeCheckSendGate(FREE_CHECK_AUDIT_PURPOSE, { forced: true }).send === true, "forced on a free check sends");
ok(freeCheckSendGate(null, { forced: true }).send === true,
   "forced on a legacy audit (no purpose) sends — how the pre-change stranded free checks are resent by hand");
ok(freeCheckSendGate(ORDINARY_AUDIT_PURPOSE, { forced: true }).send === true,
   "forced on an ordinary audit sends — a person pressed the button for that audit id");
for (const [label, purpose] of silent.slice(0, 3)) {
  ok(freeCheckSendGate(purpose, { forced: true }).send === false,
     `forced on ${label} STILL sends nothing — no button may send a stranger a paying customer's measurement`);
}
{
  const d = freeCheckSendGate(BASELINE_AUDIT_PURPOSE);
  ok(!d.send && /not a free check/.test(d.reason), "a refusal names why, so the skip reason reads as a decision, not a bug");
}

console.log("\n── AN INTERNAL MEASUREMENT IS RECOGNISED BY ONE PREDICATE (the public renderer, the Baseline screen, the cockpit) ──");
/* The full measure and the day-28 replay are operator documents. findable.live/report/<id> rendered
   one as a CLIENT report on 2026-09-13; the refusal keys on this. */
ok(isInternalMeasurement({ audit_purpose: MEASUREMENT_AUDIT_PURPOSE, baseline_target_runs: 3, is_measurement: true }) === true, "a recorded full measure is internal");
ok(isInternalMeasurement({ audit_purpose: REMEASURE_AUDIT_PURPOSE, baseline_target_runs: 3, is_measurement: true }) === true, "a recorded day-28 replay is internal");
ok(isInternalMeasurement({ audit_purpose: MEASUREMENT_AUDIT_PURPOSE, baseline_target_runs: null, is_measurement: null }) === true, "the recorded purpose alone decides — no run count or flag needed");
ok(isInternalMeasurement({ audit_purpose: BASELINE_AUDIT_PURPOSE, baseline_target_runs: 3, baseline_contract: { version: 2 } }) === false, "the client's baseline is NOT internal — it is the document a client is measured against");
ok(isInternalMeasurement({ audit_purpose: FREE_CHECK_AUDIT_PURPOSE, baseline_target_runs: 3 }) === false, "a free check is the prospect's document, not internal");
ok(isInternalMeasurement({ audit_purpose: ORDINARY_AUDIT_PURPOSE }) === false, "an ordinary audit is the prospect's report");
/* Legacy rows (purpose null): RG's 26 Aug and 8 Sep re-measures are multi-run + is_measurement. */
ok(isInternalMeasurement({ audit_purpose: null, baseline_target_runs: 3, is_measurement: true }) === true, "legacy multi-run + is_measurement (RG's re-measures) is internal");
ok(isInternalMeasurement({ audit_purpose: null, baseline_target_runs: 3, is_measurement: false, baseline_contract: { v: 1 } }) === false, "legacy client baseline (RG 11 Aug, Ronnie) is not internal");
ok(isInternalMeasurement({ audit_purpose: null, baseline_target_runs: null, is_measurement: true }) === false, "a legacy SINGLE-run audit is never internal, whatever the flag says — it is a prospect's report");
ok(isInternalMeasurement(null) === false && isInternalMeasurement(undefined) === false, "absence is never internal (nothing to refuse, nothing to hide)");
ok(INTERNAL_MEASUREMENT_LABEL === "Winnable questions audit (internal)", "the operator label is the one Paul chose");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exit(1);
