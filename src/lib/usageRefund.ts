/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONLY A REP'S OWN SUCCESSFUL ACTIONS COUNT (Paul, 2026-11-19, v1-rep-limits-own-actions).

   The case: Valentin was told he hit a limit. What counted against him that day: his own clicks (one search, one "Add 41
   leads", one bulk check of 41 leads, 33 WhatsApp sends, 3 AI drafts) — and 6 checks whose audit FAILED, which still used
   6 of his 50 daily checks. The refusal he saw was the per-minute Google lookup limit during "Add 41 leads": the add
   waits and retries by itself and the refused tries never counted, but the screen and the alert read like a hard limit.

   The rule: a rep's limits count ONLY the rep's own actions that worked.
     • Never counted: system retries, self-heal re-runs, hedges, the separate Google AI run, the WhatsApp reply-chain's
       automatic audits (none of these write a guard row in the rep's name — the queue books its Apify runs to the book
       owner), and refused tries (the guard counts 'allowed' / 'warned' rows only).
     • A FAILED attempt is given back: the rep's guard row (api_usage_log, api_type 'guard') for that click is marked
       'refunded' with its estimate zeroed, so every counter that reads the ledger (per-day / per-10-min action limits,
       the person's spend cap, the per-lead audit limit) stops counting it. The daily check allowance also skips failed
       checks.
     • The per-lead audit limit counts the rep's OWN guard rows for that lead (hook audits and checks they pressed), never
       the lead's audits (some of which the system started).
   ⚠️ An audit that fails and later heals itself (src/lib/auditSelfHeal.ts) stays given back: generous, never double.

   Pure. Reached by edge functions: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The rep's clicks that start an AI audit (create-ai-audit 'hook_audit', the bulk check 'sales_check'). */
export const AUDIT_START_ACTIONS: readonly string[] = ['hook_audit', 'sales_check'];
/** The guard row is written moments before the audit row / the item's start stamp; look this far back for it. */
export const REFUND_LOOKBACK_MS = 3 * 60_000;
/** …and this far after (clock skew between the database and the function). */
export const REFUND_LOOKAHEAD_MS = 15_000;
/** Guard outcomes that count against a limit (public.guard_action counts these). */
export const COUNTED_OUTCOMES: readonly string[] = ['allowed', 'warned'];
export const REFUNDED_OUTCOME = 'refunded';

/** The ledger reason on a refunded row. */
export function refundReason(why: string): string {
  return `refunded: ${why}`.slice(0, 200);
}

/** The window [from, to] in which the click's guard row was written. */
export function refundWindow(atIso: string): { fromIso: string; toIso: string } | null {
  const t = Date.parse(atIso);
  if (!Number.isFinite(t)) return null;
  return { fromIso: new Date(t - REFUND_LOOKBACK_MS).toISOString(), toIso: new Date(t + REFUND_LOOKAHEAD_MS).toISOString() };
}

/** "3 of 50 checks used today" — the rep's own line. */
export function usedLine(used: number, limit: number, noun = 'checks'): string {
  return `${Math.max(0, used)} of ${limit} ${noun} used today`;
}

/** The per-lead refusal, in words. */
export function perLeadLimitWords(used: number, limit: number): string {
  return `You've used ${used} of ${limit} audits on this lead today. Failed audits and automatic ones don't count. Open the latest one from the lead.`;
}
