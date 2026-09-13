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
import { FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, REMEASURE_CLAIM_SENTENCE } from './findableOffer.ts';
import { defaultRemeasureDue } from './deliveryCockpit.ts';
import { parseAmountPaid } from './leadPayment.ts';

/** ⛔ FALSE UNTIL PAUL APPROVES THE COPY. See the header. */
export const REMEASURE_RESULTS_COPY_APPROVED = false;

/** The claim window, in days, counted from the moment the results were SENT (the stamp). Derived
 *  on read, never stored: the stamp is the fact, the close is arithmetic. */
export const REMEASURE_CLAIM_WINDOW_DAYS = 14;

/* ══ THE TERMS GATE — A POSITIVE TEST FOR THE CURRENT OFFER ══════════════════════════════════════
   ⛔ IT ASKS "IS THIS CLIENT ON TODAY'S TERMS?", NEVER "IS THIS CLIENT LEGACY?". Paul's rule,
   2026-09-13, after the four-week document was found to be wrong in three independent ways for RG
   Locksmiths — his most important client, and the first one due. The document would have offered
   him £99 back (he paid £19.99), on a four-week cycle (he was sold eight, and his stored date is
   +56), under an outcome refund (his stored contract records a WORK guarantee) — and on his real
   numbers it would have told him he qualified for a refund he was never sold.

   ⛔ THE THREE FACTS LIVE IN THREE DIFFERENT PLACES, so all three are checked. The contract records
   the guarantee kind and NOTHING ELSE that matters here: there is no amount field and no cycle
   field in either schema version. The amount is the lead's `amount_paid`; the cycle is the stored
   `remeasure_due_date` against what the filler would have written. Checking the contract alone
   would have passed a client on the wrong price or the wrong clock.

   ⛔ ABSENCE REFUSES, AND RONNIE IS WHY. He has NO stored contract at all — he said he would finish
   the questionnaire another time and never did — so a test written as `contract.guarantee ===
   'work'` would have let him straight through eleven days after RG. A missing contract, a missing
   amount, an unreadable date and a schema version nobody has seen yet all refuse. The only way to
   pass is to be provably on today's terms.

   ⛔ IT REFUSES; IT NEVER REWORDS. A document built from a stored contract was considered and
   rejected: the contract cannot supply the refund amount or the cycle, and the claim sentence is
   one byte-locked constant naming £99, so a £19.99 client would need a second locked sentence in
   both repos. A refusal is one email Paul writes by hand; a reworded document is a promise derived
   from two computed numbers.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export interface CurrentTermsFacts {
  /** `ai_audits.baseline_contract` from the BASELINE audit (never the replay). */
  contract: unknown;
  /** `outreach_leads.amount_paid`, exactly as read. */
  amountPaid: number | string | null | undefined;
  /** `ai_audits.baseline_completed_at` on the baseline — what the due-date filler measures from. */
  baselineFrozenAt: string | null | undefined;
  /** `outreach_leads.remeasure_due_date`, exactly as read. */
  remeasureDueDate: string | null | undefined;
}

export type CurrentTermsVerdict = { current: true } | { current: false; reason: string };

/** The short operator line for a client the sender will not serve. */
export const LEGACY_TERMS_LABEL = 'legacy terms, send by hand';

/** Is this client provably on the terms the four-week document describes? */
export function currentTermsVerdict(f: CurrentTermsFacts): CurrentTermsVerdict {
  const c = f.contract;
  if (!c || typeof c !== 'object' || Array.isArray(c)) {
    return { current: false, reason: 'no baseline contract is stored, so what this client was sold is not recorded' };
  }
  const contract = c as { version?: unknown; guarantee?: unknown };
  if (contract.version !== 2) {
    return { current: false, reason: `the baseline contract is version ${JSON.stringify(contract.version ?? null)}, not the current version 2` };
  }
  if ('guarantee' in contract && contract.guarantee != null) {
    return { current: false, reason: `the baseline contract records a '${String(contract.guarantee)}' guarantee, which is not today's outcome-conditional one` };
  }
  const paid = parseAmountPaid(typeof f.amountPaid === 'number' ? String(f.amountPaid) : f.amountPaid);
  if (paid == null) return { current: false, reason: 'no readable amount_paid on the lead, so the refund figure cannot be checked' };
  if (paid < FINDABLE_SETUP_PRICE_GBP) {
    return { current: false, reason: `they paid £${paid.toFixed(2)}, below the current £${FINDABLE_SETUP_PRICE_GBP} the document offers back` };
  }
  const frozen = (f.baselineFrozenAt ?? '').trim();
  if (!frozen || Number.isNaN(new Date(frozen).getTime())) {
    return { current: false, reason: 'the baseline has no readable completion date, so the cycle cannot be checked' };
  }
  const stored = (f.remeasureDueDate ?? '').trim().slice(0, 10);
  if (!stored) return { current: false, reason: 'no remeasure_due_date is stored, so the cycle cannot be checked' };
  const expected = defaultRemeasureDue(frozen);
  if (stored !== expected) {
    return { current: false, reason: `their re-measure is due ${stored}, not the current cycle's ${expected} — they are on a different clock` };
  }
  return { current: true };
}

export interface ReplayRunLite { status: string | null }

export type ResultsDecision =
  | { send: true }
  | { send: false; reason: string; kind: 'copy_not_approved' | 'terms_differ' | 'replay_gave_up' | 'incomparable' | 'unproven' };

/** Should the results go to the client automatically? */
export function remeasureResultsDecision(input: {
  replayRuns: readonly ReplayRunLite[];
  replayTarget: number | null | undefined;
  comparison: MeasurementComparison;
  /** ⛔ REQUIRED, never optional. An optional field defaulting to "fine" is the absent-value shape
   *  on the gate that exists to stop a wrong promise reaching a client: a caller that forgot it
   *  would send. TypeScript makes forgetting it a compile error instead. */
  terms: CurrentTermsVerdict;
  copyApproved?: boolean;
}): ResultsDecision {
  if ((input.copyApproved ?? REMEASURE_RESULTS_COPY_APPROVED) !== true) {
    return { send: false, kind: 'copy_not_approved', reason: 'the results copy has not been approved yet (REMEASURE_RESULTS_COPY_APPROVED is false)' };
  }
  /* ⛔ BEFORE EVERY OTHER TEST, AND IN FRONT OF THE CLAIM. A client on different terms is not a
     wording problem to be solved further down: nothing about this document is true for them. */
  if (input.terms.current !== true) {
    return { send: false, kind: 'terms_differ', reason: `${LEGACY_TERMS_LABEL}: ${input.terms.reason}` };
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

/* ══ WHEN THE MONTHLY STARTS ═════════════════════════════════════════════════════════════════════
   ⛔ THE BILLING ANCHOR AND THE CLAIM WINDOW ARE THE SAME INSTANT, COMPUTED BY THE SAME FUNCTION.
   That is the whole safety property of the delayed-monthly model: a client cannot be charged while
   still entitled to claim, because the first charge lands exactly when the entitlement ends. Two
   functions that agreed today would drift the first time either was edited; one function cannot.

   ⛔ IT IS DERIVED FROM THE RESULTS STAMP, NEVER FROM THE CHECKOUT DATE. The replay lands on day 28
   normally, later whenever it holds, and day 56 for RG by contract — anchoring to checkout would
   charge those clients inside their own window. */
export const monthlyStartIso = claimWindowCloseIso;

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
  /** When the monthly starts — the day the claim window closes. Absent for a client who has no
   *  monthly (anyone who paid before 2026-09-13), and then the email says nothing about billing. */
  monthlyStartsOn?: string | null;
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
  /* ⛔ THIS EMAIL IS THE 14-DAY NOTICE, AND IT IS THE ONLY ONE THAT ARRIVES THAT FAR AHEAD.
     Stripe's own trial-ending event fires three days out and nothing can move it, so the honest
     place to name the date and the amount is here, at the moment the clock actually starts.
     ⛔ IT NAMES THE SAME DAY THE CLAIM WINDOW CLOSES, because they ARE the same day by
     construction (monthlyStartIso is claimWindowCloseIso). Saying so plainly is what stops it
     reading as a second, hidden deadline. */
  if (i.monthlyStartsOn) {
    out.push(
      `That same day — ${i.monthlyStartsOn} — your monthly starts, at £${FINDABLE_MONTHLY_GBP} a month. It covers the work we keep doing every week to add another way for people to find you. Cancel any time before then and it never begins.`,
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
