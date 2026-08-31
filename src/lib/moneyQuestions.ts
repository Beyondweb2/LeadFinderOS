/* ════════════════════════════════════════════════════════════════════════════════════════════
   MONEY QUESTIONS — the buying-moment queries, and how many of an audit they may take.
   Pure and dependency-free: create-ai-audit imports it with a relative .ts path, and
   scripts/money-questions.test.ts drives it.

   ⛔ WHY THESE ARE A MINORITY AND NOT A REPLACEMENT. The generic head term ("best accountant in
   Wisbech UK") is genuinely winnable in a small local pool, and it is what a MARKET audit needs to
   grade a town at all. Swapping the set would change what Coverage's verdicts mean at the same time
   as changing what a report measures. So the share is capped below half, always.

   ⛔ AND THEY ARE OPT-IN, DEFAULT OFF. moneyQuestionShare is only consulted where the caller asks
   for it — the ordinary per-business NEW audit. Market audits, paid baselines and every verbatim
   repeat are untouched, which is what keeps existing before/after comparisons comparable.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Share of an audit that may be money questions. 0.4 keeps them a minority at every count. */
export const MONEY_QUESTION_SHARE = 0.4;
/** Below this, an audit is too small to spend one of its questions on a buying-moment query. */
export const MONEY_QUESTION_MIN_COUNT = 3;

/**
 * How many of `count` questions should be money questions.
 * Paul's target was "about 2 money and 3 standard" at 5 — this returns exactly that, and scales.
 * ⛔ ALWAYS A STRICT MINORITY: capped at count-1 so a standard question can never be squeezed out
 * entirely, and 0.4 keeps it under half at every size.
 */
export function moneyQuestionShare(count: number): number {
  const n = Math.floor(Number(count) || 0);
  if (n < MONEY_QUESTION_MIN_COUNT) return 0;
  return Math.max(1, Math.min(Math.floor(n * MONEY_QUESTION_SHARE), n - 1));
}

/* ⛔ PHRASINGS THAT THE EXISTING GUARDS WOULD DESTROY, so the prompt must forbid them explicitly:
     · "near me" — stripNearMe is a HARD ban on every generated question, so a money question using
       it is silently deleted and the audit comes back short. Name the town instead.
     · "how to", "become a", "what qualifications" — dropResearchIntent (RESEARCH_ALWAYS) rejects
       these outright as measuring people who want to ENTER the trade, not hire one.
     · "course", "training", "learn", "lessons", "for beginners", "class" — dropped too unless the
       business actually teaches (isTeachingTrade).
   These are the reason the directive below tells the model to frame a money question as the
   CUSTOMER'S SITUATION rather than as a question about the trade. */

/**
 * The prompt block that teaches the model what a money question is. Returned as text so the
 * calling prompt can position it, and so it is reviewable in one place rather than buried in a
 * template literal three functions deep.
 *
 * @param howMany   how many money questions to produce
 * @param total     the whole question count, so the model knows the remainder are standard
 * @param placeHint the exact place string to use, or '' for a national audit
 */
export function moneyQuestionDirective(howMany: number, total: number, placeHint: string): string {
  if (howMany <= 0) return '';
  const where = placeHint ? ` Write the place EXACTLY as "${placeHint}".` : '';
  return `
MONEY QUESTIONS — ${howMany} of the ${total} MUST be these, the rest standard:
A money question is what a customer types at the moment they are READY TO BUY OR SWITCH — not
researching. Work them out yourself for THIS trade and place; the examples are the PATTERN, not
text to copy. Three types, spread across them:
1. URGENT NEED — they have the problem right now. Pattern: "emergency plumber who can come out
   today in [place]", "locked out of my house in [place] who can come now".
2. SWITCHING / DISSATISFACTION — they have a provider and are unhappy. Pattern: "who should I
   switch to if my accountant only contacts me at year end", "plumber in [place] who actually
   turns up".
3. HIGH-VALUE SPECIFIC JOB — a big or particular piece of work. Pattern: "best accountant in
   [place] for a growing limited company", "locksmith to change all my locks after a break in".

⛔ AVOID LOW-INTENT RESEARCH QUESTIONS — no "how much does X cost", no "what does a Y do". AI
answers those generically and names no businesses, so they measure nothing.
⛔ NEVER write "near me" in any form — it is stripped and the question is lost.${where}
⛔ NEVER phrase one as "how to ...", "become a ...", or ask about qualifications, courses,
training, lessons or classes — those are treated as people wanting to ENTER the trade and are
discarded. Frame it as the CUSTOMER'S SITUATION or NEED instead.
⚠️ These may be LONGER and more conversational than the standard questions — that is correct for
this type, and overrides the "short, terse" instruction for these ${howMany} only.
⚠️ Still exactly ONE intent each, still no business or brand names.`;
}

/* ⛔ THE FALLBACK MATTERS AS MUCH AS THE PROMPT. generateQuestions falls back to a deterministic
   set on ANY failure — no API key, network, non-OK, parse, validation — and the audit still
   COMPLETES, so a silent revert to purely generic questions would be invisible. These templates
   keep the three types represented when OpenAI is unavailable.
   ⚠️ Generic by necessity: a deterministic template cannot know the trade's real pain points, so
   these are the SHAPE with the trade noun swapped in. They are a floor, not a substitute for the
   model's per-business work. */
export function moneyFallbackQuestions(trade: string, place: string, count: number): string[] {
  const t = (trade || 'business').trim();
  const at = place ? ` in ${place}` : '';
  /* ⛔ ORDERED TRADE-AGNOSTIC FIRST, and the order is the whole design of this list. The caller
     takes the first `count` — usually 2 — so whatever leads is what an outage actually produces.
     SWITCHING and HIGH-VALUE read sensibly for every trade; URGENT does not. "emergency accountant
     who can come out today" is nonsense, and a nonsense question measures nothing while still
     costing an Apify call. So the urgent templates sit LAST, reached only by a large audit where
     there is room for them and the trade is more likely to be a call-out one anyway.
     ⚠️ Only the model, which knows the trade, can write a good urgent question — which is why the
     prompt asks for all three types and this floor deliberately does not pretend to. */
  const out = [
    // 2. switching / dissatisfaction — safe for every trade
    `who should I switch to if my ${t} never gets back to me`,
    `${t}${at} to replace one that keeps letting me down`,
    `${t}${at} who actually turns up`,
    // 3. high-value specific — also trade-agnostic
    `most reliable ${t}${at} for important work`,
    `${t}${at} for a bigger job`,
    // 1. urgent need — LAST: only sensible for call-out trades (see the note above)
    `${t}${at} available at short notice`,
    `emergency ${t}${at} who can come out today`,
  ];
  return out.slice(0, Math.max(0, Math.floor(Number(count) || 0)));
}
