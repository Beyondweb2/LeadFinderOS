// replyAuditSweep — the rules of the reply-audit sweeper (fn reply-audit-sweep, 2026-10-23, docs/reply-audit-sweep.md).
//
// WHY IT EXISTS: an automated first WhatsApp reply (a greeting, an away message) now arms an audit-only
// intent (firstReplyGuard). The WhatsApp webhook that does the arming, whatsapp-status, is held at its old
// live version until the Findable cutover, and that version still SKIPS an automated reply. The sweeper
// finds every lead who replied on WhatsApp and has no reply-audit claim at all, and records the same
// once-per-lead claim the webhook would have (whatsapp_auto_replies, unique lead_id). The audit queue's
// existing reconciler (reconcileFirstReplyAuditIntents) then mints the hook audit. Nothing is ever sent.
//
// ⛔ AUDIT ONLY. The claim it writes is audit_mode 'audit_only' whatever the Inbox mode — a late pitch to a
//    lead who replied days ago is not this tool's call.
// ⛔ ONE GUARD SET. Whether a reply may arm is firstReplyGuard's decision, never a second copy here.
// ⛔ A LEAD THAT EVER SAID NO IS SKIPPED, even if its first message was a bot: no audit for a decline.
//
// Edge-reachable: relative imports with an explicit .ts only (CLAUDE.md §3).
import { countsAsAuditTrigger, firstReplyGuard } from './firstReplyAutomation.ts';
import { isDecline } from './inboundClassify.ts';

/** The marker on every claim the sweeper writes (whatsapp_auto_replies.reason). The daily cap counts these. */
export const REPLY_AUDIT_SWEEP_REASON = 'reply_audit_sweep';
/** How far back a WhatsApp reply is looked for. */
export const REPLY_AUDIT_SWEEP_WINDOW_DAYS = 30;
/** The column default the migration seeds (protection_settings.reply_audit_sweep_per_day); the live value is the row.
 *  ⛔ Its own column, NOT a key in protection_settings.limits: validateLimits refuses an unknown key, so a new
 *  action there would break every Security-panel save until security-admin and its closure were redeployed. */
export const REPLY_AUDIT_SWEEP_DEFAULT_PER_DAY = 50;

/** The allowance from the live row. Anything but a non-negative whole number (a missing column, a failed
 *  read, null) is 0 — on a spending path absent means "do not", never "unlimited". */
export function sweepDailyCap(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

export type SweepMessage = {
  id: string;
  lead_id: string;
  direction: string | null;
  body: string | null;
  created_at: string;
  status: string | null;
  wa_message_id: string | null;
  phone: string | null;
};

export type SweepReply = {
  leadId: string;
  /** The first inbound that counts (countsAsAuditTrigger) after the first non-failed outbound. */
  messageId: string;
  wamid: string | null;
  phone: string | null;
  body: string;
  repliedAt: string;
  /** Any inbound from this lead, at any time, reads as a clear no. */
  everDeclined: boolean;
};

const byTime = (a: SweepMessage, b: SweepMessage) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** The reply the webhook would have armed on, per lead — the same "first message that counts after
 *  outreach began" rule as whatsapp-inbound's firstInboundForLead. A lead with no outbound, or no
 *  counting inbound after it, has none. */
export function firstCountingReplies(messages: readonly SweepMessage[]): SweepReply[] {
  const byLead = new Map<string, SweepMessage[]>();
  for (const m of messages) {
    if (!m.lead_id) continue;
    const list = byLead.get(m.lead_id) ?? [];
    list.push(m);
    byLead.set(m.lead_id, list);
  }
  const out: SweepReply[] = [];
  for (const [leadId, list] of byLead) {
    const sorted = [...list].sort(byTime);
    const firstOut = sorted.find((m) => m.direction === 'outbound' && m.status !== 'failed');
    if (!firstOut) continue;
    const inbound = sorted.filter((m) => m.direction === 'inbound');
    const first = inbound.find((m) => byTime(m, firstOut) >= 0 && countsAsAuditTrigger(m.body));
    if (!first) continue;
    out.push({
      leadId,
      messageId: first.id,
      wamid: first.wa_message_id,
      phone: first.phone,
      body: String(first.body ?? ''),
      repliedAt: first.created_at,
      everDeclined: inbound.some((m) => countsAsAuditTrigger(m.body) && isDecline(String(m.body))),
    });
  }
  return out;
}

export type SweepSkip = 'archived' | 'declined' | 'client' | 'not_human_text' | 'suppressed';

/** Arm or skip one lead. The content rules are firstReplyGuard's; the sweeper only adds "archived" and
 *  "ever declined". A guard "decline" is a skip here — the sweeper never suppresses or flags anyone. */
export function sweepDecision(input: {
  reply: SweepReply;
  lead: { amount_paid?: unknown; status?: unknown; is_archived?: unknown } | null;
  suppressed: boolean;
}): { arm: true } | { arm: false; reason: SweepSkip } {
  if (input.lead?.is_archived === true) return { arm: false, reason: 'archived' };
  if (input.reply.everDeclined) return { arm: false, reason: 'declined' };
  const g = firstReplyGuard({ body: input.reply.body, lead: input.lead, suppressed: input.suppressed, lastOutboundTemplate: null });
  if (g.kind === 'arm') return { arm: true };
  if (g.kind === 'decline') return { arm: false, reason: 'declined' };
  return { arm: false, reason: g.reason };
}

/** Newest reply first. The caller stops once it has armed its allowance (a skip spends none of it). */
export function sweepOrder(replies: readonly SweepReply[]): SweepReply[] {
  return [...replies].sort((a, b) => (a.repliedAt < b.repliedAt ? 1 : a.repliedAt > b.repliedAt ? -1 : 0));
}

/** What is left of today's allowance: the cap less the claims the sweeper wrote in the last 24 hours. */
export function sweepAllowance(cap: number, usedLast24h: number): number {
  return Math.max(0, Math.floor(cap) - Math.max(0, Math.floor(usedLast24h)));
}
