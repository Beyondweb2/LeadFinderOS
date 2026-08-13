/* ══════════════════════════════════════════════════════════════════════════════════════════════
   MAY A TARGETING AUDIT FINISH WITHOUT ITS LAST QUESTION?

   Measured 2026-08-13 across 24 real market measure runs: 11 of 16 questions typically land
   inside 2.4 minutes and the wall clock is set by ONE straggler. Royal Sutton Coldfield took
   13.9 minutes with 11 questions done at 2.3; Accountants/Wakefield took 17.7. Waiting for the
   last question buys one question of breadth and costs the operator ten minutes of their day.

   ⛔ THIS IS NOT A TIME CAP AND MUST NEVER BECOME ONE.
   MAX_RUN_AGE_MS in process-ai-audit-queue records what happened the last time a question was
   killed for being slow: at 5 minutes the guard culled healthy-but-slow runs into a serial
   retry-storm, and a 5-question audit burned 8 Apify runs over 16.4 minutes. Nothing here reads
   how long a question has been running. It asks only whether a question is the LAST ONE LEFT in
   its own batch. That distinction is the whole design, and it is why a uniformly-slow batch is
   untouched: Leyland's 8 questions all finished together at 12.1 minutes, so the run never
   reached "all but one settled" until the end — nothing is dropped and nothing is saved. The rule
   fires only where there is genuinely one laggard, which is exactly where the time is being lost.

   ⛔ TARGETING ONLY — THE PAID BASELINE MUST STILL WAIT FOR EVERY QUESTION.
   The baseline is the measurement the money-back guarantee is settled against, so a baseline run
   that is missing a question is not a baseline. It is excluded twice over, by is_market and again
   by baseline_target_runs, and the eligibility test asserts the grade it WANTS (is_market === true)
   rather than the one it wants to exclude. A null, a false, an absent column or an unrecognised
   value therefore all mean "wait for every question" — the safe direction, and the same rule
   serveGate and offTradeMark already follow.

   Proven separate in the live data 2026-08-13: of 333 audits, 44 are market and 5 are baseline,
   with ZERO overlap in either direction, and no market audit carries a lead_id.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** At most this many questions may be abandoned per run. One: "15 of 16", not "most of them". */
export const TARGETING_MAX_STRAGGLERS = 1;

/** Never let a SHORT run finish on a fraction of itself. A market audit is 8 questions
 *  (MARKET_AUDIT_QUESTION_COUNT in src/lib/marketView.ts); on a 2-question run "all but one"
 *  would mean finalising on a SINGLE answer, which is not a measurement of anything. */
export const TARGETING_MIN_QUESTIONS_TO_DROP = 5;

/** How long the straggler must STILL be missing after the rest of its batch settled.
 *  ⚠️ NOT a ceiling on the question — a confirmation that it is genuinely lagging rather than
 *  simply landing on the next 30-second tick. Without it a question thirty seconds from returning
 *  is thrown away to save thirty seconds, and breadth is the entire point of a market audit.
 *  Two ticks. */
export const TARGETING_STRAGGLER_GRACE_MS = 60_000;

/** The exact token written to the dropped row. Matched verbatim by explainAuditFailure in
 *  src/lib/auditErrors.ts, so it must not be reworded on one side only. */
export const TARGETING_STRAGGLER_ERROR = "straggler_dropped";

export interface StragglerInput {
  /** ai_audits.is_market, RAW and unnormalised — the caller must not coerce it. */
  isMarket: unknown;
  /** ai_audits.baseline_target_runs, raw. Greater than 1 means a paid multi-run baseline. */
  baselineTargetRuns: unknown;
  /** Total queue rows on this run. */
  totalQuestions: number;
  /** Rows already done or failed. */
  settledQuestions: number;
  /** Rows still pending or running. */
  outstandingQuestions: number;
  /** now − the newest updated_at among the SETTLED rows. 0 when unknown, which never qualifies. */
  msSinceRestSettled: number;
}

/**
 * True only when every condition holds. Deliberately a single boolean with no "reason" channel:
 * the caller's only two behaviours are "finalise now" and "wait, exactly as before", and a
 * partially-true answer has no meaning here.
 */
export function mayFinishWithoutStragglers(i: StragglerInput): boolean {
  /* 1. TARGETING AUDITS ONLY. Strict identity, never a truthiness test: the string "false", 0 and
        null are all things a column read can hand you, and every one of them must fail closed. */
  if (i.isMarket !== true) return false;

  /* 2. AND NEVER A PAID BASELINE. A market audit cannot carry one today; if that ever changes,
        the guarantee measurement must not be the thing that discovers it. */
  const targetRuns = Number(i.baselineTargetRuns ?? 0);
  if (Number.isFinite(targetRuns) && targetRuns > 1) return false;
  /* An unreadable baseline_target_runs is an unknown, and an unknown baseline is treated as a
     baseline. Absence is never an answer. */
  if (!Number.isFinite(targetRuns)) return false;

  /* 3. THE RUN MUST BE BIG ENOUGH TO LOSE ONE. */
  if (!Number.isFinite(i.totalQuestions) || i.totalQuestions < TARGETING_MIN_QUESTIONS_TO_DROP) return false;

  /* 4. EXACTLY ONE (or fewer) LEFT, AND AT LEAST ONE ACTUALLY OUTSTANDING. Zero outstanding is
        not this function's business — the caller finalises that the ordinary way, and answering
        true here would let a fully-settled run take the dropped-question path. */
  if (i.outstandingQuestions < 1 || i.outstandingQuestions > TARGETING_MAX_STRAGGLERS) return false;

  /* 5. THE REST MUST GENUINELY HAVE LANDED. Guards the degenerate case where the counts disagree
        with each other (a caller bug should never finalise an audit on nothing). */
  if (i.settledQuestions !== i.totalQuestions - i.outstandingQuestions) return false;
  if (i.settledQuestions < TARGETING_MIN_QUESTIONS_TO_DROP - TARGETING_MAX_STRAGGLERS) return false;

  /* 6. AND THEY MUST HAVE LANDED A MOMENT AGO. This is the clause that keeps a uniformly-slow
        batch alive: it is measured from the SETTLED rows, not from the straggler's own start. */
  if (!Number.isFinite(i.msSinceRestSettled) || i.msSinceRestSettled < TARGETING_STRAGGLER_GRACE_MS) return false;

  return true;
}
