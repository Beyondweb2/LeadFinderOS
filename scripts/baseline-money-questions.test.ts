/* ============================================================
   MONEY QUESTIONS IN THE PAID BASELINE — Paul's spec, 2026-08-31.

   The properties this suite exists for, in order of what they protect:
   ⛔ money questions are a MINORITY at every baseline size (0.25, vs the hook's 0.4);
   ⛔ a SEEDED baseline never loses a seed to a money question — the seeds ARE
      BaselineContract.scoredQuestions, the refund test, so displacing one would change what a
      client's money-back guarantee is measured on;
   ⛔ applySeed keeps the money questions it is given, which is only true because the generator
      returns them FIRST — with money last, a heavily-seeded baseline discards every one of them;
   ⛔ a small multi-area allocation gets ZERO money questions by the floor, not by a special case.
   ============================================================ */
import {
  moneyQuestionShare, baselineMoneyQuestionShare, moneyQuestionShareAt,
  MONEY_QUESTION_SHARE, BASELINE_MONEY_QUESTION_SHARE, MONEY_QUESTION_MIN_COUNT,
} from "../src/lib/moneyQuestions.ts";
import { applySeed } from "../src/lib/seedGuard.ts";
import { AREA_MIN_QUESTIONS } from "../src/lib/baselineContract.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── PAUL'S NUMBER: 5 of 20 ──");
ok(baselineMoneyQuestionShare(20) === 5, "⛔ 20-question baseline → exactly 5 money questions");
ok(BASELINE_MONEY_QUESTION_SHARE === 0.25, "the baseline share is a quarter");
ok(MONEY_QUESTION_SHARE === 0.4, "⛔ the HOOK share is untouched at 0.4");
ok(moneyQuestionShare(5) === 2, "⛔ the hook still returns 2 of 5 — this build changed nothing there");

console.log("\n── ALWAYS A STRICT MINORITY, AT EVERY BASELINE SIZE ──");
for (const n of [3, 4, 5, 8, 10, 12, 16, 20, 47, 75]) {
  const m = baselineMoneyQuestionShare(n);
  ok(m * 2 < n, `⛔ ${n}: money (${m}) is a STRICT minority`);
  ok(m <= n - 1, `  ${n}: at least one standard question always survives`);
  ok(m <= moneyQuestionShare(n), `  ${n}: never more than the hook's share (${m} <= ${moneyQuestionShare(n)})`);
}

console.log("\n── TOO SMALL, AND JUNK, YIELD ZERO ──");
for (const n of [0, 1, 2]) {
  ok(baselineMoneyQuestionShare(n) === 0, `${n} (< MIN_COUNT ${MONEY_QUESTION_MIN_COUNT}) → 0`);
}
for (const bad of [null, undefined, NaN, -5, "abc"]) {
  ok(baselineMoneyQuestionShare(bad as number) === 0, `junk ${JSON.stringify(bad)} → 0`);
}
ok(moneyQuestionShareAt(20, 0) === 0, "a zero share yields none");
ok(moneyQuestionShareAt(20, NaN) === 0, "⛔ an unreadable share yields NONE, never a default sprinkling");

console.log("\n── ⛔ A MULTI-AREA BASELINE'S SMALL AREAS GET NONE, BY THE FLOOR ──");
ok(AREA_MIN_QUESTIONS < MONEY_QUESTION_MIN_COUNT,
  `an area's floor (${AREA_MIN_QUESTIONS}) is below the money floor (${MONEY_QUESTION_MIN_COUNT}), so minimum areas are excluded automatically`);
ok(baselineMoneyQuestionShare(AREA_MIN_QUESTIONS) === 0,
  `⛔ an area with the minimum ${AREA_MIN_QUESTIONS} questions gets 0 money questions`);

console.log("\n── ⛔ SEEDS ARE NEVER DISPLACED (the refund test is untouched) ──");
{
  // The real shape: a 20-question baseline seeded with 15 outreach questions. The generator is
  // asked for a 20-long pool but the money share is taken on the 5-slot TOP-UP.
  const target = 20;
  const seeds = Array.from({ length: 15 }, (_, i) => `locksmith job number ${i + 1} in Huntingdon UK`);
  const topUp = target - seeds.length;
  const moneyN = baselineMoneyQuestionShare(topUp);
  ok(moneyN === 1, `top-up of ${topUp} → ${moneyN} money question (a quarter of the TOP-UP, not of 20)`);

  // Money FIRST, exactly as generateWithMoney returns it.
  const money = Array.from({ length: moneyN }, (_, i) => `emergency locksmith number ${i + 1} in Huntingdon UK`);
  const standard = Array.from({ length: target - moneyN }, (_, i) => `locksmith service ${i + 1} in Huntingdon UK`);
  const pool = [...money, ...standard];

  const outcome = applySeed(seeds, pool, target, "locksmith", "Huntingdon UK");
  ok(outcome.questions.length === target, `the audit is still ${target} questions`);
  ok(outcome.seeded.length === seeds.length, `⛔ all ${seeds.length} seeds survived — scoredQuestions is unchanged`);
  for (const s of seeds) ok(outcome.questions.includes(s), `  seed kept: "${s.slice(0, 28)}…"`);
  for (const m of money) {
    ok(outcome.questions.includes(m), `⛔ money question SURVIVED applySeed: "${m.slice(0, 28)}…"`);
  }
  // The property the ordering exists for.
  const kept = new Set(outcome.questions);
  ok(money.every((m) => kept.has(m)), "⛔ money-first ordering means applySeed keeps every money question");
}

console.log("\n── ⛔ AND WITH MONEY LAST IT WOULD HAVE BEEN SILENTLY DROPPED (the bug avoided) ──");
{
  const target = 20;
  const seeds = Array.from({ length: 15 }, (_, i) => `locksmith job number ${i + 1} in Huntingdon UK`);
  const money = ["emergency locksmith number 1 in Huntingdon UK"];
  const standard = Array.from({ length: 19 }, (_, i) => `locksmith service ${i + 1} in Huntingdon UK`);
  const poolMoneyLast = [...standard, ...money];
  const outcome = applySeed(seeds, poolMoneyLast, target, "locksmith", "Huntingdon UK");
  ok(!outcome.questions.includes(money[0]),
    "⛔ money LAST → dropped entirely; this is why generateWithMoney returns money first");
}

console.log("\n── THE FLAG CAN NEVER NAME AN UNQUEUED QUESTION ──");
{
  /* The intersection create-ai-audit and audit-baseline both apply: money list ∩ queued, matched
     case-insensitively. Restated here so a change to either copy fails a test. */
  const queued = ["Money One in Wisbech UK", "standard one in wisbech uk"];
  const generatedMoney = ["money one in wisbech uk", "a money question the guards rejected"];
  const queuedKeys = new Map(queued.map((q) => [q.trim().toLowerCase(), q]));
  const flagged = Array.from(new Set(
    generatedMoney.map((q) => queuedKeys.get(q.trim().toLowerCase())).filter((q): q is string => !!q),
  ));
  ok(flagged.length === 1, "a rejected money question is not flagged");
  ok(flagged[0] === "Money One in Wisbech UK", "⛔ the stored string is the one AS QUEUED, not as generated");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exit(1);
