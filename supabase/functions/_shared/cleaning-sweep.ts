/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHEN THE STUCK-CLEANING SWEEP RUNS (2026-09-27, Paul approved "every 2 minutes").

   process-ai-audit-queue's cron fires every 30 s. Its `retryStuckCleanings` sweep only touches runs
   ALREADY released as `complete` (the report is live) whose competitor-cleaning stamp is still
   incomplete, and re-invokes extract-competitors for at most a few of them. Its query filters every
   complete run of the last 7 days on results->competitor_cleaning (~345 ms, 1.15% of a core at
   every-tick). On 2026-09-27 it matched 1 run of 158.

   ⛔ WHAT THIS DOES NOT GATE: starting, polling and finalising questions, the finaliser's own
   hold-and-retry of a run's cleaning (which is what decides when a run is RELEASED), the SEO step,
   baseline advancement, remeasures. All of those still run every tick. The only effect is that a
   retry for an already-released run can start up to two minutes later; each run is also held to
   RETRY_CLEAN_SPACING_MS (4 minutes) between retries anyway.

   No stored state: the cron fired at ~:04.5 and ~:34.5 each minute (read from cron.job_run_details
   2026-09-27), so exactly one tick falls 15–45 s into each two-minute cycle, ~10 s from either edge.
   A tick that ever drifts out of the window simply waits one cycle.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export const CLEANING_SWEEP_EVERY_MS = 2 * 60_000;
export const CLEANING_SWEEP_WINDOW_MS: readonly [number, number] = [15_000, 45_000];

export function cleaningSweepDue(nowMs: number): boolean {
  const phase = ((nowMs % CLEANING_SWEEP_EVERY_MS) + CLEANING_SWEEP_EVERY_MS) % CLEANING_SWEEP_EVERY_MS;
  return phase >= CLEANING_SWEEP_WINDOW_MS[0] && phase < CLEANING_SWEEP_WINDOW_MS[1];
}
