/* ════════════════════════════════════════════════════════════════════════════════════════════════
   REPLAYING THE BASELINE — which audit, which questions, and when to refuse.

   🔴 THE GAP THIS CLOSES: NOTHING IDENTIFIED *THE* BASELINE. `baseline_contract` is written to every
   audit startPaidBaseline creates, so the 2026-09-12 loop produced ten audits and ten contracts,
   and none of them was authoritative. ABLM is the same gap on a real client: 28 runs, 10 question
   sets, and a 21 Jul vs 28 Aug pair that compares ZERO questions.

   ⛔ THE POINTER IS THE ANSWER, AND ITS ABSENCE IS AN ANSWER TOO. `outreach_leads.baseline_audit_id`
   names one audit. No pointer → `no_baseline_recorded`, and the re-measure REFUSES. A guessed
   baseline is worse than none: it would silently compare against a set nobody chose, and the refund
   turns on that comparison.

   ⛔ AND THE REPLAY READS THE ASKED SET, NOT THE INTENDED ONE — which means reading the QUEUE, not
   the contract. Checked when this was built: the contract stores `seededQuestions` (what was
   INTENDED to be carried over) and, for outcome clients only, `scoredQuestions` (the intersection
   with what was queued). **There is no field holding the full asked set**, so replaying "the
   contract's questions" would replay an intention for one class of client and nothing at all for
   the other. The queue rows of the baseline's FIRST run are the ground truth: they are, by
   definition, exactly what was asked.
   ⚠️ That also makes the four legitimate cases identical BY CONSTRUCTION rather than by exception —
   a town dropped by the allocation ceiling and a question rejected by the intent guards were never
   queued, so they are not in the asked set and cannot read as a mismatch.

   ⚠️ WHEN ASKED < INTENDED, SAY SO. The comparison reports "replaying N of M" rather than quietly
   presenting a short set as the whole measurement. A baseline that intended 12 and asked 9 is a
   valid yardstick for those 9 and must not be described as anything else.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/* ⛔ EXPLICIT .ts, BECAUSE THIS FILE IS REACHABLE FROM AN EDGE FUNCTION. The Supabase bundler
   refuses a bare relative specifier — `Module not found … Maybe add a '.ts' extension` — and it
   refuses it at DEPLOY time, which is the only gate that sees it: tsc, vite and the test runner
   all resolve the extensionless form happily. This exact deploy failed once (2026-09-12);
   §4 already records the rule and it still cost a round trip. Vite resolves the .ts form too,
   so writing it this way costs the SPA nothing. */
import { dedupeQuestions } from './seedGuard.ts';

/** Why a replay cannot proceed. Every one of these is a REFUSAL, never a fallback. */
export type ReplayRefusal =
  /** The lead has no `baseline_audit_id`. The honest state for every pre-pointer client. */
  | 'no_baseline_recorded'
  /** The pointer names an audit that no longer exists (deleted duplicates, for instance). */
  | 'baseline_audit_missing'
  /** The pointed-at audit has no queued questions — nothing to replay. */
  | 'baseline_has_no_questions';

export interface ReplayPlan {
  ok: true;
  /** The asked set, verbatim and deduped, in the order it was queued. */
  questions: string[];
  /** How many were actually asked. */
  asked: number;
  /** How many the baseline INTENDED to ask, when the contract records it. Null = not recorded. */
  intended: number | null;
  /** True when the baseline asked fewer than it intended — the "N of M" case. */
  short: boolean;
  /** One line for the screen and the export header. Always states the numbers. */
  summary: string;
  baselineAuditId: string;
}

export interface ReplayRefused {
  ok: false;
  reason: ReplayRefusal;
  summary: string;
}

/** Only what this reasons about. A narrow shape so an unrelated column cannot start mattering. */
export interface BaselineSource {
  /** `outreach_leads.baseline_audit_id`. */
  pointer?: string | null;
  /** Whether the pointed-at audit row was found. */
  auditExists?: boolean;
  /** The questions on the baseline audit's FIRST run, in queue order. Ground truth. */
  askedQuestions?: readonly string[] | null;
  /** The stored contract, read ONLY for the intended count. Never for the questions. */
  contract?: unknown;
}

/** The one ordered normalisation used for baseline repeats and the later remeasure. */
export function orderedFrozenQuestions(value: readonly string[] | null | undefined): string[] {
  return dedupeQuestions([...(value ?? [])].map((question) => String(question ?? '').trim()).filter(Boolean)).questions;
}

/**
 * How many questions did the baseline INTEND to ask?
 *
 * ⚠️ FROM THE ALLOCATION, WHICH IS THE ONLY RECORDED INTENT. `allocation` sums to the multi-area
 * total; a single-town baseline has no allocation and the contract does not record its target, so
 * this returns null and the caller says "not recorded" rather than inventing BASELINE_QUESTIONS.
 * Absence is not a number.
 */
export function intendedCount(contract: unknown): number | null {
  const c = contract as { allocation?: unknown } | null | undefined;
  if (!c || typeof c !== 'object') return null;
  const alloc = c.allocation;
  if (!Array.isArray(alloc) || alloc.length === 0) return null;
  let total = 0;
  for (const a of alloc) {
    const n = Number((a as { questions?: unknown })?.questions ?? 0);
    if (!Number.isFinite(n) || n <= 0) return null;   // a malformed allocation is not a count
    total += n;
  }
  return total > 0 ? total : null;
}

/**
 * Decide what a re-measure should ask, or refuse.
 *
 * ⛔ IT NEVER FALLS BACK TO GENERATION. The whole point of the pointer is that "the same questions"
 * is mechanical rather than trusted; a replay that quietly generated a fresh set when it could not
 * find the baseline would reproduce the drift it exists to stop, while looking like it worked.
 */
export function planReplay(src: BaselineSource): ReplayPlan | ReplayRefused {
  const pointer = (src.pointer ?? '').trim();
  if (!pointer) {
    return {
      ok: false,
      reason: 'no_baseline_recorded',
      summary: 'No baseline is recorded for this client, so there is nothing to re-measure against. '
        + 'Set the baseline pointer to the audit that should be the before side, or run a new baseline.',
    };
  }
  if (src.auditExists === false) {
    return {
      ok: false,
      reason: 'baseline_audit_missing',
      summary: `The recorded baseline audit (${pointer}) no longer exists. `
        + 'Point the client at a baseline that does, or run a new one.',
    };
  }
  /* Deduped exactly as the audit queue dedupes, so a replay cannot carry two casings of one
     question into a comparison that joins on the text. */
  const asked = orderedFrozenQuestions(src.askedQuestions);
  if (asked.length === 0) {
    return {
      ok: false,
      reason: 'baseline_has_no_questions',
      summary: `The recorded baseline audit (${pointer}) has no questions on its first run, `
        + 'so there is nothing to replay.',
    };
  }
  const intended = intendedCount(src.contract);
  const n = asked.length;
  const short = intended !== null && n < intended;
  /* ⚠️ THE SHORT CASE IS STATED, NEVER SMOOTHED. A baseline that intended 12 and asked 9 is a valid
     yardstick for those 9 — and describing it as the whole measurement is how a partial before/after
     gets read as complete. */
  const summary = short
    ? `Replaying ${n} of ${intended} questions from the recorded baseline — `
      + `${intended - n} were intended but never asked, so they have no before side.`
    : intended === null
      ? `Replaying all ${n} questions from the recorded baseline (the intended count is not recorded).`
      : `Replaying all ${n} questions from the recorded baseline.`;
  return { ok: true, questions: asked, asked: n, intended, short, summary, baselineAuditId: pointer };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REFUSAL, SERVER-SIDE.

   🔴 THE LOCK CHECK USED TO LIVE IN THE SPA ONLY (`AiAudit.tsx`: "Warn, never block"), which is a UI
   preference rather than a guarantee — the queue backstop, the Stripe webhook and any other caller
   of create-ai-audit bypassed it entirely. §4's rule: ask not whether the guard is correct, but
   whether the case it guards can reach it.

   ⛔ FOUR THINGS LEGITIMATELY GET THROUGH, AND THREE OF THEM ARE NOT MISMATCHES AT ALL once the
   diff is taken against the ASKED set:
     · a town dropped by the allocation ceiling  → never queued, so never in the asked set
     · a question rejected by the intent guards  → likewise
     · a Quick 1-run re-audit                    → ALLOWED; it is a diagnostic, not a measurement.
       It is refused a PLACE IN THE BEFORE/AFTER, not refused execution. Blocking it would remove a
       cheap look at a client for no safety gain.
     · a deliberately changed town               → requires a new baseline cycle.
   Any multi-run re-measure whose text or ordering differs is refused.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type RemeasureVerdict =
  /** Same questions as the baseline: a like-for-like re-measurement. */
  | { allow: true; countsAsMeasurement: true; reason: 'matches_baseline'; detail: string }
  /** Runs, but must not be compared: a single-run diagnostic. */
  | { allow: true; countsAsMeasurement: false; reason: 'quick_diagnostic'; detail: string }
  /** Refused. */
  | { allow: false; reason: 'questions_differ_from_baseline' | 'no_baseline_recorded'; detail: string };

export interface RemeasureRequest {
  /** The questions this audit is about to ask. */
  proposed: readonly string[];
  /** The baseline's asked set, from planReplay. Null when there is no usable baseline. */
  baselineAsked: readonly string[] | null;
  /** How many runs this audit will do. 1 = a Quick diagnostic. */
  targetRuns: number;
  /** Retained for older callers; it cannot override the exact replay contract. */
  overrideReason?: string | null;
}

export function judgeRemeasure(req: RemeasureRequest): RemeasureVerdict {
  /* ⛔ THE QUICK DIAGNOSTIC IS DECIDED FIRST, AND IT IS ALLOWED WHATEVER IT ASKS. A single run
     cannot support a per-question claim (MIN_CELLS_FOR_QUESTION_CLAIM = 4 over two engines), so
     there is nothing for a question mismatch to damage. Refusing to COUNT it is the guard; refusing
     to RUN it would just remove a cheap look. */
  if (Number(req.targetRuns ?? 0) <= 1) {
    return {
      allow: true, countsAsMeasurement: false, reason: 'quick_diagnostic',
      detail: 'Single-run diagnostic: it runs, and it is excluded from the before/after because one '
        + 'run cannot support a per-question claim.',
    };
  }
  const baseline = req.baselineAsked;
  if (!baseline || baseline.length === 0) {
    return {
      allow: false, reason: 'no_baseline_recorded',
      detail: 'No baseline is recorded for this client, so a multi-run re-measurement has nothing to '
        + 'be like-for-like with. Record the baseline pointer first.',
    };
  }
  const proposed = [...req.proposed];
  const firstMismatch = baseline.findIndex((question, index) => proposed[index] !== question);
  if (baseline.length === proposed.length && firstMismatch === -1) {
    return {
      allow: true, countsAsMeasurement: true, reason: 'matches_baseline',
      detail: `Like-for-like: all ${baseline.length} baseline questions in the original order, with exact text.`,
    };
  }
  const position = firstMismatch >= 0 ? firstMismatch + 1 : Math.min(baseline.length, proposed.length) + 1;
  return {
    allow: false, reason: 'questions_differ_from_baseline',
    detail: `Refused: the remeasure must replay the exact ordered baseline array. `
      + `Expected ${baseline.length} question(s), received ${proposed.length}; first difference is at position ${position}. `
      + `A changed set requires a new baseline cycle, not an override.`,
  };
}
