/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FOUR-WEEK RESULTS — the decision, the verdict, the window and the WORDS (2026-09-13).

   findable.live/refunds says a client may claim within 14 days of RECEIVING their four-week results.
   Until today nothing sent them: the day-28 replay produced an audit and the clock never started.
   This module is the pure half of the sender (supabase/functions/_shared/remeasure-results.ts):
   Deno-free so the tsx suite drives it, imported by the edge sender, the public renderer and the SPA.

   ⛔ THE DECISION IS POOLED ACROSS BOTH ENGINES — Paul's call, 2026-09-13.
   🔴 "GONE UP" = ANY INCREASE IN THE COUNT (Paul, 2026-10-05; v3 Client Service Agreement clause 5.4:
   "If the number of answers that name your business at the re-measurement is not higher than at the
   baseline"). 39/120 → 40/120 HAS gone up; 39 → 39 and 39 → 38 have not. The ±NOISE_BAND_PP band no
   longer decides anything about the guarantee — it was a percentage test the agreement never stated.
   The band stays in measurementCompare.ts for the OPERATOR's comparison screens only; no client-facing
   sentence mentions it. Comparability (same questions, both engines, enough runs) is still a gate that
   HOLDS the results for Paul — never a threshold on the number (clientTimeline.guaranteeNumberWentUp).

   ⛔ IT DOES NOT SEND — IT ROUTES TO A TASK — WHEN THE NUMBER CANNOT BE PROVEN: the replay gave up
   (fewer complete runs than its target, or a run failed/capped), the sides share no question, or
   any matched question has fewer than MIN_CELLS_FOR_QUESTION_CLAIM cells on either side. A document
   that starts a refund clock must not rest on a number the product itself marks unproven.

   ⛔ THE WORDS ARE PAUL'S, AND THEY ARE GATED. `REMEASURE_RESULTS_COPY_APPROVED` is false until he
   approves the draft below; while false the sender holds every result as a task instead of sending.
   Flipping it is a deliberate commit and deploy, never a runtime switch.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { MIN_CELLS_FOR_QUESTION_CLAIM, type MeasurementComparison } from './measurementCompare.ts';
import { guaranteeNumberWentUp, type ContinuingMode } from './clientTimeline.ts';
import { afterTermSummaryWords } from './planTerms.ts';
import { FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, GUARANTEE_PAYMENT_TWO_SENTENCE, REMEASURE_CLAIM_SENTENCE, REMEASURE_WEEKS_STANDARD, serviceRouteForTotal, termMonthsFor, totalPaymentsFor } from './findableOffer.ts';
import { defaultRemeasureDue, remeasureOffsetDays } from './deliveryCockpit.ts';

/** "four" / "eight" — the client's re-measure clock in words (remeasureWeeksFor). */
export function weeksWord(weeks: number | null | undefined): string {
  const w = weeks ?? REMEASURE_WEEKS_STANDARD;
  return w === 4 ? 'four' : w === 8 ? 'eight' : String(w);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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
  /** The client's re-measure clock in weeks (remeasureWeeksFor: 4, or 8 for a site we build on a
   *  brand-new domain). Absent = the standard four, which can only REFUSE a new-domain client (their
   *  stored date is +56), never pass a wrong one. */
  remeasureWeeks?: number | null;
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
  const expected = defaultRemeasureDue(frozen, remeasureOffsetDays(f.remeasureWeeks ?? REMEASURE_WEEKS_STANDARD));
  if (stored !== expected) {
    return { current: false, reason: `their re-measure is due ${stored}, not the current cycle's ${expected} — they are on a different clock` };
  }
  return { current: true };
}

export interface ReplayRunLite { status: string | null }

export type ResultsDecision =
  | { send: true }
  | { send: false; reason: string; kind: 'copy_not_approved' | 'terms_differ' | 'replay_gave_up' | 'incomparable' | 'unproven' | 'engine_imbalance' };

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
  /* ⛔ AN ENGINE SHORT ON ONE SIDE HOLDS THE VERDICT (2026-10-04, C-12). The pooled number moves with
     the engine MIX; a Gemini drop-out on the replay can read as "gone up" and cost a client a refund
     they were owed. measurementCompare counts each engine over the matched questions only.
     ⛔ ABSENT HOLDS: a comparison that carries no engine count cannot show it is balanced, and this is
     a sending path (CLAUDE.md §4). */
  if (!Array.isArray(c.engineShort)) {
    return { send: false, kind: 'engine_imbalance', reason: 'the comparison carries no per-engine count, so engine balance cannot be checked' };
  }
  const short = c.engineShort;
  if (short.length) {
    const lines = short.map((e) => { const b = c.engineBalance?.[e]; return b ? `${e} ${b.before.answered} before / ${b.after.answered} after` : e; });
    return { send: false, kind: 'engine_imbalance', reason: `an engine answered unevenly between the two measurements (${lines.join('; ')}), so the pooled number cannot be compared fairly` };
  }
  return { send: true };
}

/** 🔴 "Gone up" = MORE named answers after than before, on the matched questions and engines (clause 5.4;
 *  Paul 2026-10-05: any increase counts). One more named answer is gone up; equal or fewer is not. */
export function numberWentUp(c: MeasurementComparison): boolean {
  return guaranteeNumberWentUp(c.before.named, c.after.named);
}

/** When the 14-day window closes, from the stamp. Null when nothing has been sent. */
export function claimWindowCloseIso(sentAtIso: string | null | undefined): string | null {
  if (!sentAtIso) return null;
  const t = new Date(sentAtIso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + REMEASURE_CLAIM_WINDOW_DAYS * 86_400_000).toISOString();
}

/* ══ WHEN THE MONTHLY STARTS — READ FROM THE SUBSCRIPTION, NEVER FROM THE RESULTS ══════════════════
   🔴 REWRITTEN 2026-09-23. This used to be `monthlyStartIso = claimWindowCloseIso`: the first charge
   was results + 14 days, and the results sender created the subscription. Since 2026-09-18 the
   subscription is created at SIGN-UP with trial_end = firstRecurringPaymentIso(sign-up) (six weeks),
   so the alias described billing Stripe no longer does — and the sender called it without importing
   it, a ReferenceError after the send had been claimed.
   ⛔ THE BILLING DATE AND THE CLAIM WINDOW ARE NOW TWO CLOCKS. Billing counts from sign-up; the
   window counts from the results. They are close on the standard timeline and not equal, so no
   customer text may say they are "the same day".
   ⛔ THE DATE IS THE ONE STRIPE WILL CHARGE ON: the stored subscription's renewal date while it is
   still trialing and in the future. Anything else — no subscription, already billing, unreadable —
   is null, and the email then names no date rather than a guessed one. */
export function resultsBillingStartIso(s: {
  subscriptionId: string | null | undefined;
  subscriptionStatus: string | null | undefined;
  subscriptionRenewsAt: string | null | undefined;
  nowIso: string;
}): string | null {
  if (!(s.subscriptionId ?? '').trim()) return null;
  if (s.subscriptionStatus !== 'trialing') return null;
  const at = new Date(s.subscriptionRenewsAt ?? '').getTime();
  const now = new Date(s.nowIso).getTime();
  if (!Number.isFinite(at) || !Number.isFinite(now) || at <= now) return null;
  return new Date(at).toISOString();
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
  /** The client's re-measure clock in weeks (remeasureWeeksFor). Absent = four. */
  weeks?: number | null;
  /** The first recurring payment's date, as a person reads it — from resultsBillingStartIso, so
   *  only when a trialing subscription will charge on it. Absent otherwise (no subscription, already
   *  billing), and then the email says nothing about billing. */
  monthlyStartsOn?: string | null;
  /** The client's contracted payment count (outreach_leads.contract_total_payments, stamped at
   *  payment). Absent/unknown → the billing sentence names no count. */
  totalPayments?: number | null;
  /** v3 terms (2026-10-05): the Continuing Service (FINDABLE_CONTINUING_GBP) follows the minimum term (clause 9A), and the
   *  first monthly payment is the Payment Start Date, the day after the Refund Window (5.6). */
  v3Terms?: boolean;
  /** What follows the minimum term for THIS client (clientTimeline.continuingModeFor). Absent with v3Terms = v3's automatic continuation. */
  continuingMode?: ContinuingMode;
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
/* 🔴 PAYMENT 2 (Paul, 2026-09-23): the claim paragraph also says what a valid claim does to the
   monthly — refunded if already taken, never taken otherwise (GUARANTEE_PAYMENT_TWO_SENTENCE, locked
   to findable-site). */
export function resultsClaimParagraph(): string {
  return `That means the guarantee applies. ${REMEASURE_CLAIM_SENTENCE} ${GUARANTEE_PAYMENT_TWO_SENTENCE}`;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);

export function resultsEmailSubject(i: ResultsCopyInput): string {
  return `Your ${weeksWord(i.weeks)}-week results — ${i.businessName}`;
}

/** Plain-text paragraphs; the HTML email wraps each in a <p>. */
export function resultsEmailParagraphs(i: ResultsCopyInput): string[] {
  const where = i.town ? ` in ${i.town}` : '';
  const out = [
    `Hi,`,
    `${cap(weeksWord(i.weeks))} weeks ago we measured how often ChatGPT and Gemini named ${i.businessName} when people asked the questions your customers ask${where}. We have just asked the same ${i.questions} questions again, on the same engines.`,
    `Before: named in ${i.beforeNamed} of ${i.beforeAnswered} answers (${pct(i.beforeNamed, i.beforeAnswered)}%).`,
    `After: named in ${i.afterNamed} of ${i.afterAnswered} answers (${pct(i.afterNamed, i.afterAnswered)}%).`,
    `The full before-and-after, question by question, is here: ${i.documentUrl}`,
  ];
  if (i.wentUp) {
    /* ⛔ NO CAUSAL CLAIM (2026-10-04, Session C C-28). This used to say "The pages and listings we built
       are what the engines are now reading" — the data shows the number rose, not why. The sentence
       says what was measured and what we keep doing, nothing more. */
    out.push(`Your number has gone up: on the same questions and the same AI tools, you were named in more answers than ${weeksWord(i.weeks)} weeks ago. We keep the work live and keep measuring.`);
  } else {
    /* ⛔ THE ORDER IS PAUL'S, 2026-09-13: the verdict, then the entitlement, then the mechanism.
       It used to read as an apology followed by an offer. "That means the guarantee applies" is
       ours to write; the sentence after it is NOT — see the note above resultsClaimParagraph. */
    out.push(`Your number has not gone up.`, resultsClaimParagraph());
  }
  /* ⛔ THIS EMAIL IS THE EARLY BILLING NOTICE. Stripe's own trial-ending event fires three days out
     and nothing can move it, so the date and the amount are named here too.
     🔴 NOT "THAT SAME DAY" (2026-09-23). It used to say the monthly started the day the claim window
     closed; billing now runs from sign-up (six weeks), so that was false. The date is Stripe's own
     (resultsBillingStartIso) and the sentence counts the payments the way the offer does:
     the sign-up £99 is payment 1, this is payment 2, and nothing follows the last. */
  /* 🔴 PER ROUTE (2026-09-29): the count is the client's own contract (Build 12, Optimise 6). */
  /* ⛔ ONLY WHEN THE NUMBER WENT UP (Paul, 2026-10-05). The not-gone-up email has just said a valid
     claim stops the monthly; a "your first monthly payment is on…" paragraph straight after it reads
     as taking that back. That version names no upcoming payment. */
  if (i.wentUp && i.monthlyStartsOn && i.v3Terms) {
    /* v3: the date is the Payment Start Date (the day after the 14-day Refund Window); after the minimum
       term the Continuing Service follows (9A) — never "nothing is charged after". */
    const route = serviceRouteForTotal(i.totalPayments);
    out.push(`Your first monthly payment of £${FINDABLE_MONTHLY_GBP} is on ${i.monthlyStartsOn}, the day after your 14-day refund window closes. The monthly covers ${monthlyCoversPhrase(route)}${route ? `, for the rest of your ${termMonthsFor(route)}-month minimum term (${totalPaymentsFor(route)} payments, counting the £${FINDABLE_SETUP_PRICE_GBP} you paid at sign-up)` : ''}. ${endOfTermSentence(i, route)}`);
  } else if (i.wentUp && i.monthlyStartsOn) {
    const route = serviceRouteForTotal(i.totalPayments);
    out.push(route
      ? `Your first monthly payment of £${FINDABLE_MONTHLY_GBP} is on ${i.monthlyStartsOn}. The monthly covers ${monthlyCoversPhrase(route)}, for the rest of your ${termMonthsFor(route)}-month minimum term. That first monthly payment is payment 2 of ${totalPaymentsFor(route)}, counting the £${FINDABLE_SETUP_PRICE_GBP} you paid at sign-up, and nothing is charged after the ${totalPaymentsFor(route)}th.`
      : `Your first monthly payment of £${FINDABLE_MONTHLY_GBP} is on ${i.monthlyStartsOn}. The monthly covers ${monthlyCoversPhrase(null)}. That first monthly payment is payment 2, counting the £${FINDABLE_SETUP_PRICE_GBP} you paid at sign-up, and nothing is charged after your last agreed payment.`,
    );
  }
  out.push(RESULTS_SIGN_OFF);
  return out;
}

/** Paul's sign-off, exactly (2026-10-05). */
export const RESULTS_SIGN_OFF = 'Paul, Findable';

/* ⛔ WHAT THE MONTHLY PAYS FOR — THE ACTUAL SERVICE, NEVER "EVERY WEEK" (Paul, 2026-10-02 / 2026-10-05).
   A new page each month, a monthly check of AI visibility ("check", never "audit": /terms says the
   monthly update is not a full re-audit), adjustments as we learn. Hosting only on Build, where we
   host the site we built; an Optimise client keeps their own site, so it is not claimed there, and an
   unknown route claims nothing route-specific. ⛔ No "maintenance" in a billing text (Paul's standing
   rule, remeasure-results.test.ts: maintenance is the first thing anyone cuts). */
export function monthlyCoversPhrase(route: 'build' | 'optimise' | null): string {
  return route === 'build'
    ? 'a new page each month, a monthly check of your AI visibility, adjustments as we learn, and hosting the website we built for you'
    : 'a new page each month, a monthly check of your AI visibility, and adjustments as we learn';
}

/** The document's "what this means" paragraphs, same rule, same sentence. */
export function resultsDocumentMeaning(i: ResultsCopyInput): string[] {
  if (i.wentUp) {
    return [
      `${i.businessName} is named more often than it was ${weeksWord(i.weeks)} weeks ago, on the same questions and the same engines.`,
      /* No causal claim (C-28): the measurement shows the rise, not its cause. */
      `We keep the work live and keep measuring.`,
    ];
  }
  return [`The number has not gone up.`, resultsClaimParagraph()];
}

/** What the results email says about the end of the plan, by what THIS client signed (clientTimeline.continuingModeFor).
 *  v3 (and a missing mode, as before): the £29.99 continuation. v4: Optimise ends, Build's £29.99 is optional. */
function endOfTermSentence(i: { continuingMode?: ContinuingMode }, route: ReturnType<typeof serviceRouteForTotal>): string {
  const mode = i.continuingMode ?? 'automatic';
  if (mode === 'automatic') return `After that your service continues at £${FINDABLE_CONTINUING_GBP} a month until you cancel with 30 days' notice, and we will remind you at least 30 days before.`;
  return route ? afterTermSummaryWords(route) : 'Your plan ends after your last agreed payment and the final service period. There is no automatic continuing charge.';
}
