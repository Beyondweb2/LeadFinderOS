/* ════════════════════════════════════════════════════════════════════════════════════════════
   Q&A ANSWER GUARD — which clients may have their answers DRAFTED, and which sentences must be
   held back for a human to confirm. Pure and dependency-free: the page-generator edge function
   imports it with a relative .ts path, scripts/qa-answer-guard.test.ts drives it.

   ⛔ WHY THIS IS CODE AND NOT A PROMPT RULE. The Q&A generator's original safety model was
   STRUCTURAL — the model returned only LABELS for facts and every specific was written by code as
   a [CLIENT INPUT] blank, so it could not emit a wrong price or a clinical claim even if it tried.
   Paul's 2026-08-29 change narrows that for ordinary professional clients (an accountancy page of
   nothing but blanks is useless), and the narrowing has to keep the same property: the boundary
   between "draft it" and "a human confirms it" is decided HERE, by inspecting the finished text,
   not by asking the model to behave. A model that ignores every instruction still cannot publish
   an unconfirmed figure, because the figure is caught on the way out.

   ⛔ BOTH ABSENT CASES FALL TO THE SAFE SIDE (the house rule, CLAUDE.md §6). An unknown trade gets
   the STRICT mode (blanks, a human fills them). And the trigger lists below are deliberately
   generous rather than precise: an over-broad list costs one unnecessary confirmation, an
   under-broad one publishes a wrong number.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** `structured` = the original model: no drafted answers at all, every fact a [CLIENT INPUT] blank,
 *  sources + a named reviewer. `advice` = answers are drafted, and only the sentences this guard
 *  flags become [CLIENT CONFIRM: …] items carrying their draft wording for a human to approve. */
export type QaMode = 'advice' | 'structured';

/* ⛔ TRADES THAT KEEP THE STRICT MODE. Health and clinical work is the case the structural model
   was built for (Solene, a menopause clinic — CLAUDE.md §6i). Legal, financial-advice, mortgage
   and insurance work sit here too: a wrong published figure or eligibility rule in those trades is
   a regulatory problem rather than an embarrassment. Accountancy and bookkeeping are deliberately
   NOT here — they are the trades this change exists for.
   ⚠️ EVERY PATTERN IS WORD-BOUNDARY ANCHORED. An unanchored 'vet' matches "private", 'gp' matches
   "gps", 'care' matches "careful" — the substring trap that has caught this codebase twice already
   ("bing" inside "plumbing", "acca" inside "Macca-Gas", CLAUDE.md §4).
   ⚠️ Paul tunes this list. Adding a trade only ever makes its pages MORE cautious. */
export const REGULATED_TRADE_PATTERNS: readonly RegExp[] = [
  // health / clinical
  /\bmedical\b/, /\bmedicine\b/, /\bhealth\w*\b/, /\bclinic\w*\b/, /\bdoctors?\b/, /\bgps?\b/,
  /\bdental\b/, /\bdentists?\b/, /\bpharmac\w*\b/, /\bnurses?\b/, /\bnursing\b/, /\bsurgery\b/,
  /\bmenopause\b/, /\bhormones?\b/, /\bhrt\b/, /\btherap\w*\b/, /\bphysio\w*\b/, /\bchiropract\w*\b/,
  /\bosteopath\w*\b/, /\bpsycholog\w*\b/, /\bpsychiatr\w*\b/, /\bcounsell\w*\b/, /\bmidwif\w*\b/,
  /\bnutrition\w*\b/, /\bdietit\w*\b/, /\bveterinar\w*\b/, /\bvets?\b/, /\baesthetics?\b/,
  /\bcosmetics?\b/, /\bcare home\b/, /\bdomiciliary\b/, /\bwellbeing\b/,
  // regulated advice
  /\bsolicitors?\b/, /\blegal\b/, /\blaw firm\b/, /\bbarristers?\b/, /\bconveyanc\w*\b/,
  /\bfinancial advi\w*\b/, /\bmortgages?\b/, /\binsurance\b/, /\bifa\b/, /\bwealth\b/,
];

/**
 * Which Q&A mode this client's trade gets.
 * ⛔ A BLANK OR UNKNOWN TRADE IS `structured`, NOT `advice`. A useless page of blanks for an
 * accountant is a complaint; free-writing clinical copy for a client whose trade we could not read
 * is a real harm. Absence is never permission.
 */
export function qaModeFor(businessType: string | null | undefined): QaMode {
  const t = String(businessType ?? '').toLowerCase().trim();
  if (!t) return 'structured';
  return REGULATED_TRADE_PATTERNS.some((re) => re.test(t)) ? 'structured' : 'advice';
}

/** Why a sentence needs a human before it publishes. Reported so the check is auditable. */
export type ConfirmReason = 'figure' | 'price' | 'credential' | 'commitment';

/* ⛔ THE BOUNDARY, IN FOUR GROUPS — this IS the "pricing/factual vs general" decision. Anything
   matching goes out as [CLIENT CONFIRM — reason: <the drafted wording>]; everything else is
   published prose. */

/** 1. FIGURE — any digit, currency symbol or percentage, plus spelled-out durations ("within five
 *  working days"). The broadest and the most important: a wrong number is the failure everyone
 *  recognises, and an invented specific nearly always carries one. This is the original
 *  digit-guard, kept and widened. */
export const FIGURE_RE =
  /[0-9£$€%]|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b\s+(?:working\s+)?(?:days?|weeks?|months?|years?|hours?)\b/i;

/** 2. PRICE — money vocabulary with no number attached ("our fees are competitive", "we charge by
 *  the hour"). A price claim with the figure left out is still a price claim. */
export const PRICE_RE =
  /\b(?:fees?|pricing|prices?|priced|costs?|charges?|charged|rates?|quotes?|quoted|retainers?|deposits?|discounts?|refunds?|free|per hour|hourly|fixed fee|no obligation)\b/i;

/** 3. CREDENTIAL — registrations, memberships, regulators, insurance, guarantees. The same class of
 *  trust-and-safety claim the service+area generator forbids the model from writing at all. */
export const CREDENTIAL_RE =
  /\b(?:acca|icaew|aat|cima|ciot|fca|chartered|certified|accredited|regulated|registered|licen[cs]ed|insured|indemnity|award[- ]?winning|guarantees?|guaranteed)\b|\bmembers?(?:hip)? of\b/i;

/** 4. COMMITMENT — a first-person promise about what THIS business does. "We file your return
 *  before the deadline" is a commitment they must stand behind; "an accountant files your return"
 *  is general professional information and publishes freely. The distinction is the PRONOUN, which
 *  is why this is a group of its own rather than more vocabulary in the ones above. */
export const COMMITMENT_RE =
  /\b(?:we|our|us)\b[^.!?]*\b(?:offer|provide|include|handle|manage|deal with|specialis\w*|specializ\w*|promise|ensure|always|never|same[- ]day|next[- ]day|turnaround|available)\b/i;

/**
 * Does this sentence need a human to confirm it before publishing? Returns the reason, or null for
 * ordinary professional prose that may publish as drafted.
 * ⚠️ The four tests are independent; the order decides only which REASON is reported, never
 * whether the sentence is caught. Widening one can therefore not quietly disable another.
 */
export function confirmReason(sentence: string): ConfirmReason | null {
  const s = String(sentence ?? '');
  if (!s.trim()) return null;
  if (FIGURE_RE.test(s)) return 'figure';
  if (PRICE_RE.test(s)) return 'price';
  if (CREDENTIAL_RE.test(s)) return 'credential';
  if (COMMITMENT_RE.test(s)) return 'commitment';
  return null;
}

export interface GuardedSentence {
  text: string;
  /** null = publishes as written. Otherwise the sentence becomes a [CLIENT CONFIRM] item. */
  confirm: ConfirmReason | null;
}

/** Split prose into sentences for guarding. Deliberately simple: a full stop / ? / ! then
 *  whitespace. SENTENCE level is the point — flagging a whole paragraph because one clause carries
 *  a number rebuilds the all-blanks page this change exists to fix. */
export function splitSentences(text: string): string[] {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Guard a passage: every sentence kept, each marked with whether a human must confirm it. */
export function guardProse(text: string): GuardedSentence[] {
  return splitSentences(text).map((s) => ({ text: s, confirm: confirmReason(s) }));
}

/** The marker a human looks for. THE DRAFT WORDING STAYS INSIDE IT — Paul's requirement: a person
 *  approves or corrects a suggested value rather than meeting an empty blank and writing from
 *  scratch. The reason is named so the page itself says which rule caught the sentence. */
export function confirmMark(text: string, reason: ConfirmReason): string {
  return `[CLIENT CONFIRM — ${reason}: ${text}]`;
}

/** Render a guarded passage to plain text: clean sentences as written, flagged ones wrapped.
 *  Callers escape the result; this never emits markup. */
export function renderGuarded(text: string): string {
  return guardProse(text)
    .map((s) => (s.confirm ? confirmMark(s.text, s.confirm) : s.text))
    .join(' ');
}

/** How many sentences in a passage need confirming — for the page's own summary line. */
export function confirmCount(text: string): number {
  return guardProse(text).filter((s) => s.confirm !== null).length;
}
