/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REPLY-AUDIT SWEEPER — finds the reply audits the held WhatsApp webhook missed, audit only.

   Run: npx tsx scripts/reply-audit-sweep.test.ts

   ⛔ THE ONES THIS EXISTS FOR: an automated first reply (the case the live webhook skips) IS queued;
   a decline at any point, a client, a suppressed or archived lead is NOT; the claim it writes can
   never be a sendable row; the cap fails closed; the guard is firstReplyGuard, not a copy.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  REPLY_AUDIT_SWEEP_DEFAULT_PER_DAY,
  REPLY_AUDIT_SWEEP_REASON,
  firstCountingReplies,
  sweepAllowance,
  sweepDailyCap,
  sweepDecision,
  sweepOrder,
  type SweepMessage,
} from '../src/lib/replyAuditSweep.ts';
import { looksAutomated } from '../src/lib/inboundClassify.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

let n = 0;
const msg = (lead: string, direction: 'inbound' | 'outbound', body: string | null, at: string, status: string | null = direction === 'outbound' ? 'sent' : 'received'): SweepMessage =>
  ({ id: `m${String(++n).padStart(3, '0')}`, lead_id: lead, direction, body, created_at: at, status, wa_message_id: `wamid.${n}`, phone: '447700900123' });

const BOT = "Thank you for your message. We're currently unavailable and will get back to you as soon as possible.";
ok(looksAutomated(BOT), 'fixture: the bot text is an auto-responder');

/* ── which reply counts ── */
{
  const r = firstCountingReplies([
    msg('a', 'outbound', 'opener', '2026-10-01T10:00:00Z'),
    msg('a', 'inbound', '[image]', '2026-10-01T10:01:00Z'),
    msg('a', 'inbound', BOT, '2026-10-01T10:02:00Z'),
    msg('a', 'inbound', 'yes tell me more', '2026-10-01T11:00:00Z'),
  ]);
  ok(r.length === 1 && r[0].body === BOT, 'the first counting reply is the automated one (a placeholder is not)');
  ok(r[0].wamid !== null && r[0].leadId === 'a', 'it carries the wamid and lead');
}
ok(firstCountingReplies([msg('b', 'inbound', 'hello', '2026-10-01T10:00:00Z')]).length === 0, 'no outbound → no reply (inbound-first contact is not a reply)');
ok(firstCountingReplies([
  msg('c', 'outbound', 'opener', '2026-10-01T10:00:00Z', 'failed'),
  msg('c', 'inbound', 'hello', '2026-10-01T10:01:00Z'),
]).length === 0, 'a failed outbound does not begin outreach');
ok(firstCountingReplies([
  msg('d', 'inbound', 'earlier chat', '2026-09-01T10:00:00Z'),
  msg('d', 'outbound', 'opener', '2026-10-01T10:00:00Z'),
]).length === 0, 'an inbound before outreach began is not a reply');

/* ── arm or skip ── */
const lead = { amount_paid: 0, status: 'replied', is_archived: false };
const [botReply] = firstCountingReplies([msg('e', 'outbound', 'opener', '2026-10-01T10:00:00Z'), msg('e', 'inbound', BOT, '2026-10-01T10:05:00Z')]);
ok(sweepDecision({ reply: botReply, lead, suppressed: false }).arm === true, 'THE BUG: an automated first reply is queued');
const [human] = firstCountingReplies([msg('f', 'outbound', 'opener', '2026-10-01T10:00:00Z'), msg('f', 'inbound', 'how much is it?', '2026-10-01T10:05:00Z')]);
ok(sweepDecision({ reply: human, lead, suppressed: false }).arm === true, 'a human reply with no claim is queued too');
const declinedLater = firstCountingReplies([
  msg('g', 'outbound', 'opener', '2026-10-01T10:00:00Z'),
  msg('g', 'inbound', BOT, '2026-10-01T10:05:00Z'),
  msg('g', 'inbound', 'not interested thanks', '2026-10-01T12:00:00Z'),
])[0];
ok(declinedLater.everDeclined, 'a later "not interested" is seen');
const skipReason = (d: ReturnType<typeof sweepDecision>) => (d.arm ? null : d.reason);
ok(skipReason(sweepDecision({ reply: declinedLater, lead, suppressed: false })) === 'declined', 'a lead that ever said no is never audited');
ok(skipReason(sweepDecision({ reply: human, lead, suppressed: true })) === 'suppressed', 'suppressed → skipped');
ok(skipReason(sweepDecision({ reply: botReply, lead, suppressed: true })) === 'suppressed', 'suppressed bot reply → skipped');
ok(skipReason(sweepDecision({ reply: human, lead: { ...lead, is_archived: true }, suppressed: false })) === 'archived', 'archived → skipped');
ok(skipReason(sweepDecision({ reply: human, lead: { ...lead, amount_paid: 99 }, suppressed: false })) === 'client', 'a paying client → skipped');
ok(skipReason(sweepDecision({ reply: human, lead: null, suppressed: false })) === 'client', 'an unreadable lead → skipped (fails closed)');

/* ── order, cap ── */
const ordered = sweepOrder([{ ...human, repliedAt: '2026-10-02T00:00:00Z' }, { ...botReply, repliedAt: '2026-10-05T00:00:00Z' }]);
ok(ordered[0].repliedAt === '2026-10-05T00:00:00Z', 'newest reply first');
ok(sweepDailyCap(50) === 50 && sweepDailyCap(0) === 0, 'the live cap is read as given');
ok([undefined, null, '50', -1, 2.5, NaN].every((v) => sweepDailyCap(v) === 0), 'a missing / malformed cap is 0, never unlimited');
ok(sweepAllowance(50, 48) === 2 && sweepAllowance(50, 70) === 0 && sweepAllowance(0, 0) === 0, 'allowance = cap less the last 24 h');
ok(REPLY_AUDIT_SWEEP_DEFAULT_PER_DAY === 50, 'the default allowance is 50 (Paul, 2026-10-23)');

/* ── the function and the migration ── */
const fn = readFileSync('supabase/functions/reply-audit-sweep/index.ts', 'utf8').replace(/\r\n/g, '\n');
const mig = readFileSync('supabase/migrations/20261126090000_reply_audit_sweep.sql', 'utf8').replace(/\r\n/g, '\n');
const cfg = readFileSync('supabase/config.toml', 'utf8').replace(/\r\n/g, '\n');
ok(/x-cron-secret/.test(fn) && /x-internal-job/.test(fn) && /not_authorised/.test(fn), 'the function is CRON_SECRET-only');
ok(/\[functions\.reply-audit-sweep\]\nverify_jwt = false/.test(cfg), 'config.toml has its verify_jwt entry');
ok(/audit_mode: "audit_only"/.test(fn) && /status: AUDIT_ONLY_STATUS/.test(fn) && !/audit_mode: mode/.test(fn), 'every claim it writes is audit-only (never a sendable row)');
ok(/reason: REPLY_AUDIT_SWEEP_REASON/.test(fn) && /\.eq\("reason", REPLY_AUDIT_SWEEP_REASON\)/.test(fn), 'its claims are marked, and the cap counts that marker');
ok(REPLY_AUDIT_SWEEP_REASON === 'reply_audit_sweep', 'the marker');
ok(/autoReplyEnvOn\(\)/.test(fn) && /modeRunsAudit\(replyMode\)/.test(fn) && /protection !== "running"/.test(fn), 'kill switch, "Do nothing", prospecting pause and emergency stop all stop it');
ok(!/send-whatsapp|sendWhatsApp|functions\/v1\/create-ai-audit/.test(fn), 'it sends nothing and starts no audit itself (the reconciler does)');
ok(!/from "\.\.\/_shared\/first-reply-audit\.ts"/.test(fn), 'it does not import the held webhook\'s closure module');
ok(new RegExp(`reply_audit_sweep_per_day integer not null default ${REPLY_AUDIT_SWEEP_DEFAULT_PER_DAY}`).test(mig), 'the migration default equals the code default');
ok(/cron\.schedule\('reply-audit-sweep-run'/.test(mig) && /where not exists/.test(mig), 'the cron is scheduled once, idempotently');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
