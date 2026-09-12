/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE POINTER, THE REPLAY AND THE REFUSAL.

   🔴 WHAT THIS PINS: "the same questions on the same engines" was never enforceable across audits.
   Nothing named THE baseline — `baseline_contract` is written to every audit startPaidBaseline
   creates, so ten runaway baselines produced ten contracts and none was authoritative. ABLM is the
   same gap on a real client: 28 runs, 10 question sets, a pair comparing ZERO questions.

   ⛔ THE PROPERTY: a re-measure either replays the recorded baseline's ASKED questions, or it
   refuses. There is no third branch, and in particular there is no fall back to generation — a
   replay that generated a fresh set when it could not find the baseline would reproduce the drift
   it exists to stop while looking like it worked.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  planReplay, judgeRemeasure, intendedCount,
  type BaselineSource,
} from "../src/lib/baselineReplay.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const BASE = ["locksmith in Huntingdon", "emergency locksmith St Neots", "lock change Cambridge"];
const src = (o: Partial<BaselineSource>): BaselineSource =>
  ({ pointer: "aud_1", auditExists: true, askedQuestions: BASE, ...o });

console.log("── NO POINTER IS A REFUSAL, NEVER A GUESS ──");
/* 🔴 The whole point. A guessed baseline silently compares against a set nobody chose, and the
   refund turns on that comparison. */
for (const p of [null, undefined, "", "   "]) {
  const r = planReplay(src({ pointer: p as string | null | undefined }));
  ok(r.ok === false && r.reason === "no_baseline_recorded", `pointer ${JSON.stringify(p)} → refused`);
}
ok((planReplay(src({ auditExists: false })) as { reason?: string }).reason === "baseline_audit_missing",
   "a pointer at a deleted audit → refused, not silently re-baselined");
ok((planReplay(src({ askedQuestions: [] })) as { reason?: string }).reason === "baseline_has_no_questions",
   "a baseline with no queued questions → refused");
ok((planReplay(src({ askedQuestions: ["  ", ""] })) as { reason?: string }).reason === "baseline_has_no_questions",
   "…and blank questions are not questions");

console.log("\n── THE REPLAY IS THE ASKED SET, VERBATIM AND IN ORDER ──");
const plan = planReplay(src({}));
ok(plan.ok === true, "a recorded baseline with questions replays");
if (plan.ok) {
  ok(JSON.stringify(plan.questions) === JSON.stringify(BASE), "questions are verbatim, in queue order");
  ok(plan.asked === 3, "asked = 3");
}
/* Deduped exactly as the audit queue dedupes — a replay must not carry two casings into a
   comparison that joins on the text. */
const dup = planReplay(src({ askedQuestions: ["Locksmith in Huntingdon", "locksmith in HUNTINGDON", "x y z"] }));
ok(dup.ok === true && dup.questions.length === 2, "case-duplicates collapse, first spelling wins");

console.log("\n── SHORT SETS SAY SO: 'N of M' ──");
/* ⚠️ A baseline that intended 12 and asked 9 is a valid yardstick for those 9. Describing it as the
   whole measurement is how a partial before/after gets read as complete. */
const shortPlan = planReplay(src({ contract: { allocation: [{ questions: 6 }, { questions: 6 }] } }));
ok(shortPlan.ok === true && shortPlan.short === true, "asked 3 of an intended 12 → short");
ok(shortPlan.ok === true && /3 of 12/.test(shortPlan.summary), `the summary states it: "${shortPlan.ok ? shortPlan.summary : ""}"`);
const fullPlan = planReplay(src({ contract: { allocation: [{ questions: 3 }] } }));
ok(fullPlan.ok === true && fullPlan.short === false, "asked 3 of an intended 3 → not short");

console.log("\n── AN UNRECORDED INTENT IS NOT A NUMBER ──");
/* Absence must read as "not recorded", never as a count invented from BASELINE_QUESTIONS. */
for (const c of [null, undefined, {}, { allocation: [] }, { allocation: "nope" }, { allocation: [{ questions: 0 }] }]) {
  ok(intendedCount(c) === null, `intendedCount(${JSON.stringify(c)}) → null`);
}
ok(intendedCount({ allocation: [{ questions: 6 }, { questions: 4 }] }) === 10, "a real allocation sums");
const noIntent = planReplay(src({ contract: null }));
ok(noIntent.ok === true && noIntent.intended === null && /not recorded/.test(noIntent.summary),
   "no allocation → the summary says the intended count is not recorded");

console.log("\n── THE REFUSAL: THE FOUR LEGITIMATE CASES ──");
const j = (o: Partial<Parameters<typeof judgeRemeasure>[0]>) =>
  judgeRemeasure({ proposed: BASE, baselineAsked: BASE, targetRuns: 3, ...o });

ok(j({}).allow === true && j({}).reason === "matches_baseline", "same set, 3 runs → allowed, counts");

/* 1 + 2. A dropped town and a guard-rejected question were NEVER QUEUED, so they are not in the
   asked set — identical by construction rather than by exception. This is the case that used to
   read as a mismatch when the diff was taken against the intended set. */
const askedAfterDrops = ["locksmith in Huntingdon", "emergency locksmith St Neots"];   // one never queued
const dropCase = judgeRemeasure({ proposed: askedAfterDrops, baselineAsked: askedAfterDrops, targetRuns: 3 });
ok(dropCase.allow === true && dropCase.reason === "matches_baseline",
   "a town dropped by the ceiling / a question the guards rejected is NOT a mismatch");

/* 3. The Quick 1-run re-audit: allowed, but refused a place in the before/after. */
const quick = j({ targetRuns: 1, proposed: ["something else entirely"] });
ok(quick.allow === true, "a Quick 1-run re-audit is ALLOWED even with different questions");
ok(quick.allow === true && quick.countsAsMeasurement === false, "…and does NOT count as a measurement");
ok(judgeRemeasure({ proposed: [], baselineAsked: null, targetRuns: 1 }).allow === true,
   "…even with no baseline recorded at all");

/* 4. A deliberately changed town, with a named reason recorded on the audit. */
const overridden = j({ proposed: [...BASE, "locksmith in Ely"], overrideReason: "Client stopped serving St Neots, added Ely" });
ok(overridden.allow === true && overridden.reason === "operator_override", "a named override is allowed");
ok(overridden.allow === true && /Ely/.test(overridden.detail), "…and the REASON is carried into the record");

console.log("\n── ANYTHING ELSE IS REFUSED ──");
const drifted = j({ proposed: ["a brand new question", "and another"] });
ok(drifted.allow === false && drifted.reason === "questions_differ_from_baseline", "a silently different set → refused");
ok(drifted.allow === false && /before side/.test(drifted.detail), "…and the refusal says what would be lost");
ok(j({ proposed: BASE.slice(0, 2) }).allow === false, "dropping a baseline question → refused");
ok(j({ proposed: [...BASE, "extra"] }).allow === false, "adding one → refused");
ok(j({ baselineAsked: null }).allow === false, "a multi-run re-measure with no baseline → refused");

console.log("\n── AN OVERRIDE MUST BE WORDS, NOT A FLAG ──");
/* A boolean would let any caller wave a change through with no record. Requiring a reason means the
   comparison can print WHY the set changed — the difference between a documented change and drift. */
for (const r of [null, undefined, "", "   ", "changed", "because"]) {
  ok(j({ proposed: ["totally different"], overrideReason: r as string | null }).allow === false,
     `override reason ${JSON.stringify(r)} is too thin → still refused`);
}

console.log("\n── ORDER AND CASE ARE NOT IDENTITY ──");
ok(j({ proposed: [BASE[2], BASE[0], BASE[1]] }).reason === "matches_baseline", "reordered → still like-for-like");
ok(j({ proposed: BASE.map((q) => q.toUpperCase()) }).reason === "matches_baseline", "re-cased → still like-for-like");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
