/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FOUR-WEEK RESULTS — the decision, the verdict, the window and the WORDS (2026-09-13).

   findable.live/refunds says a client may claim within 14 days of RECEIVING their four-week results.
   Until today nothing sent them: the day-28 replay produced an audit and the clock never started.
   This module is the pure half of the sender (supabase/functions/_shared/remeasure-results.ts):
   Deno-free so the tsx suite drives it, imported by the edge sender, the public renderer and the SPA.

   ⛔ THE DECISION IS POOLED ACROSS BOTH ENGINES — Paul's call, 2026-09-13, stated knowing that RG's
   own pair reads +0.3 points pooled and therefore "has not gone up". "Gone up" means the product's
   own verdict, `improved`: a rise BEYOND the ±NOISE_BAND_PP swing. A rise inside the band is the
   swing we see between repeat measurements with no work done, and the refund sentence promises a
   refund when the number "has not gone up", so inside the band counts as not gone up. That reading
   is what the client is told, in the same words as /refunds.

   ⛔ IT DOES NOT SEND — IT ROUTES TO A TASK — WHEN THE NUMBER CANNOT BE PROVEN: the replay gave up
   (fewer complete runs than its target, or a run failed/capped), the sides share no question, or
   any matched question has fewer than MIN_CELLS_FOR_QUESTION_CLAIM cells on either side. A document
   that starts a refund clock must not rest on a number the product itself marks unproven.

   ⛔ THE WORDS ARE PAUL'S, AND THEY ARE GATED. `REMEASURE_RESULTS_COPY_APPROVED` is false until he
   approves the draft below; while false the sender holds every result as a task instead of sending.
   Flipping it is a deliberate commit and deploy, never a runtime switch.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { MIN_CELLS_FOR_QUESTION_CLAIM, NOISE_BAND_PP, type MeasurementComparison } from './measurementCompare.ts';
import { REMEASURE_CLAIM_SENTENCE } from './findableOffer.ts';

/** ⛔ FALSE UNTIL PAUL APPROVES THE COPY. See the header. */
export const REMEASURE_RESULTS_COPY_APPROVED = false;

/** The claim window, in days, counted from the moment the results were SENT (the stamp). Derived
 *  on read, never stored: the stamp is the fact, the close is arithmetic. */
export const REMEASURE_CLAIM_WINDOW_DAYS = 14;

export interface ReplayRunLite { status: string | null }

export type ResultsDecision =
  | { send: true }
  | { send: false; reason: string; kind: 'copy_not_approved' | 'replay_gave_up' | 'incomparable' | 'unproven' };

/** Should the results go to the client automatically? */
export function remeasureResultsDecision(input: {
  replayRuns: readonly ReplayRunLite[];
  replayTarget: number | null | undefined;
  comparison: MeasurementComparison;
  copyApproved?: boolean;
}): ResultsDecision {
  if ((input.copyApproved ?? REMEASURE_RESULTS_COPY_APPROVED) !== true) {
    return { send: false, kind: 'copy_not_approved', reason: 'the results copy has not been approved yet (REMEASURE_RESULTS_COPY_APPROVED is false)' };
  }
  const target = Math.max(1, Math.floor(Number(input.replayTarget) || 1));
  const complete = input.replayRuns.filter((r) => r.status === 'complete').length;
  const broken = input.replayRuns.filter((r) => r.status === 'failed' || r.status === 'capped').length;
  if (complete < target || broken > 0) {
    return { send: false, kind: 'replay_gave_up', reason: `the replay gave up: ${complete} of ${target} runs complete, ${broken} failed or capped` };
  }
  const c = input.comparison;
  if (c.movement === 'incomparable' || c.matchedCount === 0) {
    return { send: false, kind: 'incomparable', reason: 'the replay and the baseline share no question, so there is no before-and-after' };
  }
  const thin = c.questions.filter((q) => q.before && q.after && (q.before.cells < MIN_CELLS_FOR_QUESTION_CLAIM || q.after.cells < MIN_CELLS_FOR_QUESTION_CLAIM));
  if (thin.length) {
    return { send: false, kind: 'unproven', reason: `${thin.length} question(s) have fewer than ${MIN_CELLS_FOR_QUESTION_CLAIM} answer cells on one side, so the number cannot be proven — e.g. "${thin[0].question}"` };
  }
  return { send: true };
}

/** "Gone up" = the pooled rate rose beyond the noise band. Inside the band is NOT gone up. */
export function numberWentUp(c: MeasurementComparison): boolean {
  return c.movement === 'improved';
}

/** When the 14-day window closes, from the stamp. Null when nothing has been sent. */
export function claimWindowCloseIso(sentAtIso: string | null | undefined): string | null {
  if (!sentAtIso) return null;
  const t = new Date(sentAtIso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + REMEASURE_CLAIM_WINDOW_DAYS * 86_400_000).toISOString();
}

/* ══ THE WORDS ═══════════════════════════════════════════════════════════════════════════════════
   Drafted for Paul's approval (2026-09-13). The refund sentence is REMEASURE_CLAIM_SENTENCE —
   byte-locked to findable-site's REFUND_CLAIM_SENTENCE and rendered on /refunds — so the email, the
   document and the policy page cannot say three different things about the claim. */
export interface ResultsCopyInput {
  businessName: string;
  town: string | null;
  beforeNamed: number; beforeAnswered: number;
  afterNamed: number; afterAnswered: number;
  questions: number;
  wentUp: boolean;
  withinNoise: boolean;
  documentUrl: string;
}

/* ⛔ THE CLAIM PARAGRAPH — ONE SENTENCE OF OURS IN FRONT OF ONE SENTENCE THAT IS LOCKED.
   Paul asked for "That means the guarantee applies. Email us within 14 days and we'll refund your
   £99." The second half CANNOT be written that way here. REMEASURE_CLAIM_SENTENCE is byte-locked to
   findable-site's REFUND_CLAIM_SENTENCE (check-cross-repo-sync.mjs, both repos) and FINDABLE_GUARANTEE
   is asserted to END with it — so the same string is /refunds' paragraph 2 AND the description on the
   Stripe checkout. Shortening it there would drop "If that number has not gone up" from the policy
   page and from the sale, leaving the customer-facing authority promising a refund with no condition
   attached: the wording §20 already records as rejected on the pricing heading.
   So the lead-in carries the reframe and the locked sentence follows it verbatim. The condition is
   stated twice in a row by construction; that is the price of the lock, and it is the safe direction. */
export function resultsClaimParagraph(): string {
  return `That means the guarantee applies. ${REMEASURE_CLAIM_SENTENCE}`;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);

export function resultsEmailSubject(i: ResultsCopyInput): string {
  return `Your four-week results — ${i.businessName}`;
}

/** Plain-text paragraphs; the HTML email wraps each in a <p>. */
export function resultsEmailParagraphs(i: ResultsCopyInput): string[] {
  const where = i.town ? ` in ${i.town}` : '';
  const out = [
    `Hi,`,
    `Four weeks ago we measured how often ChatGPT and Gemini named ${i.businessName} when people asked the questions your customers ask${where}. We have just asked the same ${i.questions} questions again, on the same engines.`,
    `Before: named in ${i.beforeNamed} of ${i.beforeAnswered} answers (${pct(i.beforeNamed, i.beforeAnswered)}%).`,
    `After: named in ${i.afterNamed} of ${i.afterAnswered} answers (${pct(i.afterNamed, i.afterAnswered)}%).`,
    `The full before-and-after, question by question, is here: ${i.documentUrl}`,
  ];
  if (i.wentUp) {
    out.push(`Your number has gone up. The pages and listings we built are what the engines are now reading. Keep them live and we keep measuring.`);
  } else {
    /* ⛔ THE ORDER IS PAUL'S, 2026-09-13: the verdict, then the entitlement, then the mechanism.
       It used to read as an apology followed by an offer. "That means the guarantee applies" is
       ours to write; the sentence after it is NOT — see the note above resultsClaimParagraph. */
    out.push(
      i.withinNoise
        ? `Your number has not gone up. The change is inside the ${NOISE_BAND_PP}-point swing we see between repeat measurements with no work done, so we count it as no movement.`
        : `Your number has not gone up.`,
      resultsClaimParagraph(),
    );
  }
  out.push(`Paul, findable`);
  return out;
}

/** The document's "what this means" paragraphs, same rule, same sentence. */
export function resultsDocumentMeaning(i: ResultsCopyInput): string[] {
  if (i.wentUp) {
    return [
      `${i.businessName} is named more often than it was four weeks ago, on the same questions and the same engines.`,
      `The pages and listings we built are what the engines are now reading. Keep them live and we keep measuring.`,
    ];
  }
  return [
    i.withinNoise
      ? `The number has not gone up. The change is inside the ${NOISE_BAND_PP}-point swing we see between repeat measurements with no work done, so we count it as no movement.`
      : `The number has not gone up.`,
    resultsClaimParagraph(),
  ];
}
