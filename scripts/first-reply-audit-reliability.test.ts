import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FIRST_REPLY_AUDIT_MAX_ATTEMPTS,
  FIRST_REPLY_AUDIT_OPEN_STATUSES,
  auditIntentIsDue,
  auditIntentRetryStatus,
  decideQueuedAuditIntent,
  nextAuditRequest,
  shouldArmFirstReplyAutomation,
} from '../src/lib/firstReplyAutomation.ts';
import { armStatusFor } from '../src/lib/firstReplyMode.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  console.log(`${value ? 'PASS' : 'FAIL'} ${message}`);
  if (!value) failures++;
}

/* ── 1. The arming policy: content-blind, mode-driven ──────────────────────────────────────── */
const enabledFirst = { masterEnabled: true, firstInbound: true, firstInboundReliable: true, archived: false };
// Content is deliberately absent from the policy input. Every persisted valid Meta message follows
// the exact same branch: positive text, a decline, a booking-bot acknowledgement, an emoji or
// reaction, an image, audio or a document.
for (const kind of ['positive text', 'decline text', 'automated acknowledgement', 'emoji', 'reaction', 'image', 'audio', 'document'] as const) {
  ok(shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'audit_only' }), `${kind}: audit-only arms exactly one audit intent`);
  ok(shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'send' }), `${kind}: audit-and-reply arms exactly one audit intent`);
  ok(!shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'off' }), `${kind}: do-nothing arms no audit`);
}
ok(armStatusFor('off', false) === null && armStatusFor('off', true) === null, 'Do nothing writes no reply row either — neither audit nor reply');
ok(!shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'send', firstInbound: false }), 'second inbound (rapid double reply) cannot arm another audit');
ok(!shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'send', firstInboundReliable: false }), 'an unreadable first-inbound lookup fails closed');
ok(!shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'send', archived: true }), 'archived lead is not automated');
ok(!shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'audit_only', masterEnabled: false }), 'the ENV kill-switch still stops everything');
ok(armStatusFor('audit_only', false) === 'audit_only', 'audit-only remains structurally unsendable (sends no reply)');
ok(armStatusFor('send', false) === 'awaiting_audit', 'send mode parks its reply independently of audit execution');

/* ── 2. Due / claim / retry ────────────────────────────────────────────────────────────────── */
const now = Date.parse('2026-09-19T10:00:00Z');
ok(auditIntentIsDue({ status: 'pending', nextAttemptAt: null, claimedAt: null, nowMs: now, staleClaimMs: 300000 }), 'new intent is due for server reconciliation');
ok(!auditIntentIsDue({ status: 'starting', nextAttemptAt: null, claimedAt: new Date(now - 1000).toISOString(), nowMs: now, staleClaimMs: 300000 }), 'active claim is not double-started');
ok(auditIntentIsDue({ status: 'starting', nextAttemptAt: null, claimedAt: new Date(now - 300001).toISOString(), nowMs: now, staleClaimMs: 300000 }), 'stale claim is safely recoverable');
ok(auditIntentIsDue({ status: 'retry_pending', nextAttemptAt: new Date(now - 1).toISOString(), claimedAt: null, nowMs: now, staleClaimMs: 300000 }), 'transient failure retries from persisted state');
ok(!auditIntentIsDue({ status: 'retry_pending', nextAttemptAt: new Date(now + 1).toISOString(), claimedAt: null, nowMs: now, staleClaimMs: 300000 }), 'retry backoff does not spin');
ok(!auditIntentIsDue({ status: 'queued', nextAttemptAt: null, claimedAt: null, nowMs: now, staleClaimMs: 300000 }), 'a queued intent is never re-claimed (no duplicate audit from a concurrent tick)');
ok(!auditIntentIsDue({ status: 'complete', nextAttemptAt: null, claimedAt: null, nowMs: now, staleClaimMs: 300000 }), 'a complete intent is terminal');
ok(!auditIntentIsDue({ status: 'failed', nextAttemptAt: null, claimedAt: null, nowMs: now, staleClaimMs: 300000 }), 'a failed intent is terminal');
ok(auditIntentRetryStatus(1) === 'retry_pending' && auditIntentRetryStatus(FIRST_REPLY_AUDIT_MAX_ATTEMPTS - 1) === 'retry_pending', 'retries stay bounded below the ceiling');
ok(auditIntentRetryStatus(FIRST_REPLY_AUDIT_MAX_ATTEMPTS) === 'failed', 'the attempt ceiling ends in a terminal failed state, error kept');
ok(FIRST_REPLY_AUDIT_OPEN_STATUSES.includes('queued') && !FIRST_REPLY_AUDIT_OPEN_STATUSES.includes('complete') && !FIRST_REPLY_AUDIT_OPEN_STATUSES.includes('failed') && !FIRST_REPLY_AUDIT_OPEN_STATUSES.includes('not_required'), 'the reconciler reads only open statuses');

/* ── 3. Queued intents settle from THEIR audit's runs ──────────────────────────────────────── */
ok(decideQueuedAuditIntent(['complete']) === 'complete', 'associated audit completes → intent complete');
ok(decideQueuedAuditIntent(['capped']) === 'complete', 'a capped run still has answers → complete');
ok(decideQueuedAuditIntent(['running']) === 'wait' && decideQueuedAuditIntent(['pending']) === 'wait' && decideQueuedAuditIntent(['processing']) === 'wait', 'a run legitimately in flight keeps the intent queued');
ok(decideQueuedAuditIntent(['failed']) === 'retry' && decideQueuedAuditIntent(['cancelled', 'failed']) === 'retry', 'associated run failure moves the intent into the retry path');
ok(decideQueuedAuditIntent([]) === 'retry', 'an audit with no runs is recovered rather than waited on forever');
ok(decideQueuedAuditIntent(['failed', 'running']) === 'wait', 'a retry run in flight is waited on');
ok(decideQueuedAuditIntent(['failed', 'complete']) === 'complete', 'a retry run that completed completes the intent');
ok(decideQueuedAuditIntent(['weird_new_status']) === 'wait', 'an unknown run status is treated as in flight, never as a failure that spends another audit');
ok(nextAuditRequest(null) === 'fresh', 'an intent with no audit yet asks for a fresh audit');
ok(nextAuditRequest('11111111-1111-1111-1111-111111111111') === 'rerun', 'an intent whose reply audit exists re-runs THAT audit, never a second one');

/* ── 4. Source-shape guards: the wiring the pure functions cannot see ──────────────────────── */
const root = resolve(import.meta.dirname, '..');
const inbound = readFileSync(resolve(root, 'supabase/functions/_shared/whatsapp-inbound.ts'), 'utf8');
const helper = readFileSync(resolve(root, 'supabase/functions/_shared/first-reply-audit.ts'), 'utf8');
const queue = readFileSync(resolve(root, 'supabase/functions/process-ai-audit-queue/index.ts'), 'utf8');
const createAudit = readFileSync(resolve(root, 'supabase/functions/create-ai-audit/index.ts'), 'utf8');
const drain = readFileSync(resolve(root, 'supabase/functions/process-whatsapp-queue/index.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260919110000_first_reply_audit_intent.sql'), 'utf8');

const active = inbound.slice(inbound.indexOf('export async function handleInboundMessages'), inbound.indexOf('async function legacyHandleInboundMessages'));
ok(active.includes('firstInboundForLead') && active.includes('armFirstReplyAuditIntent'), 'webhook persists then determines first inbound before recording intent');
ok(!/isSubstantiveText|isDecline\(|looksAutomated\(/.test(active), 'active first-reply path does not inspect reply content');
ok(!active.includes('create-ai-audit') && !active.includes('fetch('), 'webhook records intent only; audit/reply execution cannot race each other');
ok(active.includes('code === "23505"') && active.includes('duplicate ${wamid}'), 'duplicate Meta webhook is ignored before automation');

// Toggle independence: the helper may import the env kill-switch but never the reply toggle.
ok(!helper.includes('autoReplyToggleOn'), 'Audit only works with the auto-reply toggle disabled: the helper never reads the toggle');
ok(/const masterEnabled = autoReplyEnvOn\(\);/.test(helper), 'the env kill-switch is the only master gate');

// Fresh audit association.
ok(helper.includes('fresh_audit: true'), 'a new intent asks create-ai-audit for a FRESH audit');
ok(!helper.includes('ai_audit_runs(status)') && !/\.eq\("lead_id", row\.lead_id\)\.order\("created_at"/.test(helper), 'an unrelated existing completed audit on the lead can no longer satisfy the intent');
ok(/audit_id: row\.audit_id \?\? payload\.audit_id/.test(helper), 'the created audit id is persisted on the intent and reconciled against thereafter');
ok(/audit_id: row\.audit_id \}/.test(helper) && helper.includes('nextAuditRequest(row.audit_id)'), 'an already-associated reply audit is re-run, never duplicated');
ok(/const freshAudit: boolean = isInternal && body\.fresh_audit === true;/.test(createAudit), 'create-ai-audit honours fresh_audit for internal callers only');
ok(/&& !isRemeasure && !freshAudit\) \{/.test(createAudit), 'fresh_audit bypasses the per-lead reuse and nothing else');
ok((createAudit.match(/freshAudit/g) ?? []).length === 2, 'fresh_audit touches exactly the declaration and the reuse condition (paid baseline paths untouched)');

// Queued recovery and completion live in the reconciler, on the intent's own audit.
ok(helper.includes('.in("audit_status", [...FIRST_REPLY_AUDIT_OPEN_STATUSES])'), 'terminal intents never occupy the reconciler page');
ok(helper.includes('.select("status").eq("audit_id", row.audit_id)'), 'a queued intent reads the runs of ITS audit only');
ok(helper.includes('.eq("id", row.id).eq("audit_status", "queued")'), 'queued transitions are conditional — concurrent ticks cannot double-act');
ok(helper.includes('audit_status: "starting"') && helper.includes('eq("audit_status", status)'), 'reconciliation atomically claims one job, preventing two rapid replies/ticks');
ok(helper.includes('retryOrFail(') && helper.includes('audit_last_error'), 'create failure is persisted and retried rather than silently lost');
ok(!queue.includes('audit_status: "complete"'), 'the queue processor no longer completes intents inside its env/reply-gated send block');
ok(queue.indexOf('reconcileFirstReplyAuditIntents(service)') < queue.indexOf('if (!apifyToken)'), 'reconciliation runs even when the queue has no current provider token');

// Reply and audit are independent lifecycles.
ok(!drain.includes('audit_required') && !drain.includes('audit_status'), 'the reply drain never writes audit intent fields — a failed send cannot cancel an audit');
ok(helper.includes('has_website: !!website') && helper.includes('ownWebsite'), 'no website is explicit and does not block audit creation');

// Observability.
ok(helper.includes('client_error_reports') && helper.includes('first_reply_arm_failed') && helper.includes('first_reply_mode: ctx.mode'), 'an arming failure is persisted with lead, wamid and mode');
ok(helper.includes('reason: "arm_error"'), 'an arming failure is reported, not thrown past the durable inbound insert');

for (const column of ['audit_required', 'audit_mode', 'audit_status', 'audit_id', 'audit_attempts', 'audit_last_error', 'audit_next_attempt_at', 'audit_claimed_at', 'audit_trigger_message_id']) {
  ok(migration.includes(column), `migration persists ${column}`);
}
if (failures) throw new Error(`${failures} first-reply audit reliability checks failed`);
