/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT KIND OF AUDIT IS THIS? — the writer's rule and the reader's rule, in ONE module.

   🔴 THE FIRST INCIDENT (2026-09-12): ONE PAYMENT CREATED TEN PAID BASELINES, ~£3.70 of Apify, in a
   loop that ran every queue tick until the onboarding row was reset by hand.

   Two guards in two files, each correct about its own problem, contradicting each other:

     · create-ai-audit wrote  `is_measurement = true` when `isMeasurement || baselineTargetRuns > 1`
       — widened so that an unmarked 3-run FREE-CHECK audit could not be mistaken for a baseline.
     · audit-baseline read    "already has a baseline" as `baseline_target_runs > 1 && is_measurement
       !== true`.

   A paid baseline sends `baseline_target_runs: 3`, so the writer marked it `is_measurement` — the
   exact condition the reader excludes. `startPaidBaseline` could never see the audit it had just
   created, so `ensureBaselinesForPaidOnboardings` made another one every tick.

   🔴 THE SECOND (found 2026-09-13, before it reached a customer): THE FIX GRADED EVERY 3-RUN FREE
   CHECK AS AMBIGUOUS, SO A PROSPECT WHO TOOK THE FREE CHECK AND THEN PAID NEVER GOT A BASELINE.
   The reader had only `baseline_target_runs`, `is_measurement` and `baseline_contract` to go on,
   and on those three columns a free check and a baseline whose contract write failed are the same
   row. Refusing both was the safe direction — but it refused the funnel's own happy path, and it
   wrote a client_error_reports row every 30 seconds while doing so.

   ⛔ `audit_purpose` EXISTS NOW (Slice 0, 2026-09-12), SO THE KIND IS READ FROM WHAT THE WRITER
   SAID THE AUDIT WAS FOR. A baseline is `audit_purpose = 'baseline'`; a free check is
   `audit_purpose = 'free_check'`; nothing else can match either. The contract is no longer how a
   baseline is RECOGNISED — it is how a RECOGNISED baseline is checked for a failed contract write,
   which is the one case the ambiguity refusal was built for and the only one it still fires on.
   ⚠️ Rows written before the column existed (every audit before 2026-09-12) have no purpose, and
   for those the old three-column rule still applies, refusal included: a legacy free check still
   holds a later payment until somebody looks. That is stated, not hidden — see auditKind().

   ⛔ THE TWO RULES LIVE HERE, TOGETHER, AND THE TEST DRIVES THEM AS A ROUND TRIP: take what the
   writer sets, hand it to the reader, assert the reader recognises it — and assert a free check
   handed to the reader is neither a baseline nor a reason to refuse one.

   ⚠️ `is_measurement` MUST NOT BE INFERRED FROM RUN COUNT. One flag cannot mean both "has more than
   one run" and "is not the paid baseline": the paid baseline, the free check and a re-measure are
   ALL multi-run. Run count is a cost decision; kind is a purpose. They are different questions and
   the column answers only the second one.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** What `create-ai-audit` writes to `ai_audits.audit_purpose`, and what every reader keys on.
 *  ⚠️ The DB trigger that claims `outreach_leads.baseline_audit_id` reads 'baseline' and the one
 *  that claims `remeasure_audit_id` reads 'remeasure' — those two spellings are load-bearing in SQL
 *  as well as here. 'free_check' is read only by code. */
export const BASELINE_AUDIT_PURPOSE = 'baseline';
export const MEASUREMENT_AUDIT_PURPOSE = 'measurement';
export const REMEASURE_AUDIT_PURPOSE = 'remeasure';
export const FREE_CHECK_AUDIT_PURPOSE = 'free_check';
export const ORDINARY_AUDIT_PURPOSE = 'audit';

/** The audit kinds a reader can meet. */
export type AuditKind =
  /** A paid day-0 baseline: purpose 'baseline' (or a legacy multi-run row) carrying its frozen contract. */
  | 'paid_baseline'
  /** A Full Measurement or the day-28 replay. Marked at creation from its PURPOSE. */
  | 'measurement'
  /** The free check: purpose 'free_check'. Multi-run, never a baseline, never ambiguous. */
  | 'free_check'
  /** Any other RECORDED purpose ('audit', 'market', …): a hook, a wizard audit, a manual re-audit.
   *  Whatever its run count, it is neither a baseline nor a reason to hold one. */
  | 'ordinary'
  /** AMBIGUOUS — the one kind that refuses a spend: purpose 'baseline' with NO contract (a failed
   *  contract write), or a LEGACY multi-run row with no purpose and no contract (a pre-2026-09-12
   *  free check and a pre-2026-09-12 failed baseline are indistinguishable on the row). */
  | 'multi_run_unmarked'
  /** One run, no recorded purpose (legacy). */
  | 'single_run';

/** Only the columns any of this reasons about. Deliberately narrow so a caller cannot pass a whole
 *  row and have an unrelated column quietly start mattering. */
export interface AuditKindRow {
  id?: string;
  baseline_target_runs?: number | null;
  is_measurement?: boolean | null;
  /** Written by startPaidBaseline immediately after the audit exists (best-effort, so it CAN be
   *  missing on a real baseline — which is exactly what the ambiguity refusal is for). */
  baseline_contract?: unknown;
  /** Written by create-ai-audit IN the insert since 2026-09-12. Null on every older row. */
  audit_purpose?: string | null;
}

/**
 * WHAT create-ai-audit WRITES to `is_measurement`.
 *
 * ⛔ THE PURPOSE, AND NOTHING ELSE. It used to be `isMeasurement || baselineTargetRuns > 1`, and
 * that second clause is the whole first incident: it made the paid baseline mark itself as the one
 * thing the baseline guard excludes. Run count is deliberately NOT an input here.
 */
export function measurementFlagFor(purposeIsMeasurement: boolean): boolean {
  return purposeIsMeasurement === true;
}

/** A contract that is not a contract: null / undefined / `{}` / `""` / a number are all ABSENCE.
 *  An empty stamp must never count — a baseline validating on `{}` would pass on a write that
 *  stored nothing. */
function hasContract(c: unknown): boolean {
  return !!c && typeof c === 'object' && Object.keys(c as object).length > 0;
}

const purposeOf = (row: AuditKindRow | null | undefined): string =>
  typeof row?.audit_purpose === 'string' ? row.audit_purpose.trim().toLowerCase() : '';

/** Grade one audit row. Pure, and the single place the column meanings are interpreted. */
export function auditKind(row: AuditKindRow): AuditKind {
  const purpose = purposeOf(row);
  const contract = hasContract(row?.baseline_contract);

  /* ⛔ THE RECORDED PURPOSE WINS. It is what the writer said the audit was for, in the same insert
     that created it, and no other column can contradict it. */
  if (purpose) {
    if (purpose === BASELINE_AUDIT_PURPOSE) return contract ? 'paid_baseline' : 'multi_run_unmarked';
    if (purpose === MEASUREMENT_AUDIT_PURPOSE || purpose === REMEASURE_AUDIT_PURPOSE) return 'measurement';
    if (purpose === FREE_CHECK_AUDIT_PURPOSE) return 'free_check';
    return 'ordinary';
  }

  /* LEGACY — no purpose recorded. The pre-2026-09-12 rule, unchanged, refusal included. */
  const runs = Number(row?.baseline_target_runs ?? 0);
  if (!(runs > 1)) return 'single_run';
  if (row?.is_measurement === true) return 'measurement';
  return contract ? 'paid_baseline' : 'multi_run_unmarked';
}

/**
 * Does this lead already have its paid day-0 baseline?
 *
 * ⛔ A POSITIVE TEST. Written as "which rows ARE a baseline" rather than "which rows are not a
 * measurement", because the second form is what failed in the first incident: it admitted every
 * multi-run audit that happened not to be flagged, and then the flag changed underneath it.
 */
export function findPaidBaseline<T extends AuditKindRow>(rows: readonly T[] | null | undefined): T | null {
  return (rows ?? []).find((r) => auditKind(r) === 'paid_baseline') ?? null;
}

/**
 * Multi-run audits we cannot classify — and therefore refuse to spend beside.
 *
 * 🔴 THIS EXISTS TO INVERT THE FAILURE DIRECTION (Paul, 2026-09-12). The old guard failed the
 * EXPENSIVE way: an unrecognised baseline silently bought another one, every thirty seconds, and
 * nothing said so. Ambiguity STOPS the spend and is reported — a skipped baseline is a message in
 * the operator's error list, which is recoverable; ten duplicate baselines is money already gone.
 *
 * ⛔ NARROWED 2026-09-13 TO THE CASE IT WAS BUILT FOR. A free check is purpose 'free_check' and is
 * IGNORED here: it can never match a baseline, so it is no reason to hold one. What still refuses:
 *   · purpose 'baseline' with no contract — a baseline whose contract write failed;
 *   · a LEGACY multi-run row with no purpose and no contract — could be either, so it still holds.
 * ⚠️ The second bullet costs something real and stated: a prospect whose free check ran BEFORE
 * 2026-09-12 and who pays later is held until somebody looks (one error row per lead per hour, not
 * per tick). A new free check is not.
 */
export function findAmbiguousMultiRun<T extends AuditKindRow>(rows: readonly T[] | null | undefined): T | null {
  return (rows ?? []).find((r) => auditKind(r) === 'multi_run_unmarked') ?? null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FREE-CHECK SENDER'S GATE.

   🔴 FOUND 2026-09-13, BEFORE IT REACHED A CUSTOMER. maybeSendFreeCheckResult was gated on the
   LEAD having a free-check submission row, and process-ai-audit-queue pushes it for every completed
   run of every audit with a lead. So for anyone who had ever filled in the free-check form, their
   paid BASELINE, their FULL MEASURE, their DAY-28 REPLAY and any re-audit an operator ran would each
   have emailed and texted them "Your AI visibility check" with a fresh report link.

   ⛔ THE GATE IS THE AUDIT'S OWN PURPOSE NOW. Only an audit created AS the free check
   (`audit_purpose = 'free_check'`) sends automatically. A baseline, a measurement, a replay and an
   ordinary audit each send NOTHING, and the test drives all five.
   ⚠️ THE OPERATOR RESEND IS THE ONE EXCEPTION, AND IT IS NARROW: a person pressing "resend" on the
   Free checks card for an audit with no recorded purpose (created before 2026-09-13) or an
   ordinary 'audit' one is allowed through, because that is how the two stranded pre-change free
   checks can still be sent by hand. A baseline, measurement or replay is refused even when forced —
   there is no button that should ever send a stranger a paying customer's measurement.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export type FreeCheckSendDecision =
  | { send: true; via: 'free_check' | 'operator_resend' }
  | { send: false; reason: string };

export function freeCheckSendGate(auditPurpose: unknown, opts: { forced?: boolean } = {}): FreeCheckSendDecision {
  const purpose = typeof auditPurpose === 'string' ? auditPurpose.trim().toLowerCase() : '';
  if (purpose === FREE_CHECK_AUDIT_PURPOSE) return { send: true, via: 'free_check' };
  if (opts.forced === true && (purpose === '' || purpose === ORDINARY_AUDIT_PURPOSE)) {
    return { send: true, via: 'operator_resend' };
  }
  return {
    send: false,
    reason: purpose
      ? `audit_purpose is '${purpose}', not '${FREE_CHECK_AUDIT_PURPOSE}' — not a free check`
      : 'audit has no recorded purpose (created before 2026-09-13) — not sent automatically',
  };
}
