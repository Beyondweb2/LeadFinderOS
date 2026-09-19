import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  auditIntentIsDue,
  shouldArmFirstReplyAutomation,
} from '../src/lib/firstReplyAutomation.ts';
import { armStatusFor } from '../src/lib/firstReplyMode.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  console.log(`${value ? 'PASS' : 'FAIL'} ${message}`);
  if (!value) failures++;
}

const enabledFirst = { masterEnabled: true, firstInbound: true, firstInboundReliable: true, archived: false };

// Content is deliberately absent from the policy input. Every persisted valid Meta message follows
// the exact same branch, including an empty-body media attachment or a one-character emoji.
for (const kind of ['yes', 'no thanks', 'emoji', 'image', 'audio', 'document'] as const) {
  ok(shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'audit_only' }), `${kind}: audit-only arms exactly one audit intent`);
  ok(shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'send' }), `${kind}: audit-and-reply arms exactly one audit intent`);
}
ok(!shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'off' }), 'Do nothing never arms an audit');
ok(!shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'send', firstInbound: false }), 'second inbound cannot arm another audit');
ok(!shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'send', firstInboundReliable: false }), 'an unreadable first-inbound lookup fails closed');
ok(!shouldArmFirstReplyAutomation({ ...enabledFirst, mode: 'send', archived: true }), 'archived lead is not automated');
ok(armStatusFor('audit_only', false) === 'audit_only', 'audit-only remains structurally unsendable');
ok(armStatusFor('send', false) === 'awaiting_audit', 'send mode parks its reply independently of audit execution');

const now = Date.parse('2026-09-19T10:00:00Z');
ok(auditIntentIsDue({ status: 'pending', nextAttemptAt: null, claimedAt: null, nowMs: now, staleClaimMs: 300000 }), 'new intent is due for server reconciliation');
ok(!auditIntentIsDue({ status: 'starting', nextAttemptAt: null, claimedAt: new Date(now - 1000).toISOString(), nowMs: now, staleClaimMs: 300000 }), 'active claim is not double-started');
ok(auditIntentIsDue({ status: 'starting', nextAttemptAt: null, claimedAt: new Date(now - 300001).toISOString(), nowMs: now, staleClaimMs: 300000 }), 'stale claim is safely recoverable');
ok(auditIntentIsDue({ status: 'retry_pending', nextAttemptAt: new Date(now - 1).toISOString(), claimedAt: null, nowMs: now, staleClaimMs: 300000 }), 'transient failure retries from persisted state');
ok(!auditIntentIsDue({ status: 'retry_pending', nextAttemptAt: new Date(now + 1).toISOString(), claimedAt: null, nowMs: now, staleClaimMs: 300000 }), 'retry backoff does not spin');

const root = resolve(import.meta.dirname, '..');
const inbound = readFileSync(resolve(root, 'supabase/functions/_shared/whatsapp-inbound.ts'), 'utf8');
const helper = readFileSync(resolve(root, 'supabase/functions/_shared/first-reply-audit.ts'), 'utf8');
const queue = readFileSync(resolve(root, 'supabase/functions/process-ai-audit-queue/index.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260919110000_first_reply_audit_intent.sql'), 'utf8');
const active = inbound.slice(inbound.indexOf('export async function handleInboundMessages'), inbound.indexOf('async function legacyHandleInboundMessages'));

ok(active.includes('firstInboundForLead') && active.includes('armFirstReplyAuditIntent'), 'webhook persists then determines first inbound before recording intent');
ok(!/isSubstantiveText|isDecline\(|looksAutomated\(/.test(active), 'active first-reply path does not inspect reply content');
ok(!active.includes('create-ai-audit') && !active.includes('fetch('), 'webhook records intent only; audit/reply execution cannot race each other');
ok(active.includes('code === "23505"') && active.includes('duplicate ${wamid}'), 'duplicate Meta webhook is ignored before automation');
ok(helper.includes('audit_required: true') && helper.includes('audit_status: "pending"'), 'first reply creates durable audit-required state before work');
ok(helper.includes('audit_pending_existing_reply_row') && helper.includes('neq("audit_required", true)'), 'a pre-existing non-audit reply row is promoted instead of hiding a required audit');
ok(helper.includes('eq("audit_status", status)') && helper.includes('audit_status: "starting"'), 'reconciliation atomically claims one job, preventing two rapid replies/ticks');
ok(helper.includes('audit_status: "retry_pending"') && helper.includes('audit_last_error'), 'create failure is persisted and retried rather than silently lost');
ok(helper.includes('has_website: !!website') && helper.includes('ownWebsite'), 'no website is explicit and does not block audit creation');
ok(helper.includes('replyIsWaiting') && helper.includes('fire_after'), 'reconciliation can recover a completed audit even if its completion hook was missed');
ok(queue.indexOf('reconcileFirstReplyAuditIntents(service)') < queue.indexOf('if (!apifyToken)'), 'reconciliation runs even when the queue has no current provider token');
for (const column of ['audit_required', 'audit_mode', 'audit_status', 'audit_id', 'audit_attempts', 'audit_last_error', 'audit_next_attempt_at', 'audit_claimed_at', 'audit_trigger_message_id']) {
  ok(migration.includes(column), `migration persists ${column}`);
}

if (failures) throw new Error(`${failures} first-reply audit reliability checks failed`);
