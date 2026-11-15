/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A RUNNING AUDIT'S PROGRESS, FOR THE WHOLE AUDIT (Paul, 2026-11-15).

   The Past audits row used to show only the run in flight: a 3-run audit on its second run read
   "20 of 40 searches · 50%", which looks half done when it is really run 2 of 3. Now:
       "Run 2 of 3 · 20 of 40 searches"   and the % / bar = whole audit (60 of 120 answered = 50%).

   ⛔ NO SECOND COUNT. Runs done and the run target come from measuringState — the same predicate the
   report, the sender and the audit page use for "still measuring, X of Y runs". The searches inside a
   run come from the run's own done/total, filled by fetchQueueCounts (the audit page's ONE count of
   settled queue rows). Every run of an audit asks the same questions, so a finished run counts as a
   full run's worth of searches.
   ⚠️ Pure, no React — tested by scripts/audit-running-progress.test.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { measuringState } from './measuringState.ts';

export interface ProgressRun {
  status: string | null | undefined;
  created_at: string | null | undefined;
  /** Settled queue rows for this run (only filled while it is in flight). */
  done: number;
  /** All queue rows for this run (0 = not readable yet). */
  total: number;
}

export interface WholeAuditProgress {
  /** "Run 2 of 3 · 20 of 40 searches" — or "Queued" before any search is readable. */
  label: string;
  /** Whole-audit percent, 0–100, for the % and the bar. null while queued. */
  pct: number | null;
  /** Whole-audit searches answered / planned (e.g. 60 of 120). */
  doneAll: number;
  totalAll: number;
}

const isLive = (s: string | null | undefined) => s === 'pending' || s === 'running';

/** null when nothing is in flight (the row shows its normal result instead). */
export function wholeAuditProgress(
  runs: ReadonlyArray<ProgressRun>,
  targetRuns: unknown,
): WholeAuditProgress | null {
  const live = runs.filter((r) => isLive(r.status));
  if (!live.length) return null;
  const perRun = Math.max(0, ...live.map((r) => r.total));
  if (perRun <= 0) return { label: 'Queued', pct: null, doneAll: 0, totalAll: 0 };

  const st = measuringState(runs, targetRuns);
  // The target can never be below the runs actually seen (finished + in flight).
  const runsTarget = Math.max(st.runsTarget, st.runsDone + live.length);
  const liveDone = live.reduce((n, r) => n + r.done, 0);
  const liveTotal = live.reduce((n, r) => n + r.total, 0);
  const doneAll = st.runsDone * perRun + liveDone;
  const totalAll = runsTarget * perRun;
  const pct = Math.min(100, Math.round((100 * doneAll) / totalAll));

  const first = st.runsDone + 1;
  const last = st.runsDone + live.length;
  const runPart = runsTarget <= 1 ? '' : first === last ? `Run ${first} of ${runsTarget} · ` : `Runs ${first}–${last} of ${runsTarget} · `;
  return { label: `${runPart}${liveDone} of ${liveTotal} searches`, pct, doneAll, totalAll };
}
