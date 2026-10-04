/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MEASUREMENT HEALTH — is a guarantee measurement complete, partial, capped or failed, and what does
   Paul do about it? (2026-10-04, fix/04-ai-measurement; Session C C-11, master plan M-027.)

   🔴 WHY. A run was `complete` unless EVERY question failed, a `capped` run counted as a baseline run,
   and a chain that gave up wrote its reason only into a run's JSON. So a baseline that lost half its
   answers to Apify's monthly cap (317 runs failed on 3 Sep, every one "HTTP 402") froze as if whole —
   or sat on "Baseline running" for ever — and Paid Clients never listed it under Needs attention.

   ⛔ THE COMPLETION RULE: a guarantee measurement is COMPLETE only when every expected answer cell is
   answered — questions × runs × engines (20 × 3 × 2 = 120). Anything less is named for what it is:
     running           — work is still in flight (or about to freeze);
     complete          — every expected cell answered;
     partial           — cells missing that a retry cannot recover (an engine returned no block), or a
                         frozen measurement short of its expected cells (accepted by Paul, or legacy);
     capped            — cells missing because a budget or Apify's own cap refused them: retryable once
                         the cap has room;
     failed_retryable  — cells missing because the provider failed: retry the missing cells only;
     failed_permanent  — nothing can be retried (no question set to repeat, the chain cannot extend).
   ⛔ MISSING IS NEVER FABRICATED. A missing cell is reported, never filled, never counted as "not
   named" — the denominator is the answered cells, exactly as before.

   Pure. Edge-reachable (_shared/audit-baseline.ts, paid-baseline): relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The engines a guarantee answer cell is counted on (mirrors audit-baseline SCORED_ENGINES). */
export const HEALTH_ENGINES = ['chatgpt', 'gemini'] as const;

export type MeasurementState = 'running' | 'complete' | 'partial' | 'capped' | 'failed_retryable' | 'failed_permanent';
export type MissingReason = 'capped' | 'provider_failed' | 'engine_no_answer' | 'not_started' | 'in_flight';

export interface HealthRun { id: string; run_number: number | null; status: string | null }
export interface HealthRow { id?: string | number; run_id: string; question: string | null; status: string | null; result: Record<string, unknown> | null }

export interface MissingCell { run_id: string | null; run_number: number | null; question: string | null; engine: string; reason: MissingReason }

export interface MeasurementHealth {
  state: MeasurementState;
  expectedCells: number;
  answeredCells: number;
  missing: MissingCell[];
  /** Queue row ids a retry may re-ask: FAILED rows only (they hold no answer, so nothing can be doubled). */
  retryableRowIds: Array<string | number>;
  /** The runs the measurement counts (the first `targetRuns`, by run number, not cancelled). */
  countedRunIds: string[];
  /** One plain sentence: "118 of 120 answers — 2 missing (Apify cap)". */
  label: string;
  /** What Paul does, or null when nothing is owed. */
  action: string | null;
}

/** A failed row's reason, from the error the queue wrote. Positive matches; anything else = provider. */
export function failureReason(result: unknown): MissingReason {
  const err = String((result && typeof result === 'object' ? (result as { error?: unknown }).error : '') ?? '').toLowerCase();
  if (err === 'daily_cap' || err === 'cost_cap' || err === 'apify_reserve') return 'capped';
  if (/\b(402|403)\b|usage limit|monthly|quota|insufficient/.test(err)) return 'capped';
  return 'provider_failed';
}

const REASON_WORDS: Record<MissingReason, string> = {
  capped: 'a budget or Apify cap refused them',
  provider_failed: 'the AI provider failed',
  engine_no_answer: 'an engine returned no answer',
  not_started: 'runs not started',
  in_flight: 'still being measured',
};

export function measurementHealth(i: {
  runs: HealthRun[];
  rows: HealthRow[];
  targetRuns: number;
  /** The frozen question count (run 1's asked set). Absent = read from run 1's rows. */
  questions?: number;
  /** ai_audits.baseline_completed_at — the measurement has frozen. */
  frozen: boolean;
  /** The chain cannot extend (no question set to repeat) — nothing a retry can do. */
  permanentError?: string | null;
}): MeasurementHealth {
  const target = Math.max(1, Math.floor(Number(i.targetRuns) || 1));
  const runs = [...i.runs].filter((r) => r.status !== 'cancelled')
    .sort((a, b) => Number(a.run_number ?? 0) - Number(b.run_number ?? 0));
  const counted = runs.slice(0, target);
  const countedIds = new Set(counted.map((r) => r.id));
  const first = counted[0];
  const firstQs = first ? [...new Set(i.rows.filter((r) => r.run_id === first.id).map((r) => (r.question ?? '').trim()).filter(Boolean))] : [];
  const nQ = Math.max(0, Math.floor(Number(i.questions ?? firstQs.length) || 0));
  const expected = nQ * target * HEALTH_ENGINES.length;
  const missing: MissingCell[] = [];
  const retryable: Array<string | number> = [];
  let answered = 0;
  for (const r of i.rows) {
    if (!countedIds.has(r.run_id)) continue;
    const runNo = counted.find((c) => c.id === r.run_id)?.run_number ?? null;
    if (r.status === 'done' && r.result && typeof r.result === 'object') {
      for (const e of HEALTH_ENGINES) {
        if ((r.result as Record<string, unknown>)[e]) answered++;
        else missing.push({ run_id: r.run_id, run_number: runNo, question: r.question, engine: e, reason: 'engine_no_answer' });
      }
    } else if (r.status === 'failed') {
      const reason = failureReason(r.result);
      for (const e of HEALTH_ENGINES) missing.push({ run_id: r.run_id, run_number: runNo, question: r.question, engine: e, reason });
      if (r.id !== undefined) retryable.push(r.id);
    } else {
      for (const e of HEALTH_ENGINES) missing.push({ run_id: r.run_id, run_number: runNo, question: r.question, engine: e, reason: 'in_flight' });
    }
  }
  /* Runs that do not exist yet: their cells are missing as "not started", never as failed. */
  const absentRuns = Math.max(0, target - counted.length);
  for (let k = 0; k < absentRuns * nQ; k++) for (const e of HEALTH_ENGINES) missing.push({ run_id: null, run_number: null, question: null, engine: e, reason: 'not_started' });

  const short = Math.max(0, expected - answered);
  const count = (reason: MissingReason) => missing.filter((m) => m.reason === reason).length;
  const inFlight = count('in_flight') > 0 || counted.some((r) => r.status === 'pending' || r.status === 'running' || r.status === 'processing');
  const why = (Object.keys(REASON_WORDS) as MissingReason[]).filter((r) => count(r) > 0 && r !== 'in_flight' && r !== 'not_started')
    .map((r) => `${count(r)} because ${REASON_WORDS[r]}`).join('; ');
  const of = `${answered} of ${expected} answers`;

  let state: MeasurementState;
  let action: string | null = null;
  if (i.permanentError) {
    state = 'failed_permanent';
    action = `Stopped and cannot be retried: ${i.permanentError}. Check the client's baseline record.`;
  } else if (i.frozen) {
    state = short === 0 ? 'complete' : 'partial';
  } else if (inFlight || (absentRuns > 0 && retryable.length === 0)) {
    state = 'running';
  } else if (short === 0) {
    state = 'running';          // every cell answered — the freeze is due on the next tick
  } else if (retryable.length > 0) {
    const allCaps = missing.filter((m) => m.reason !== 'engine_no_answer' && m.reason !== 'not_started').every((m) => m.reason === 'capped');
    state = allCaps ? 'capped' : 'failed_retryable';
    action = allCaps
      ? 'A budget or Apify cap refused some answers. Press "Retry missing answers" once the cap has room — only the missing ones are re-asked.'
      : 'The AI provider failed on some answers. Press "Retry missing answers" — only the missing ones are re-asked.';
  } else {
    state = 'partial';
    action = 'Some answers cannot be re-asked (an engine returned nothing). Accept the measurement as partial — with a reason — or ask for help.';
  }
  const label = state === 'complete' ? `${of} — complete`
    : state === 'running' ? `${of} so far — measuring`
    : `${of} — ${short} missing${why ? ` (${why})` : ''}`;
  return { state, expectedCells: expected, answeredCells: answered, missing, retryableRowIds: retryable, countedRunIds: counted.map((r) => r.id), label, action };
}

/** States that need Paul (Needs attention). */
export const needsAttention = (s: MeasurementState) => s === 'partial' || s === 'capped' || s === 'failed_retryable' || s === 'failed_permanent';
