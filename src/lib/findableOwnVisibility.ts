/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FINDABLE'S OWN AI VISIBILITY — THE FROZEN QUESTION SET (v1, approved by Paul 2026-10-02).

   Findable sells AI visibility, so it measures its own. This is an INTERNAL baseline: never published,
   never a vanity score, never part of any client methodology.

   ⛔ FROZEN. These twelve are the exact approved wording (findable-site docs/findable-own-visibility-
   audit.md, "Follow-up"). They are not edited, reordered, swapped or "improved" after any result has
   been seen; that is how a measurement turns into a flattering one. A change is a NEW VERSION (v2)
   with its own baseline, and v1 results are never compared against v2 results.
   ⛔ THE BRANDED DIAGNOSTICS ARE NOT SCORED. They ask about Findable by name, so of course an engine
   that answers them "names" Findable. They exist only to check whether the description an engine
   gives is ACCURATE (UK, local businesses, ChatGPT/Gemini measurement, four-week re-measure, the
   money-back guarantee, founder Paul Sales, not confused with another company called Findable).
   OWN_VISIBILITY_SCORED_QUESTIONS is the only list any visibility number may be computed over
   (scripts/findable-own-visibility.test.ts asserts the two never overlap).
   ⚠️ NAME COLLISION. Another company (findableapp.com) sells AI visibility software as "Findable".
   A plain name match would count THEIR mentions as ours. Naming must be judged as "Findable at
   findable.live / the UK local-business service", by the model verdict, never a bare string match.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const OWN_VISIBILITY_SET_VERSION = 'v1' as const;
export const OWN_VISIBILITY_FROZEN_ON = '2026-10-02';

/** Scored engines: the same two as every Findable measurement (SCORED_ENGINES). */
export const OWN_VISIBILITY_ENGINES = ['chatgpt', 'gemini'] as const;
/** Repeat runs per question, as in a client baseline: one answer is an anecdote. */
export const OWN_VISIBILITY_RUNS = 3;

/** NEUTRAL DISCOVERY QUESTIONS — the only ones that may ever be scored. Exact approved wording. */
export const OWN_VISIBILITY_SCORED_QUESTIONS = [
  'Who can help get my small business recommended by ChatGPT in the UK?',
  'How do I get my plumbing business to show up when people in the UK ask ChatGPT for a plumber?',
  'What does it mean for a local business to show up in AI answers, and who in the UK can help with it?',
  'What are the best AI SEO services for small businesses in the UK?',
  'Is there a service that checks whether ChatGPT recommends my business?',
  'Is there a GEO agency for local businesses in the UK?',
  "How can a locksmith in the UK get mentioned in Google's AI Overviews?",
  'Who offers affordable AI search optimisation for tradespeople in the UK?',
  'How can I find out if Gemini recommends my business?',
  'How much does it cost to get my business recommended by AI assistants in the UK?',
  'How do I get my accountancy firm in the UK recommended by AI assistants?',
  'Do I need a new website to be recommended by ChatGPT?',
] as const;

/** BRANDED DIAGNOSTIC QUESTIONS — accuracy checks only. NEVER scored, never in a success claim. */
export const OWN_VISIBILITY_BRANDED_DIAGNOSTICS = [
  'What is Findable at findable.live, and who runs it?',
  'What does Findable at findable.live cost, and what is its guarantee?',
] as const;

/** What a correct branded answer must say (for reading the diagnostics, not for scoring). */
export const OWN_VISIBILITY_ACCURATE_FACTS = [
  'UK', 'local businesses', 'measures whether ChatGPT and Gemini name a business', 're-measures after four weeks',
  'money back if the measured number has not gone up', 'founder Paul Sales', 'findable.live (not another company called Findable)',
] as const;

/** Forecast cost of one full v1 measurement, in USD, from the observed per-question rate the
 *  operator app already forecasts with (RE_AUDIT_EST_USD_PER_QUESTION, reAudit.ts). One ask answers
 *  both engines, so the count is questions × runs. */
export function ownVisibilityRunCostUsd(perQuestionUsd: number, opts: { includeBranded?: boolean; brandedRuns?: number } = {}): number {
  const scored = OWN_VISIBILITY_SCORED_QUESTIONS.length * OWN_VISIBILITY_RUNS;
  const branded = opts.includeBranded ? OWN_VISIBILITY_BRANDED_DIAGNOSTICS.length * (opts.brandedRuns ?? 1) : 0;
  return Math.round((scored + branded) * perQuestionUsd * 10_000) / 10_000;
}
