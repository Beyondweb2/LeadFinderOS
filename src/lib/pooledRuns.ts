/* ════════════════════════════════════════════════════════════════════════════════════════════
   POOLING A MEASUREMENT'S RUNS — one answer from three, not three answers.

   ⛔ WHY. A paid baseline asks the same 12 questions three times, and the results screen showed
   ONE run: "7/24 · 29%", the highest run_number, with the other two invisible. Paul, 2026-09-10:
   *"if it's 3 runs on an audit it should show me final result from them 3 runs not each
   individual one."* He is right, and it is the same model the before/after comparison has always
   used (CLAUDE.md §17: the fold pools every selected run rather than reading one per side) — the
   headline just never caught up with it.

   ⛔ THE UNIT IS THE ANSWER CELL: one question × one engine × one run. Three runs of 12 questions
   on 2 scored engines is 72 cells, not 24. Averaging the three runs' percentages instead would
   weight a run that failed half its questions exactly as heavily as a complete one.

   ⛔ A QUESTION IS IDENTIFIED BY ITS TEXT, VERBATIM. Re-measures reuse the previous run's set, so
   the strings are byte-identical by construction — but a REWORDED question is a different
   question and must not silently merge with the one it replaced (the same rule the measurement
   lock enforces, CLAUDE.md §17). No trimming, no case folding, no normalisation.

   ⚠️ ONLY `done` ROWS WITH A RESULT COUNT TOWARDS A DENOMINATOR. A question that failed or was
   dropped as a straggler contributes nothing rather than counting as "not named" — treating a
   question we never got an answer to as evidence of absence is the absent-value fault (CLAUDE.md
   §6) pointed at the number the guarantee is measured on.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import type { EngineMap } from '@/lib/auditReport';
import { cellNamed } from '@/lib/namedSignal';

/** A queue row plus which run it came from. */
export interface PooledInput {
  runId: string;
  /** run_number, for ordering and for saying "2 of 3". */
  runNumber: number;
  question: string;
  status: string;
  result: EngineMap | null;
}

export interface EngineTally {
  /** Cells where the engine named the business. */
  named: number;
  /** Cells the engine actually answered. Never assumed — a run that did not answer is absent. */
  answered: number;
}

export interface PooledQuestion {
  question: string;
  /** How many runs produced an answer for this question, whatever the engine. */
  runsAnswered: number;
  /** Per engine across every pooled run. */
  perEngine: Record<string, EngineTally>;
  /** Cells named / cells answered, over the scored engines only. */
  named: number;
  total: number;
  /** First appearance order in the input, so "as asked" survives (CLAUDE.md §17). */
  order: number;
}

export interface PooledTally {
  questions: PooledQuestion[];
  /** Distinct runs represented in the input. */
  runs: number;
  /** Scored cells named / answered across everything. */
  named: number;
  total: number;
  /** Rows that failed or never settled — reported, never folded into the denominator. */
  unanswered: number;
}

/**
 * Fold many runs' queue rows into one result per question, plus an overall tally.
 *
 * `scoredEngines` is the set the headline percentage is computed over (chatgpt + gemini today);
 * `displayEngines` is the wider set kept per question for the breakdown. Passing them in rather
 * than importing keeps this module free of display concerns and testable on its own.
 */
export function poolRuns(
  rows: PooledInput[],
  scoredEngines: readonly string[],
  displayEngines: readonly string[],
): PooledTally {
  const byQuestion = new Map<string, PooledQuestion>();
  const runIds = new Set<string>();
  let unanswered = 0;

  for (const row of rows) {
    runIds.add(row.runId);

    let q = byQuestion.get(row.question);
    if (!q) {
      q = {
        question: row.question,
        runsAnswered: 0,
        perEngine: Object.fromEntries(displayEngines.map((e) => [e, { named: 0, answered: 0 }])),
        named: 0,
        total: 0,
        order: byQuestion.size,
      };
      byQuestion.set(row.question, q);
    }

    /* Not done, or done with nothing stored, is NOT a zero — it is an absence. It is counted
       separately so the screen can say "3 questions never answered" rather than quietly
       depressing the percentage. */
    if (row.status !== 'done' || !row.result) { unanswered++; continue; }

    q.runsAnswered++;
    for (const engine of displayEngines) {
      const er = row.result[engine];
      if (!er) continue;               // this engine produced nothing for this question
      const tally = q.perEngine[engine];
      tally.answered++;
      if (cellNamed(er)) tally.named++;
    }
  }

  let named = 0;
  let total = 0;
  for (const q of byQuestion.values()) {
    /* The question's own headline figures are over the SCORED engines only, matching what the
       tile says. The display engines are still tallied above for the breakdown. */
    let qn = 0; let qt = 0;
    for (const engine of scoredEngines) {
      const t = q.perEngine[engine];
      if (!t) continue;
      qn += t.named; qt += t.answered;
    }
    q.named = qn; q.total = qt;
    named += qn; total += qt;
  }

  return {
    questions: [...byQuestion.values()].sort((a, b) => a.order - b.order),
    runs: runIds.size,
    named,
    total,
    unanswered,
  };
}

/** "2 of 3" for one engine on one question, or a dash when it never answered. */
export function engineSummary(t: EngineTally | undefined): string {
  if (!t || t.answered === 0) return '—';
  return `${t.named}/${t.answered}`;
}
