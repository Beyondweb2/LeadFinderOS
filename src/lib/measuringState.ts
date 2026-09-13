/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS AUDIT STILL MEASURING? — one answer for the report, the sender and the operator's buttons.

   🔴 THE INCIDENT (2026-09-13). AD Locksmithing's free check, opened twenty minutes apart:
       11:40 PDF   "4 out of 12 answers"   3 ways × 2 engines × 2 asks
       11:44 live  "5 out of 18 answers"   3 ways × 2 engines × 3 asks
   Run 3 was still going. The renderer counts whatever queue rows have answers, so the denominator
   grows run by run and nothing on the page says so. A prospect who opens their link early sees a
   lower number, and on a second visit it has changed with nothing to explain why.

   ⛔ A NUMBER THAT WILL CHANGE MUST NOT APPEAR AT ALL (Paul). While a run is genuinely in flight the
   report withholds the headline and says plainly that it is still measuring and how many runs are
   done; the edge function serves it with no caching; the operator's PDF button is disabled.

   ⛔ ONE PREDICATE, THREE READERS, so they cannot disagree: render-audit-report (the live page),
   free-check-result (which decides when to email), and the AI Audit page (preview + PDF).
   The stall rule is the same everywhere: a run that has sat pending/running for longer than
   MEASURING_STALL_MS is treated as abandoned. The sender already released the email on that rule
   (its FREE_CHECK_RESULT_MAX_WAIT_MS); the report now reads the same constant, so the email and the
   page it links to agree about whether the measurement is finished — the 45-minute release used to
   be the one path where they could not.

   ⚠️ SETTLED IS A POSITIVE LIST. Measured over 847 live runs the statuses are complete / failed /
   cancelled / capped, plus the transient pending / running. Anything unrecognised counts as still
   in flight: showing a number early on a state we could not identify is the failure this exists to
   prevent, and waiting is recoverable.
   ⚠️ Deno-free on purpose: both edge functions and the SPA import it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** A run stuck pending/running for longer than this is treated as abandoned by every reader. */
export const MEASURING_STALL_MS = 45 * 60 * 1000;

export const SETTLED_RUN_STATUSES: ReadonlySet<string> = new Set(["complete", "failed", "cancelled", "capped"]);

export interface RunStateLite {
  status: string | null | undefined;
  created_at: string | null | undefined;
}

export interface MeasuringState {
  /** True while a run is genuinely in flight (not stalled). The report withholds its numbers. */
  measuring: boolean;
  /** Runs with status `complete`. */
  runsDone: number;
  /** The audit's intended run count (baseline_target_runs), floored at 1. */
  runsTarget: number;
  /** Runs neither settled nor stalled. */
  inFlight: number;
  /** True when an in-flight run has exceeded MEASURING_STALL_MS — treated as abandoned. */
  stalled: boolean;
}

export function measuringState(
  runs: ReadonlyArray<RunStateLite> | null | undefined,
  target: unknown,
  nowMs: number = Date.now(),
): MeasuringState {
  const list = runs ?? [];
  const n = Number(target ?? 1);
  const runsTarget = Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
  const runsDone = list.filter((r) => String(r.status) === "complete").length;
  const openRuns = list.filter((r) => !SETTLED_RUN_STATUSES.has(String(r.status ?? "")));
  /* Age of the OLDEST open run. An unreadable created_at reads as age 0 — "not stalled", so the
     report keeps waiting rather than declaring a run abandoned on a date it could not parse. */
  const ages = openRuns.map((r) => {
    const t = Date.parse(String(r.created_at ?? ""));
    return Number.isFinite(t) ? nowMs - t : 0;
  });
  const oldest = ages.length ? Math.max(...ages) : 0;
  const stalled = openRuns.length > 0 && oldest > MEASURING_STALL_MS;
  return {
    measuring: openRuns.length > 0 && !stalled,
    runsDone,
    runsTarget,
    inFlight: stalled ? 0 : openRuns.length,
    stalled,
  };
}
