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

/* ⛔ `runsForReAuditMode`, `defaultReAuditMode` and `isMeasurementSource` lived here until
   2026-09-12 and were DELETED with the re-audit dialog's "measurement" mode. A re-audit is a
   one-run quick diagnostic now; the only multi-run re-measure is the queue-fired day-28 replay of
   outreach_leads.baseline_audit_id, whose run count is create-ai-audit's own. This leaf keeps
   MEASUREMENT_RUNS solely so scripts/check-measurement-runs.mjs can pin the server's constant. */
