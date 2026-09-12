/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT KIND OF AUDIT IS THIS? — the writer's rule and the reader's rule, in ONE module.

   🔴 THE INCIDENT (2026-09-12): ONE PAYMENT CREATED TEN PAID BASELINES, ~£3.70 of Apify, in a loop
   that ran every queue tick until the onboarding row was reset by hand.

   Two guards in two files, each correct about its own problem, contradicting each other:

     · create-ai-audit wrote  `is_measurement = true` when `isMeasurement || baselineTargetRuns > 1`
       — widened so that an unmarked 3-run FREE-CHECK audit could not be mistaken for a baseline.
     · audit-baseline read    "already has a baseline" as `baseline_target_runs > 1 && is_measurement
       !== true`.

   A paid baseline sends `baseline_target_runs: 3`, so the writer marked it `is_measurement` — the
   exact condition the reader excludes. `startPaidBaseline` could never see the audit it had just
   created, so `ensureBaselinesForPaidOnboardings` made another one every tick.

   ⛔ SO THE TWO RULES LIVE HERE, TOGETHER, AND THE TEST DRIVES THEM AS A ROUND TRIP: take what the
   writer sets, hand it to the reader, assert the reader recognises it. That property is what was
   broken, and it is not expressible while the two halves sit in different files agreeing only by
   comment — one of which had been false since the day the other was widened.

   ⚠️ `is_measurement` MUST NOT BE INFERRED FROM RUN COUNT. One flag cannot mean both "has more than
   one run" and "is not the paid baseline": the paid baseline, the free check and a re-measure are
   ALL multi-run. Run count is a cost decision; kind is a purpose. They are different questions and
   the column answers only the second one now.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The three multi-run audit kinds, plus the two states that are not a kind at all. */
export type AuditKind =
  /** A paid day-0 baseline: multi-run, not a measurement, and carrying its frozen contract. */
  | 'paid_baseline'
  /** A re-measure / Full Measurement. Marked at creation from its PURPOSE. */
  | 'measurement'
  /** Multi-run, not a measurement, no contract — a free-check audit, OR a paid baseline whose
   *  contract write failed. The two are indistinguishable on the row, which is why this is its own
   *  kind and never silently folded into either. */
  | 'multi_run_unmarked'
  /** One run. Outreach hook, wizard, the auto-chain. */
  | 'single_run';

/** Only the columns any of this reasons about. Deliberately narrow so a caller cannot pass a whole
 *  row and have an unrelated column quietly start mattering. */
export interface AuditKindRow {
  id?: string;
  baseline_target_runs?: number | null;
  is_measurement?: boolean | null;
  /** Written by startPaidBaseline immediately after the audit exists. The ONLY positive marker a
   *  paid baseline carries — there is no `purpose` column on ai_audits. */
  baseline_contract?: unknown;
}

/**
 * WHAT create-ai-audit WRITES to `is_measurement`.
 *
 * ⛔ THE PURPOSE, AND NOTHING ELSE. It used to be `isMeasurement || baselineTargetRuns > 1`, and
 * that second clause is the whole incident: it made the paid baseline mark itself as the one thing
 * the baseline guard excludes. Run count is deliberately NOT an input here.
 */
export function measurementFlagFor(purposeIsMeasurement: boolean): boolean {
  return purposeIsMeasurement === true;
}

/** Grade one audit row. Pure, and the single place the column meanings are interpreted. */
export function auditKind(row: AuditKindRow): AuditKind {
  const runs = Number(row?.baseline_target_runs ?? 0);
  if (!(runs > 1)) return 'single_run';
  if (row?.is_measurement === true) return 'measurement';
  /* Absent, null, an empty object and an empty string all mean "no contract". A contract that
     validates as empty is not a contract — an empty stamp is absence, never a record. */
  const c = row?.baseline_contract;
  const hasContract = !!c && typeof c === 'object' && Object.keys(c as object).length > 0;
  return hasContract ? 'paid_baseline' : 'multi_run_unmarked';
}

/**
 * Does this lead already have its paid day-0 baseline?
 *
 * ⛔ A POSITIVE TEST, ON THE MARKER ONLY A PAID BASELINE CARRIES. Written as "which rows ARE a
 * baseline" rather than "which rows are not a measurement", because the second form is what failed:
 * it admitted every multi-run audit that happened not to be flagged, and then the flag changed
 * underneath it.
 */
export function findPaidBaseline<T extends AuditKindRow>(rows: readonly T[] | null | undefined): T | null {
  return (rows ?? []).find((r) => auditKind(r) === 'paid_baseline') ?? null;
}

/**
 * Multi-run audits we cannot classify — a free check, or a baseline whose contract write failed.
 *
 * 🔴 THIS EXISTS TO INVERT THE FAILURE DIRECTION (Paul, 2026-09-12). The old guard failed the
 * EXPENSIVE way: an unrecognised baseline silently bought another one, every thirty seconds, and
 * nothing said so. Ambiguity now STOPS the spend and is reported — a skipped baseline is a message
 * in the operator's error list, which is recoverable; ten duplicate baselines is money already gone.
 * ⚠️ It costs something real and stated: a prospect who had a 3-run FREE CHECK and later pays is
 * held rather than measured, until somebody looks. That is the trade — visible and wrong beats
 * invisible and expensive.
 */
export function findAmbiguousMultiRun<T extends AuditKindRow>(rows: readonly T[] | null | undefined): T | null {
  return (rows ?? []).find((r) => auditKind(r) === 'multi_run_unmarked') ?? null;
}
