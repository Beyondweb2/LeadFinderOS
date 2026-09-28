import { modeRunsAudit, modeSends, parseFirstReplyMode, type FirstReplyMode } from './firstReplyMode.ts';
import { isDecline, looksAutomated } from './inboundClassify.ts';
import { isClientLead } from './roleRules.ts';
import { isInitialOpener } from './openerVariant.ts';

/* ══ THE REPLY RULE'S ONE SET OF GUARDS (2026-09-28, Paul: "restore the intended protections in the
   canonical current path rather than leaving dead legacy logic") ═══════════════════════════════════
   The live webhook path (handleInboundMessages → armFirstReplyAuditIntent) had kept only the mode,
   the kill-switch, first-inbound and archived. The paying-customer, auto-responder, suppression,
   decline and opener rules lived in the legacy chain nobody calls. They are here now, once, pure,
   for every lead whoever owns it (admin or a salesperson's — nothing reads the rep):
     · a CLIENT (paid, in delivery, completed, refunded) never enters prospect automation — no row
     · a reply that is not human text (a "[image]" placeholder, a one-character reaction) or that
       matches an auto-responder ("out of office", "we'll get back to you") arms nothing — no row, so
       the business's real reply later still counts as their first human one
     · a SUPPRESSED contact arms nothing (the drain would refuse the send anyway; the audit is spend)
     · a clear NO ("not interested", "no thanks", "stop") is suppressed and flagged for a human, and
       gets NO audit and NO pitch — ever
     · everything else arms the audit; an automatic SEND additionally needs the reply to be to one of
       the approved initial openers (isInitialOpener — initial_contact and initial_opener_v2), never
       a reply to a follow-up, a report or a hand-typed message.
   ⛔ POSITIVE MATCHES: `sendAllowed` is true only on a named opener; an unknown last template is not
   an opener. */
export type FirstReplyGuardOutcome =
  | { kind: 'arm'; sendAllowed: boolean }
  | { kind: 'skip'; reason: 'client' | 'not_human_text' | 'auto_responder' | 'suppressed' }
  | { kind: 'decline' };

export function firstReplyGuard(input: {
  body: string;
  lead: { amount_paid?: unknown; status?: unknown } | null;
  suppressed: boolean;
  lastOutboundTemplate: string | null;
}): FirstReplyGuardOutcome {
  if (!input.lead || isClientLead(input.lead)) return { kind: 'skip', reason: 'client' };
  if (!isHumanReplyText(input.body)) return { kind: 'skip', reason: 'not_human_text' };
  if (looksAutomated(input.body)) return { kind: 'skip', reason: 'auto_responder' };
  if (isDecline(input.body)) return { kind: 'decline' };
  if (input.suppressed) return { kind: 'skip', reason: 'suppressed' };
  return { kind: 'arm', sendAllowed: isInitialOpener(input.lastOutboundTemplate) };
}

/** Human text — not bodyFor()'s "[type]" placeholder and not a lone character. */
export function isHumanReplyText(body: string | null | undefined): boolean {
  const t = (body ?? '').trim();
  if (t.length < 2) return false;
  if (t.startsWith('[') && t.endsWith(']')) return false;
  return true;
}

/** Does this inbound count toward "their first reply"? Human text that is not an auto-responder. */
export function countsAsFirstReply(body: string | null | undefined): boolean {
  return isHumanReplyText(body) && !looksAutomated(body ?? '');
}

/* ⛔ "DO NOTHING" MEANS NOTHING (Paul, 2026-09-28). The Inbox's three-way control stores Off as
   auto_reply_enabled = false and keeps first_reply_mode as the remembered working behaviour (the
   database cannot store 'off'). Arming read the mode alone, so with the control on "Do nothing" every
   first reply still started an audit. The effective mode is the control's reading: not explicitly
   enabled → 'off'. An unreadable toggle is therefore off too — the direction that spends and sends
   nothing. */
export function effectiveFirstReplyMode(autoReplyEnabled: unknown, storedMode: unknown): FirstReplyMode {
  return autoReplyEnabled === true ? parseFirstReplyMode(storedMode) : 'off';
}

/** Send mode only sends on a reply to an opener; anything else runs the audit and sends nothing. */
export function modeForReply(mode: FirstReplyMode, sendAllowed: boolean): FirstReplyMode {
  return modeSends(mode) && !sendAllowed ? 'audit_only' : mode;
}

/**
 * Pure first-reply policy shared by the webhook and tests. The CONTENT rules (client, decline,
 * auto-responder, suppression, opener) are firstReplyGuard above, applied before this.
 *
 * `masterEnabled` is the ENV kill-switch only (AUTO_AUDIT_REPLY_ENABLED). `mode` is the EFFECTIVE
 * mode (effectiveFirstReplyMode): the Inbox control's "Do nothing" is 'off' here (2026-09-28 — the
 * 2026-09-20 note that the toggle was not an input predates the three-way control, whose Off IS the
 * toggle; both working modes set it on, so "Run audit only" still audits).
 */
export function shouldArmFirstReplyAutomation(input: {
  mode: FirstReplyMode;
  masterEnabled: boolean;
  firstInbound: boolean;
  firstInboundReliable: boolean;
  archived: boolean;
}): boolean {
  return input.masterEnabled && input.firstInboundReliable && input.firstInbound &&
    !input.archived && modeRunsAudit(input.mode);
}

/**
 * The audit-intent lifecycle on whatsapp_auto_replies.audit_status.
 *   not_required → nothing to do (row belongs to another trigger, or the mode was off)
 *   pending      → recorded by the webhook, not yet claimed
 *   starting     → claimed by one reconciliation tick (stale after CLAIM_STALE_MS)
 *   queued       → create-ai-audit accepted; audit_id is OUR reply audit; waiting on its run(s)
 *   retry_pending→ creation failed, or the reply audit's run failed; due at audit_next_attempt_at
 *   complete     → a run of the reply audit settled complete/capped
 *   failed       → FIRST_REPLY_AUDIT_MAX_ATTEMPTS creation attempts spent; terminal, error kept
 */
export type FirstReplyAuditStatus =
  | 'not_required'
  | 'pending'
  | 'starting'
  | 'queued'
  | 'complete'
  | 'retry_pending'
  | 'failed';

/** Statuses the reconciler still owns. Terminal rows are excluded from its query so they can never
 *  fill the page limit and hide a due one. */
export const FIRST_REPLY_AUDIT_OPEN_STATUSES: readonly FirstReplyAuditStatus[] =
  ['pending', 'starting', 'queued', 'retry_pending'];

/** How many times create-ai-audit may be asked for one reply before the intent is marked failed.
 *  Each attempt is a real hook audit (~3p), so this is a spend ceiling, not a preference. */
export const FIRST_REPLY_AUDIT_MAX_ATTEMPTS = 5;

/** Whether a persisted audit intent may be atomically claimed by the reconciliation tick. */
export function auditIntentIsDue(input: {
  status: FirstReplyAuditStatus;
  nextAttemptAt: string | null;
  claimedAt: string | null;
  nowMs: number;
  staleClaimMs: number;
}): boolean {
  if (input.status === 'pending') return true;
  if (input.status === 'retry_pending') {
    return !input.nextAttemptAt || Date.parse(input.nextAttemptAt) <= input.nowMs;
  }
  if (input.status === 'starting') {
    return !!input.claimedAt && Date.parse(input.claimedAt) <= input.nowMs - input.staleClaimMs;
  }
  return false;
}

/* ai_audit_runs.status values, enumerated on purpose (CLAUDE.md §4: never let `else` carry the
   absent case). A status this list does not know is treated as still in flight — the row stays
   visibly `queued` with its audit_id — rather than as a failure that would spend another audit. */
const RUN_SETTLED_OK = new Set(['complete', 'capped']);
const RUN_SETTLED_BAD = new Set(['failed', 'cancelled']);
const RUN_ACTIVE = new Set(['pending', 'queued', 'running', 'processing']);

/**
 * What a `queued` intent should do given the run statuses of ITS OWN reply audit (audit_id).
 *   complete → some run settled with answers
 *   wait     → a run is still in flight (or an unknown status is present)
 *   retry    → the audit has no runs, or every run it has failed/cancelled
 * ⛔ Only the associated audit's runs are consulted. An unrelated earlier audit on the same lead
 * (the drip's pre-send hook audit, a wizard audit) must never satisfy a reply's intent.
 */
export function decideQueuedAuditIntent(runStatuses: readonly string[]): 'complete' | 'wait' | 'retry' {
  const statuses = runStatuses.map((s) => String(s ?? '').toLowerCase());
  if (statuses.some((s) => RUN_SETTLED_OK.has(s))) return 'complete';
  if (statuses.length === 0) return 'retry';
  if (statuses.every((s) => RUN_SETTLED_BAD.has(s))) return 'retry';
  if (statuses.some((s) => RUN_ACTIVE.has(s))) return 'wait';
  return 'wait';
}

/** After a failed attempt: retry with backoff, or stop once the attempt ceiling is reached. */
export function auditIntentRetryStatus(
  attempts: number,
  maxAttempts: number = FIRST_REPLY_AUDIT_MAX_ATTEMPTS,
): 'retry_pending' | 'failed' {
  return attempts >= maxAttempts ? 'failed' : 'retry_pending';
}

/* Every create-ai-audit request a claimed intent makes is a FRESH hook audit (2026-09-20). A retry
   after a failed run does not add run 2 to the failed audit — a hook audit never accumulates runs
   (src/lib/hookAudit.ts) — it mints a new one and the intent's audit_id is repointed at it. */
