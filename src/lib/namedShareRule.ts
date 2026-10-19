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
