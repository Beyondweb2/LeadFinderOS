/* ══════════════════════════════════════════════════════════════════════════════════════════════
   "FINISH AT 7 OF 8" — AND THE ONE THING THAT MUST NEVER HAPPEN.

   The rule lets a TARGETING/area audit finalise without its last question. The paid baseline is
   the measurement behind the money-back guarantee and must still wait for every question.

   ⛔ CLAUDE.md's rule, twice learned the hard way: do not check only whether the guard is CORRECT,
   check whether the case it guards can REACH it. So section 2 does not test "a baseline returns
   false" once — it drives EVERY combination of question counts and timings with a baseline
   attached and asserts not one of them reaches the drop.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  mayFinishWithoutStragglers,
  TARGETING_STRAGGLER_GRACE_MS,
  TARGETING_MIN_QUESTIONS_TO_DROP,
  type StragglerInput,
} from "../supabase/functions/_shared/targeting-straggler.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** A healthy market audit sitting on 7 of 8 with the rest long since in. */
const base: StragglerInput = {
  isMarket: true,
  baselineTargetRuns: null,
  totalQuestions: 8,
  settledQuestions: 7,
  outstandingQuestions: 1,
  msSinceRestSettled: TARGETING_STRAGGLER_GRACE_MS,
};
const w = (o: Partial<StragglerInput>) => mayFinishWithoutStragglers({ ...base, ...o });

console.log("\n── 1. THE CASE THE RULE EXISTS FOR ──");
ok(w({}) === true, "market audit, 7 of 8 settled, grace elapsed -> finalises");
ok(w({ totalQuestions: 16, settledQuestions: 15 }) === true, "a 16-question run finalises at 15");

console.log("\n── 2. THE PAID BASELINE CAN NEVER REACH IT ──");
/* Every shape the caller could hand us, crossed with every way a baseline identifies itself. */
let baselineReached = 0, baselineCases = 0;
for (const isMarket of [false, null, undefined, true]) {
  for (const targetRuns of [3, 2, "3"]) {
    for (const total of [3, 5, 8, 10, 16]) {
      for (const outstanding of [0, 1, 2]) {
        for (const ms of [0, 30_000, TARGETING_STRAGGLER_GRACE_MS, 600_000]) {
          baselineCases++;
          if (mayFinishWithoutStragglers({
            isMarket, baselineTargetRuns: targetRuns,
            totalQuestions: total, settledQuestions: total - outstanding,
            outstandingQuestions: outstanding, msSinceRestSettled: ms,
          })) baselineReached++;
        }
      }
    }
  }
}
ok(baselineReached === 0, `${baselineCases} baseline shapes driven (including is_market=true), 0 reached the drop`);

/* And the belt-and-braces half on its own: a baseline that somehow WAS flagged as a market. */
ok(w({ baselineTargetRuns: 3 }) === false, "is_market=true but baseline_target_runs=3 -> refused");
ok(w({ baselineTargetRuns: 2 }) === false, "baseline_target_runs=2 -> refused");
ok(w({ baselineTargetRuns: 1 }) === true, "a single-run audit is not a baseline -> allowed");
ok(w({ baselineTargetRuns: 0 }) === true, "0 target runs is not a baseline -> allowed");

console.log("\n── 3. ABSENT / UNREADABLE VALUES ALL WAIT (absence is never an answer) ──");
/* Labelled with String(), not JSON.stringify: stringify renders NaN as "null", which would print
   two identical lines for two different inputs — a test whose output lies about what it drove. */
for (const v of [false, null, undefined, 0, 1, "true", "yes", "", NaN, {}]) {
  ok(w({ isMarket: v }) === false, `is_market=${typeof v === "string" ? `"${v}"` : String(v)} (${typeof v}) -> waits for every question`);
}
ok(w({ baselineTargetRuns: "abc" }) === false, "unreadable baseline_target_runs -> waits (unknown baseline = baseline)");
ok(w({ baselineTargetRuns: undefined }) === true, "absent baseline_target_runs is 0, not unknown -> allowed");

console.log("\n── 4. A RUN TOO SMALL TO LOSE ONE ──");
ok(w({ totalQuestions: 4, settledQuestions: 3 }) === false, "4 questions -> refused (below the floor)");
ok(w({ totalQuestions: 2, settledQuestions: 1 }) === false, "2 questions -> never finalise on a single answer");
ok(w({ totalQuestions: 1, settledQuestions: 0, outstandingQuestions: 1 }) === false, "1 question -> refused");
ok(
  w({ totalQuestions: TARGETING_MIN_QUESTIONS_TO_DROP, settledQuestions: TARGETING_MIN_QUESTIONS_TO_DROP - 1 }) === true,
  `exactly ${TARGETING_MIN_QUESTIONS_TO_DROP} questions -> allowed (the floor itself)`,
);

console.log("\n── 5. HOW MANY ARE LEFT ──");
ok(w({ outstandingQuestions: 0, settledQuestions: 8 }) === false, "nothing outstanding -> not this path's business");
ok(w({ outstandingQuestions: 2, settledQuestions: 6 }) === false, "TWO outstanding -> refused, this is one straggler only");
ok(w({ outstandingQuestions: 5, settledQuestions: 3 }) === false, "half the batch outstanding -> refused");

console.log("\n── 6. THE GRACE — AND WHY IT IS NOT A TIME CAP ──");
ok(w({ msSinceRestSettled: 0 }) === false, "the rest landed this instant -> wait");
ok(w({ msSinceRestSettled: TARGETING_STRAGGLER_GRACE_MS - 1 }) === false, "one ms short of the grace -> wait");
ok(w({ msSinceRestSettled: TARGETING_STRAGGLER_GRACE_MS }) === true, "grace exactly met -> finalise");
ok(w({ msSinceRestSettled: NaN }) === false, "unreadable timestamp -> wait");
ok(w({ msSinceRestSettled: -5_000 }) === false, "clock skew (negative) -> wait");

console.log("\n── 7. COUNTS THAT DISAGREE WITH EACH OTHER ──");
ok(w({ settledQuestions: 3, outstandingQuestions: 1, totalQuestions: 8 }) === false, "settled+outstanding < total -> refused");
ok(w({ settledQuestions: 9, outstandingQuestions: 1, totalQuestions: 8 }) === false, "settled+outstanding > total -> refused");

console.log("\n── 8. REPLAYING THE REAL RUNS (measured 2026-08-13) ──");
/* ROYAL SUTTON COLDFIELD — the run that took 13.9 min. One audit's 8 questions: seven were in by
   5.85 min, the last did not land until 13.88. The rule should fire. */
const royalSutton = w({ totalQuestions: 8, settledQuestions: 7, outstandingQuestions: 1, msSinceRestSettled: 60_000 });
ok(royalSutton === true, "Royal Sutton Coldfield: 7 in at 5.85 min, 1 hanging -> drops the straggler");

/* LEYLAND — all 8 questions finished together at 12.1 min. There is never a moment where seven are
   settled and one has been missing for a minute, so the rule must never fire. This is the
   healthy-but-slow batch the old 5-minute cap destroyed. */
let leylandFired = false;
/* Walk the batch as the queue would see it, tick by tick: nothing settles until the very end. */
for (let settled = 0; settled <= 8; settled++) {
  const outstanding = 8 - settled;
  /* Everything lands inside one 30-second tick, so the rest has never been in for a full minute. */
  for (const ms of [0, 1_000, 30_000]) {
    if (mayFinishWithoutStragglers({ ...base, settledQuestions: settled, outstandingQuestions: outstanding, msSinceRestSettled: ms })) {
      leylandFired = true;
    }
  }
}
ok(leylandFired === false, "Leyland (all 8 slow together, landing in one tick) -> nothing dropped, nothing saved");

/* IPSWICH — 17.8 min, also uniformly slow. Same shape, asserted separately because it is the
   worst non-incident run in the book and the one most tempting to "fix" with a cap. */
ok(
  mayFinishWithoutStragglers({ ...base, settledQuestions: 0, outstandingQuestions: 8, msSinceRestSettled: 900_000 }) === false,
  "Ipswich (nothing settled yet after 15 min) -> refused; slowness alone never drops a question",
);

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURE(S)`);
if (f > 0) Deno.exit(1);
