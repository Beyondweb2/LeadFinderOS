/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DAY-28 REPLAY: THE STORED DATE WINS, REFUNDED NEVER FIRES, THE FILL NEVER OVERWRITES.

   🔴 THE THREE TESTS PAUL CLEARED SLICE 4 ON (2026-09-12), in his words:
     1. "Keep the test that asserts the tick module never references REMEASURE_OFFSET_DAYS."
        RG's stored date is 2026-10-06; his computed default is 2026-09-08. A tick that computed
        instead of read would have fired his controlled experiment four weeks early.
     2. "The refunded gate must hold on its own … if it ever regresses, a refunded client gets a
        measurement he did not pay for. Test it explicitly." SC Plumbing: refunded, date NULL.
     3. "The one-time fill … must be WHERE remeasure_due_date IS NULL only. It must never touch
        RG's or Ronnie's stored dates. Test that too."
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { isRemeasureDue, utcDateISO, REMEASURE_STOP_STATUS, type RemeasureCandidate } from "../src/lib/remeasureDue.ts";
import { remeasureDueFill, workIncompleteFor, WORK_MILESTONES } from "../src/lib/remeasureFill.ts";
import { REMEASURE_OFFSET_DAYS } from "../src/lib/deliveryCockpit.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* The three real clients as Paul reported them from block 13. */
const RG: RemeasureCandidate = { baseline_audit_id: "f64920ce", remeasure_audit_id: null, remeasure_due_date: "2026-10-06", status: "payment_received", is_archived: false, amount_paid: 19.99 };
const RONNIE: RemeasureCandidate = { baseline_audit_id: "1a0603aa", remeasure_audit_id: null, remeasure_due_date: "2026-10-13", status: "in_delivery", is_archived: false, amount_paid: 49.99 };
const SC: RemeasureCandidate = { baseline_audit_id: "2db548dd", remeasure_audit_id: null, remeasure_due_date: null, status: "refunded", is_archived: false, amount_paid: 99 };

console.log("── 1. THE TICK NEVER COMPUTES A DATE — the module has no arithmetic to compute one with ──");
const dueSrc = read("src/lib/remeasureDue.ts");
const dueCode = stripComments(dueSrc);
ok(!/import\s/.test(dueCode), "remeasureDue.ts imports NOTHING — it cannot reach the offset even by accident");
for (const bad of ["REMEASURE_OFFSET_DAYS", "addDaysISO", "defaultRemeasureDue", "remeasureDueFill", "setUTCDate", "getTime()", "Date.now()"]) {
  ok(!dueCode.includes(bad), `remeasureDue.ts code does not mention ${bad}`);
}
ok(!/\b28\b/.test(dueCode) && !/\b56\b/.test(dueCode), "…and carries no literal 28 or 56");
/* The tick function itself, in the edge module. */
const baselineSrc = stripComments(read("supabase/functions/_shared/audit-baseline.ts"));
const tick = baselineSrc.slice(baselineSrc.indexOf("export async function fireDueRemeasures"), baselineSrc.indexOf("export async function sweepStalledBaselines"));
ok(tick.length > 500, "found fireDueRemeasures in audit-baseline.ts");
for (const bad of ["REMEASURE_OFFSET_DAYS", "addDaysISO", "defaultRemeasureDue", "remeasureDueFill", "baseline_completed_at + ", "setUTCDate"]) {
  ok(!tick.includes(bad), `fireDueRemeasures does not mention ${bad}`);
}
ok(/\.lte\("remeasure_due_date", today\)/.test(tick), "the query reads remeasure_due_date <= today — the stored column, nothing derived");
ok(/isRemeasureDue\(lead, today\)/.test(tick), "…and re-checks every row with the pure predicate");

console.log("\n── RG: THE STORED DATE WINS, AND THE COMPUTED DEFAULT CANNOT REACH THE DECISION ──");
const rgComputedDefault = "2026-09-08";   // what +28 from his baseline would have been
ok(isRemeasureDue(RG, "2026-09-12").due === false, "12 Sep: RG not due");
ok(isRemeasureDue(RG, rgComputedDefault).due === false, `${rgComputedDefault} (the computed default): RG NOT due — the experiment survives`);
ok(isRemeasureDue(RG, "2026-10-05").due === false, "5 Oct: not due");
ok(isRemeasureDue(RG, "2026-10-06").due === true, "6 Oct: RG fires on his STORED date");
ok(isRemeasureDue(RG, "2026-10-20").due === true, "20 Oct: still due (overdue fires, it does not lapse)");
ok(isRemeasureDue(RONNIE, "2026-10-12").due === false && isRemeasureDue(RONNIE, "2026-10-13").due === true, "Ronnie fires on 13 Oct, his stored date");

console.log("\n── 2. THE REFUNDED GATE HOLDS ON ITS OWN (SC Plumbing) ──");
ok(REMEASURE_STOP_STATUS === "refunded", "the stop status is 'refunded' and only 'refunded'");
const sc = isRemeasureDue(SC, "2026-12-31");
ok(sc.due === false && !sc.due && sc.reason === "refunded", "SC as he is (refunded, date NULL): NOT due, reason 'refunded'");
const scWithPastDate = isRemeasureDue({ ...SC, remeasure_due_date: "2026-09-19" }, "2026-12-31");
ok(scWithPastDate.due === false && !scWithPastDate.due && scWithPastDate.reason === "refunded",
   "⛔ SC with a PAST date filled in: STILL not due, and the reason is 'refunded' — the gate holds alone, before the date is even looked at");
ok(isRemeasureDue({ ...RG, status: "refunded" }, "2026-10-06").due === false, "RG refunded on his due day: not due");
/* A hosting cancel is NOT a stop. */
ok(isRemeasureDue({ ...RG, status: "in_delivery" }, "2026-10-06").due === true, "a customer whose hosting was cancelled (status unchanged) still fires — the £99 guarantee is calendar-based");
for (const s of ["payment_received", "in_delivery", "report_sent", "closed", null, undefined, ""]) {
  ok(isRemeasureDue({ ...RG, status: s as string | null }, "2026-10-06").due === true, `status ${JSON.stringify(s)} does not stop it`);
}

console.log("\n── THE OTHER GATES: EVERY ABSENCE REFUSES ──");
ok(isRemeasureDue({ ...RG, baseline_audit_id: null }, "2026-10-06").reason === "no_baseline_pointer", "no pointer → not due (never 'pick one')");
ok(isRemeasureDue({ ...RG, baseline_audit_id: "  " }, "2026-10-06").reason === "no_baseline_pointer", "blank pointer → not due");
ok(isRemeasureDue({ ...RG, remeasure_audit_id: "abc" }, "2026-10-06").reason === "already_replayed", "already replayed → not due (the pointer is the idempotency)");
ok(isRemeasureDue({ ...RG, remeasure_due_date: null }, "2026-10-06").reason === "no_due_date", "⛔ NULL date → not due, never computed");
ok(isRemeasureDue({ ...RG, remeasure_due_date: "" }, "2026-10-06").reason === "no_due_date", "empty date → not due");
ok(isRemeasureDue({ ...RG, remeasure_due_date: "06/10/2026" }, "2026-10-06").reason === "no_due_date", "a non-ISO date is not a date");
ok(isRemeasureDue({ ...RG, is_archived: true }, "2026-10-06").reason === "archived", "archived → not due (is_archived, the real column)");
ok(isRemeasureDue({ ...RG, amount_paid: 0 }, "2026-10-06").reason === "not_paid", "nothing paid → not due");
ok(isRemeasureDue({ ...RG, amount_paid: null }, "2026-10-06").reason === "not_paid", "amount null → not due");
ok(isRemeasureDue(null, "2026-10-06").due === false, "no lead → not due");
ok(isRemeasureDue(RG, "garbage").due === false, "an unreadable 'today' refuses rather than guesses");
ok(utcDateISO(Date.UTC(2026, 9, 6, 23, 59)) === "2026-10-06", "today is the UTC day (a BST evening does not roll to the 7th)");

console.log("\n── 3. THE FILL NEVER OVERWRITES A STORED DATE ──");
ok(remeasureDueFill("2026-10-06", "2026-08-11T09:00:00Z") === null, "RG's stored 2026-10-06 → fill returns null (no write)");
ok(remeasureDueFill("2026-10-13", "2026-09-15T09:00:00Z") === null, "Ronnie's stored 2026-10-13 → null");
ok(remeasureDueFill(" 2026-10-06 ", "2026-08-11T09:00:00Z") === null, "a padded stored value still counts as set");
const filled = remeasureDueFill(null, "2026-09-12T14:00:00Z");
ok(filled === "2026-10-10", `a NULL date fills to frozen + ${REMEASURE_OFFSET_DAYS} = 2026-10-10 (got ${filled})`);
ok(remeasureDueFill(undefined, "2026-09-12T14:00:00Z") === "2026-10-10", "undefined behaves as NULL");
ok(remeasureDueFill(null, "not a date") === null, "an unreadable freeze instant writes nothing");
ok(REMEASURE_OFFSET_DAYS === 28, "the offset is 28 (RG's +56 is stored by hand, never derived)");
/* The write side: the update carries the NULL guard in the database too. */
const frozen = baselineSrc.slice(baselineSrc.indexOf("export async function onBaselineFrozen"), baselineSrc.indexOf("export async function startFullMeasure"));
ok(/\.update\(\{ remeasure_due_date: fill \}\)[\s\S]{0,80}\.is\("remeasure_due_date", null\)/.test(frozen), "⛔ the fill's UPDATE carries .is('remeasure_due_date', null) — the database refuses to overwrite even if the read raced");
ok(!/\.update\(\{[^}]*remeasure_due_date/.test(tick), "…and the tick never writes the date column at all");

console.log("\n── FIRE AND STAMP: WORK UNFINISHED IS RECORDED, NOT A DELAY ──");
ok(JSON.stringify([...WORK_MILESTONES]) === JSON.stringify(["directories", "pages", "gbp", "website"]), "the four delivery milestones (the re-measure tick itself excluded)");
ok(workIncompleteFor(null).incomplete === true && workIncompleteFor(null).missing.length === 4, "no checklist → incomplete, all four named");
ok(workIncompleteFor({ directories: true, pages: true, gbp: true, website: true }).incomplete === false, "all four ticked → complete");
ok(workIncompleteFor({ directories: true, pages: true, gbp: true, website: true, remeasure: false }).incomplete === false, "the remeasure tick does not count against completeness");
ok(JSON.stringify(workIncompleteFor({ directories: true, pages: false }).missing) === JSON.stringify(["pages", "gbp", "website"]), "missing items are named in delivery order");
ok(!/work\.incomplete\s*\)\s*(continue|return)/.test(tick) && /work_incomplete: work\.incomplete/.test(tick), "the tick STAMPS work_incomplete on the replay and never skips on it");

console.log("\n── THE WIRING ──");
const queue = stripComments(read("supabase/functions/process-ai-audit-queue/index.ts"));
ok(/await ensureBaselinesForPaidOnboardings\(service\);[\s\S]{0,600}await fireDueRemeasures\(service\);/.test(queue), "the tick runs fireDueRemeasures beside ensureBaselinesForPaidOnboardings");
const server = stripComments(read("supabase/functions/create-ai-audit/index.ts"));
ok(/const isRemeasure: boolean = isInternal && body\.purpose === "remeasure";/.test(server), "'remeasure' is an internal-only purpose");
ok(/!isBaseline && !isRemeasure && !townConfirmed && townGated\(lead\)/.test(server), "the replay is exempt from the town gate");
/* Written as the named constant since 2026-09-13 (REMEASURE_AUDIT_PURPOSE in src/lib/auditKind.ts);
   the literal is accepted too so this cannot fail on a spelling the trigger still reads. */
ok(/isRemeasure \? (?:"remeasure"|REMEASURE_AUDIT_PURPOSE)/.test(server), "audit_purpose = 'remeasure' is written — what the claim trigger and the unique index key on");
ok(/judgeRemeasure\(\{\s*proposed: providedQuestions,\s*baselineAsked,\s*targetRuns: MEASUREMENT_RUNS/.test(server), "the replay is gated by judgeRemeasure against the ASKED set");
ok(/code === "23505"/.test(server) && /already_remeasured/.test(server), "a duplicate refused by the database is answered 409 already_remeasured, not 500");
ok(/refuse\("already_remeasured"/.test(server) && /refuse\("no_baseline_recorded"/.test(server) && /refuse\("baseline_not_frozen"/.test(server), "the three named refusals exist and are recorded");
ok(/measurementFlagFor\(isMeasurement \|\| isRemeasure\)/.test(server), "a replay is flagged is_measurement, so it can never be mistaken for a baseline");
ok(/questions: plan\.questions,/.test(tick) && /purpose: "remeasure",/.test(tick), "the tick sends the baseline's ASKED set verbatim with purpose 'remeasure'");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
