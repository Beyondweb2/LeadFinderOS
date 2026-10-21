/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "NAMED OTHERS INSTEAD" ONLY WHEN IT IS TRUE OF MOST ANSWERS (Paul, 2026-10-20).

   Several approved templates say AI named other businesses instead of the prospect ("it's naming X, not you",
   "it mentioned X", "others are getting picked ahead of you"). That claim may go only when the business was named
   in AT MOST A THIRD of the audit's valid stored answers. The template TEXT is never edited; this decides WHO gets it.
   The send-side check is in _shared/audit-reply.ts resolveAuditReplyVars (every audit-class door goes through it);
   the reply drafter asks mayClaimNamedInstead too (replyMove.ts).
   scripts/named-share-rule.test.ts sweeps the template bodies: a body making the claim must be in the set.
   Pure, no imports: edge-reachable.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The approved templates whose body claims AI named others instead of the prospect. */
export const NAMED_INSTEAD_TEMPLATES: ReadonlySet<string> = new Set([
  'audit_reply', 'audit_result_hook', 'audit_reply_warm', 'competitor_hook',
  'audit_followup', 'audit_followup_call', 'audit_followup_fault',
  'ai_site_findings_v2', 'ai_visibility_report_offer', 'hook_followup',
]);

/** THE ONE COUNT this rule reads. ⛔ CHATGPT IS NOT COUNTED (Paul, 2026-10-21, GSI Driving School: ChatGPT 2/2, Gemini 1/2,
 *  Google AI 0/1 read 3 of 5 and lost the claim; it is 1 of 3). Gemini's valid answers, plus Google AI wherever Google showed an
 *  AI answer and the audit scores it (scored.googleAi.inScore — audits from GOOGLE_AI_SCORED_SINCE). "No AI answer shown" is
 *  left out, never a miss. Null until the score is complete, or when neither engine gave an answer. Both the template send
 *  gate and the reply drafter read it (was the whole displayed score, 2026-10-20). */
export function namedShareOf(s: {
  complete: boolean;
  perEngine?: ReadonlyArray<{ engine: string; named: number; valid: number }> | null;
  scored: { named: number; expected: number; googleAi?: { shown: number; named: number; inScore: boolean } | null };
} | null | undefined): { named: number; total: number } | null {
  if (!s || !s.complete) return null;
  let named = 0; let total = 0;
  for (const t of s.perEngine ?? []) {
    if (t.engine === 'chatgpt' || t.engine === 'ai_overview') continue;
    named += Math.max(0, t.named); total += Math.max(0, t.valid);
  }
  const g = s.scored.googleAi;
  if (g && g.inScore && g.shown > 0) { named += Math.max(0, g.named); total += g.shown; }
  return total > 0 ? { named, total } : null;
}

/** ⛔ POSITIVE: the claim is allowed only with counts on record, at least one valid answer, and named ≤ a third.
 *  Unknown counts never allow it. */
export function mayClaimNamedInstead(named: number | null | undefined, valid: number | null | undefined): boolean {
  if (typeof named !== 'number' || typeof valid !== 'number' || !Number.isFinite(named) || !Number.isFinite(valid)) return false;
  if (valid <= 0 || named < 0) return false;
  return named * 3 <= valid;
}

/** The refusal text for a send door (starts with the caller's no-gap prefix so existing fallbacks treat it alike). */
export function namedShareRefusal(business: string, named: number, valid: number): string {
  return `the AI check named ${business || 'this business'} in ${named} of ${valid} valid answers (more than a third), ` +
    'so a message saying AI named others instead would not be true. Pick a template that does not claim that.';
}
