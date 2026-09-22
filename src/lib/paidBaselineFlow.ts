/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE OPERATOR'S APPROVE → START CHAIN, as a pure controller.

   🔴 WHY THIS IS NOT INLINE IN THE DIALOG (2026-09-22). The Prepare Baseline dialog ran
   save → approve → run as three awaited server calls and, after EACH one, asked the parent page to
   reload. The parent's reload flipped its page-level `loading` flag, which swapped the whole page
   for a spinner and UNMOUNTED the dialog; on remount the dialog fetched the row again (spinner),
   while the original chain kept running detached from any screen. That is the "loading starts,
   stops, starts again" loop, and it is why a refusal on the run step left the operator looking at
   the frozen questions with no idea what had happened.

   The chain now lives here, with no React in it, so a test can count exactly how many times
   approve and run are called and read exactly what the operator will be told. The dialog calls
   it through a single-flight guard and refreshes the page ONCE, at the end.

   ⚠️ Zero imports beyond the state leaf, so the controller can be exercised under tsx.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { describeStartSkip, normalizePaidBaselineStatus, type PaidBaselineStatus } from './paidBaselineState.ts';

export type FlowBaseline = { status: PaidBaselineStatus | string; questions: string[]; start_note?: string; audit_id?: string } & Record<string, unknown>;
export type FlowInvoke = (action: string, extra?: Record<string, unknown>) => Promise<FlowBaseline>;
export type FlowStep = 'approving' | 'starting';

export type ApproveAndStartResult =
  | { ok: true; baseline: FlowBaseline }
  | { ok: false; step: 'approve' | 'run'; error: string; baseline: FlowBaseline | null };

/**
 * One in-flight operation at a time. `run` returns `undefined` — and never calls `fn` — while a
 * previous call is still awaiting. A double-click, a keyboard repeat and a re-render mid-await all
 * arrive here and all fall through. The guard is a plain object so it survives re-renders in a ref.
 */
export function createSingleFlight() {
  let inFlight = false;
  return {
    busy: () => inFlight,
    async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (inFlight) return undefined;
      inFlight = true;
      try { return await fn(); } finally { inFlight = false; }
    },
  };
}

/**
 * Approve the current question set (the server freezes exactly what it is sent), then ask the
 * server to start. Approve is called once; run is called once; neither is retried here.
 *
 * A run that comes back `approved` with a start_note is a refusal the older server expressed as a
 * skip; it is reported as an error in operator English so nothing reads "approved but waiting".
 */
export async function approveAndStart(
  invoke: FlowInvoke,
  questions: readonly string[],
  onStep?: (step: FlowStep, baseline: FlowBaseline | null) => void,
): Promise<ApproveAndStartResult> {
  let approved: FlowBaseline | null = null;
  onStep?.('approving', null);
  try {
    approved = await invoke('approve', { questions: [...questions] });
  } catch (e) {
    return { ok: false, step: 'approve', error: e instanceof Error ? e.message : String(e), baseline: null };
  }
  return startApproved(invoke, approved, onStep);
}

/** The start step on its own — the "Start baseline" button on an already-approved row. */
export async function startApproved(
  invoke: FlowInvoke,
  approved: FlowBaseline | null,
  onStep?: (step: FlowStep, baseline: FlowBaseline | null) => void,
): Promise<ApproveAndStartResult> {
  onStep?.('starting', approved);
  let started: FlowBaseline;
  try {
    started = await invoke('run');
  } catch (e) {
    return { ok: false, step: 'run', error: e instanceof Error ? e.message : String(e), baseline: approved };
  }
  const status = normalizePaidBaselineStatus(started.status);
  if (status === 'running' || status === 'starting' || status === 'complete') return { ok: true, baseline: started };
  const note = typeof started.start_note === 'string' && started.start_note ? started.start_note : '';
  return {
    ok: false,
    step: 'run',
    error: note ? describeStartSkip(note) : 'The server did not start the baseline and gave no reason.',
    baseline: started,
  };
}
