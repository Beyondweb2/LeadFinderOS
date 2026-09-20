import { modeRunsAudit, type FirstReplyMode } from './firstReplyMode.ts';

/**
 * Pure first-reply policy shared by the webhook and tests.  It deliberately receives no message
 * body or message type: once Meta has supplied and we have persisted a valid inbound message, its
 * content must not change whether the selected mode asks for an audit.
 *
 * `masterEnabled` is the ENV kill-switch only (AUTO_AUDIT_REPLY_ENABLED). ⛔ The Inbox auto-reply
 * toggle is NOT an input here (Paul, 2026-09-20): it governs whether a reply is SENT and is read by
 * the drain at send time. Feeding it in as well meant "Run audit only" silently produced no audit
 * whenever the reply toggle happened to be off — the mode is the behavioural source of truth.
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
