import { OUTREACH_HOOK_QUESTIONS } from './auditQuestionCounts.ts';

/* THE REVIEWED HOOK QUESTIONS (2026-09-28, Paul: "both roles can edit them before pressing Run").
   The system proposes the three from the lead (create-ai-audit's own preview, finalHookPlan); the
   operator may reword any of them. Editing changes the WORDS only, never the method: still exactly
   OUTREACH_HOOK_QUESTIONS questions, still both engines, still one run — create-ai-audit re-plans the
   three it receives through finalHookPlan, which keeps them verbatim when there are three distinct
   ones. So the check here is the one thing the server would otherwise quietly repair: a blank or a
   repeated question would be topped up with a generic one the operator never saw. */

export const HOOK_QUESTION_MAX_CHARS = 200;

export type ReviewedHookQuestions =
  | { ok: true; questions: string[] }
  | { ok: false; reason: string };

export function reviewedHookQuestions(input: ReadonlyArray<string | null | undefined>): ReviewedHookQuestions {
  const qs = input.map((q) => (typeof q === 'string' ? q.replace(/\s+/g, ' ').trim() : ''));
  if (qs.length !== OUTREACH_HOOK_QUESTIONS) return { ok: false, reason: `The check asks exactly ${OUTREACH_HOOK_QUESTIONS} questions.` };
  const blank = qs.findIndex((q) => !q);
  if (blank >= 0) return { ok: false, reason: `Question ${blank + 1} is empty.` };
  const long = qs.findIndex((q) => q.length > HOOK_QUESTION_MAX_CHARS);
  if (long >= 0) return { ok: false, reason: `Question ${long + 1} is too long — keep it to one customer-style question.` };
  const seen = new Set<string>();
  for (let i = 0; i < qs.length; i++) {
    const k = qs[i].toLowerCase();
    if (seen.has(k)) return { ok: false, reason: `Question ${i + 1} repeats another one.` };
    seen.add(k);
  }
  return { ok: true, questions: qs };
}
