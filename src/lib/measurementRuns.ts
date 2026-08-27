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

/** The server's rule, restated once: a measurement asks each question MEASUREMENT_RUNS times; an
 *  ordinary re-audit asks it once. Mirrors create-ai-audit's
 *  `isMeasurement ? MEASUREMENT_RUNS : …` branch. */
export function runsForReAudit(isMeasurement: boolean): number {
  return isMeasurement ? MEASUREMENT_RUNS : 1;
}

/** Is this source audit a measurement? The SAME test reAuditFromSource applies server-side
 *  (is_measurement === true OR baseline_target_runs > 1 — a paid baseline counts even though
 *  is_measurement is false on it), so the price shown matches the path that will run. */
export function isMeasurementSource(
  src: { is_measurement?: boolean | null; baseline_target_runs?: number | null } | null | undefined,
): boolean {
  if (!src) return false;
  return src.is_measurement === true || Number(src.baseline_target_runs ?? 0) > 1;
}
