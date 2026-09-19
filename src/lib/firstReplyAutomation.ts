import { modeRunsAudit, type FirstReplyMode } from './firstReplyMode.ts';

/**
 * Pure first-reply policy shared by the webhook and tests.  It deliberately receives no message
 * body or message type: once Meta has supplied and we have persisted a valid inbound message, its
 * content must not change whether the selected mode asks for an audit.
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

export type FirstReplyAuditStatus =
  | 'not_required'
  | 'pending'
  | 'starting'
  | 'queued'
  | 'complete'
  | 'retry_pending';

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
