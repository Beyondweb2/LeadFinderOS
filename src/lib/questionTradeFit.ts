/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DID THIS QUESTION MEASURE THE RIGHT TRADE? — asked of the ANSWERS, after the engines have replied.

   🔴 THE INCIDENT, 2026-09-13. "fault diagnosis services in thetford UK" sat in White Sparks
   Electrical's winnable-questions view under ABSENT, whose stated meaning is "the race exists and
   you are invisible". There was no race. The engines named Gorse Motors Garage, Vickers Motors,
   Cunningham Motors and M & S Breckland Motors — car garages — and one electrician out of twelve.
   A wrong ABSENT is worse than no band at all: it sends the operator to build a page that cannot
   win, and it is counted against a client in a figure a refund turns on.

   ⛔ THIS IS NOT THE GENERATION GUARD AND DOES NOT DUPLICATE IT. seedGuard's `dropOffTrade` asks
   whether a question is ANCHORED to the trade before it is ever asked. This asks whether the
   engines ANSWERED it about the trade, which is a different question and only answerable afterwards
   — "landlord certificates in thetford UK" is a real electrician service (an EICR is a landlord
   certificate), passes the generation guard correctly, and still came back naming gas engineers and
   EPC assessors. Two faults, two places, neither one sufficient.

   ⛔ IT IS NOT A SIXTH BAND, AND THAT IS DELIBERATE. The five bands are statements about COUNTS you
   can check by eye (BAND_REASON promises exactly that). "We could not read this question's race" is
   a statement about the competitor NAMES and carries no count — putting it in the same enum would
   make it compete in the same sort order and quietly change what every band total means.

   🔴 AND IT MUST NEVER REACH A CUSTOMER. `buildBaselineView` feeds `measurementCompare`, which
   feeds the four-week results document a client reads. The gate is STRUCTURAL: this lives in its
   own module and hangs nothing on BaselineQuestion, so a flag cannot travel into the comparison by
   being a field somebody forgot to strip. The only way it reaches the client document is if
   somebody imports this file into one, and `scripts/question-trade-fit.test.ts` fails the build if
   they do.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { tradeWordHit } from './seedGuard';
import { isProvableJunkName } from './competitorCleaning';
import { classifyKnownEntity } from './knownEntities';
import type { BaselineQuestion, BaselineView } from './baselineView';

/** Named firms a question needs before its answers can say anything about a trade. */
export const MIN_FIRMS_TO_JUDGE = 3;

/** At or under this share of named firms in the trade, the question measured somebody else. */
export const OFF_TRADE_MAX_SHARE = 0.34;

/** Questions with enough firms before the whole audit can be graded readable at all. */
export const MIN_QUESTIONS_TO_CALIBRATE = 4;

/** Median in-trade share an audit must reach before any single question may be called off-trade. */
export const READABLE_MIN_MEDIAN = 0.5;

export type TradeFitState =
  /** Enough of the named firms are in the trade. The band means what it says. */
  | 'in_trade'
  /** The engines answered about a different trade. The band is not a fact about this client. */
  | 'off_trade'
  /** Fewer than MIN_FIRMS_TO_JUDGE named firms — nothing to read either way. */
  | 'too_few_firms'
  /** The audit as a whole is unreadable (see `readable`), so no question is judged. */
  | 'not_assessed';

export interface QuestionTradeFit {
  question: string;
  state: TradeFitState;
  inTrade: number;
  firms: number;
  /** The firms that carry none of the trade's vocabulary — what to show the operator. */
  strangers: string[];
}

export interface TradeFitReport {
  /**
   * False when this trade cannot be read off company names at all, and NOTHING is flagged then.
   *
   * ⛔ THE SELF-CHECK IS THE WHOLE REASON THIS IS TRUSTWORTHY. The test reads a trade off firm
   * NAMES, so it only works for trades whose firms put the trade in their name. Measured across
   * every audit on file: locksmith scores a 100% median, plumber 92%, electrician 92% — and
   * hospitality scores 0%, because a cocktail bar is not called "hospitality". Without this gate a
   * restaurant audit would report every question as measuring the wrong trade, which is not a
   * finding about the questions but an admission that the checker is blind. Deloitte and PwC are
   * the same failure in the accountancy book.
   */
  readable: boolean;
  /** The median that decided `readable`, so the refusal can state its own evidence. */
  medianShare: number | null;
  questions: QuestionTradeFit[];
  /** Questions that measured a different trade, worst first. Empty when `readable` is false. */
  offTrade: QuestionTradeFit[];
}

/**
 * A competitor name that is evidence about a trade.
 *
 * ⚠️ JUNK AND KNOWN NATIONALS ARE NOT EVIDENCE, and leaving them in changes the answer. Never-cleaned
 * folds store "Map", "OpenStreetMap" and scraped ids as competitors (§8's cleaner outage), every one
 * of which reads as "not in your trade" — including them turned a 13-question finding into a
 * 44-question one, most of it measuring the outage rather than the questions. Checkatrade is named
 * in every trade and Timpson is a shoe-repair chain named in locksmith audits; both say nothing
 * about whether a question found the right race.
 */
const isEvidence = (name: string): boolean =>
  !!name && name.trim().length >= 3 && !isProvableJunkName(name) && !classifyKnownEntity(name);

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** One question's fit, before the audit-wide readability gate is applied. */
function rawFit(q: BaselineQuestion, businessType: string): QuestionTradeFit {
  const firms = q.competitors.map((c) => c.name).filter(isEvidence);
  const strangers = firms.filter((f) => !tradeWordHit(f, businessType));
  const inTrade = firms.length - strangers.length;
  return {
    question: q.question,
    state: firms.length < MIN_FIRMS_TO_JUDGE ? 'too_few_firms' : 'in_trade',
    inTrade,
    firms: firms.length,
    strangers,
  };
}

/**
 * Grade every question in a view against the audited trade.
 *
 * ⚠️ A BLANK business_type RETURNS NOTHING READABLE. With no trade there is nothing to be off, and
 * guessing one from the business name is how a wrong verdict gets a confident label.
 */
export function assessTradeFit(
  view: Pick<BaselineView, 'questions'>,
  businessType: string | null | undefined,
): TradeFitReport {
  const trade = (businessType ?? '').trim();
  const questions = view.questions.map((q) => (trade ? rawFit(q, trade) : {
    question: q.question, state: 'not_assessed' as const, inTrade: 0, firms: 0, strangers: [],
  }));
  if (!trade) return { readable: false, medianShare: null, questions, offTrade: [] };

  const gradeable = questions.filter((q) => q.state !== 'too_few_firms' && q.firms > 0);
  const medianShare = median(gradeable.map((q) => q.inTrade / q.firms));
  const readable = gradeable.length >= MIN_QUESTIONS_TO_CALIBRATE
    && medianShare !== null && medianShare >= READABLE_MIN_MEDIAN;

  if (!readable) {
    return {
      readable: false,
      medianShare,
      questions: questions.map((q) => (q.state === 'too_few_firms' ? q : { ...q, state: 'not_assessed' as const })),
      offTrade: [],
    };
  }
  const graded = questions.map((q) => (
    q.state === 'too_few_firms' ? q
      : { ...q, state: (q.inTrade / q.firms <= OFF_TRADE_MAX_SHARE ? 'off_trade' : 'in_trade') as TradeFitState }
  ));
  return {
    readable: true,
    medianShare,
    questions: graded,
    offTrade: graded.filter((q) => q.state === 'off_trade')
      .sort((a, b) => (a.inTrade / a.firms) - (b.inTrade / b.firms)),
  };
}

/** What to put on screen beside the band. Plain words: the operator is the one who decides. */
export const TRADE_FIT_LABEL: Record<TradeFitState, string | null> = {
  in_trade: null,
  off_trade: 'Measuring the wrong trade',
  too_few_firms: null,
  not_assessed: null,
};

export const TRADE_FIT_REASON: Record<TradeFitState, string | null> = {
  in_trade: null,
  off_trade: 'The engines answered this about a different trade, so the band above is not a fact '
    + 'about you. Building a page for it cannot win anything.',
  too_few_firms: null,
  not_assessed: null,
};
