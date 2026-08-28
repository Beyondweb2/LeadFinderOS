/* ════════════════════════════════════════════════════════════════════════════════════════════
   MEASUREMENT RUNS — how many times a Full Measurement / measurement re-audit asks EACH question.

   ⛔ WHY THIS IS ITS OWN ZERO-DEPENDENCY LEAF (the marketAuditThreshold.ts pattern): the run count
   is decided by the SERVER (create-ai-audit), but the re-audit screen has to PRICE the run before
   it happens. Those were two numbers, and they drifted: the panel said "× 1 run" and multiplied the
   cost by 1 while the server ran 3 — understating a 47-question Solene re-audit as ~47p when the
   real spend is ~£1.17. The rule now lives here once, so the display is derived from the same rule
   rather than restating it.

   ⚠️ create-ai-audit holds the AUTHORITATIVE copy (its own constant of the same name) and cannot import
   this file today only because it would mean redeploying the audit engine — including the paying
   client's guarantee path — for a display fix. `scripts/check-measurement-runs.mjs` fails the build
   if the two ever disagree, so the drift cannot come back silently. If create-ai-audit is being
   deployed anyway for another reason, switch it to import this leaf (relative path + .ts extension)
   and delete its local const.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Runs per question on the measurement path. MUST equal create-ai-audit's MEASUREMENT_RUNS. */
export const MEASUREMENT_RUNS = 3;

/* ⚠️ `runsForReAudit(isMeasurement: boolean)` lived here until 2026-08-28 and was DELETED, not
   kept "just in case": it derived the run count from what the SOURCE audit was, and the Re-audit
   dialog now derives it from what the OPERATOR PICKED. Leaving both would have left a second
   pricing rule one autocomplete away from a screen that quotes one number while
   reAuditFromSource writes another — the exact fault this leaf exists to prevent. Use
   runsForReAuditMode below. `isMeasurementSource` survives because a separate question is still
   worth asking: what was the source, so a downgrade can be warned about. */

/** Is this source audit a measurement? The SAME test reAuditFromSource applies server-side
 *  (is_measurement === true OR baseline_target_runs > 1 — a paid baseline counts even though
 *  is_measurement is false on it), so the price shown matches the path that will run. */
export function isMeasurementSource(
  src: { is_measurement?: boolean | null; baseline_target_runs?: number | null } | null | undefined,
): boolean {
  if (!src) return false;
  return src.is_measurement === true || Number(src.baseline_target_runs ?? 0) > 1;
}

/** What the Re-audit dialog offers: a single-run quick check, or the 3-run measurement. */
export type ReAuditMode = 'quick' | 'measurement';

/**
 * Runs a re-audit will ACTUALLY make, from the operator's chosen mode plus the source audit's own
 * repeat target.
 *
 * ⛔ ONE FUNCTION, CALLED BY BOTH THE PRICE AND THE ACTION. The cost line and reAuditFromSource
 * must never disagree — a screen saying "× 1 run" while the server ran 3 is the exact fault that
 * mispriced a 47-question Solene re-audit at ~47p against a real ~£1.17 (fixed 2026-08-28). The
 * dialog prices with this; reAuditFromSource writes `baseline_target_runs` from this.
 *
 * ⚠️ A MEASUREMENT SOURCE KEEPS ITS OWN TARGET. Upgrading a quick source gives it MEASUREMENT_RUNS,
 * but a source that already repeats N times re-measures N times — so a hypothetical 5-run paid
 * baseline is not silently downgraded to 3, and the price still matches, because the price is
 * computed from this same number. In practice every real source is 3 (BASELINE_RUNS === 3).
 */
export function runsForReAuditMode(mode: ReAuditMode, sourceTargetRuns: number | null | undefined): number {
  if (mode !== 'measurement') return 1;
  const target = Number(sourceTargetRuns ?? 0);
  return target > 1 ? target : MEASUREMENT_RUNS;
}

/** The mode a source audit implies, so the dialog opens on today's behaviour unless changed. */
export function defaultReAuditMode(
  src: { is_measurement?: boolean | null; baseline_target_runs?: number | null } | null | undefined,
): ReAuditMode {
  return isMeasurementSource(src) ? 'measurement' : 'quick';
}
