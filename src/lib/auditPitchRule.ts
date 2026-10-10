import { modeSends, type FirstReplyMode } from './firstReplyMode.ts';

/* A MANUAL / COMPLETION AUDIT MAY ONLY BE FOLLOWED BY A PITCH WHEN "WHEN A PROSPECT REPLIES" IS "AUDIT AND REPLY" (2026-10-09, Paul).
   Pure; edge-reachable (relative .ts imports only). One rule, read by:
     · create-ai-audit  — whether `queue_pitch_on_complete` may park a pitch at all
     · process-ai-audit-queue — whether a completed audit arms a parked pitch / the audit_complete pitch
     · process-whatsapp-queue — the drain re-checks it at send time (queue_state also tells the Inbox, so its tooltip is true)
     · the Inbox header button — its tooltip, its confirm and its toast
   ⛔ Do nothing and Audit only NEVER send a pitch or report message. Absent / unreadable = no pitch (the safe direction).
   ⛔ A text channel never sends an automatic message, whatever the setting says.
   ⛔ An audit never changes a sales status — this rule is only about a message. */
export type ReplyRule = FirstReplyMode;

/** May a pitch follow an audit on this channel, under this setting? Only audit-and-reply on WhatsApp. */
export function pitchMayFollowAudit(rule: ReplyRule | null | undefined, channel: 'whatsapp' | 'sms' = 'whatsapp'): boolean {
  return channel === 'whatsapp' && rule != null && modeSends(rule);
}

/** The note create-ai-audit returns when it declined to park a pitch because of the setting. */
export function pitchRefusalNote(rule: ReplyRule | null | undefined): 'reply_rule_off' | 'reply_rule_audit_only' | 'reply_rule_unreadable' {
  if (rule === 'off') return 'reply_rule_off';
  if (rule === 'audit_only') return 'reply_rule_audit_only';
  return 'reply_rule_unreadable';
}

export interface AuditButtonState {
  channel: 'whatsapp' | 'sms';
  /** The effective setting: undefined while it is still being read, null when it could not be read. */
  rule: ReplyRule | null | undefined;
  inFlight: boolean;
  inputsMissing: boolean;
  hasCompleted: boolean;
  business?: string;
}

const sends = (s: AuditButtonState) => pitchMayFollowAudit(s.rule, s.channel);
const known = (s: AuditButtonState) => s.channel === 'sms' || s.rule !== undefined && s.rule !== null;

/** The words the Run AI audit button uses, true to what will happen under the CURRENT setting. */
export function auditButtonCopy(s: AuditButtonState): { title: string; confirm: string; startedToast: string; tail: string } {
  const verb = s.hasCompleted ? 'Re-run AI audit' : 'Run AI audit';
  const tail = !known(s)
    ? 'whether a message follows depends on "When a prospect replies" (not read yet)'
    : sends(s) ? 'the report pitch sends when it completes' : 'no message will be sent';
  const title = s.inFlight
    ? `Audit running — ${tail}`
    : s.inputsMissing
      ? `${verb} — needs business type and location (click to fill them in here); ${tail}`
      : `${verb} — ${tail}`;
  const biz = s.business ? ` for ${s.business}` : '';
  const confirm = !known(s)
    ? `${verb}${biz}? Whether a message follows depends on the "When a prospect replies" setting.`
    : sends(s) ? `${verb}${biz}? The report pitch auto-sends when it completes.` : `${verb}${biz}? Nothing is sent to the lead.`;
  const startedToast = sends(s)
    ? 'The report pitch will auto-send when it completes (~10–15 min; declines cancel it).'
    : 'Audit is running (~10–15 min). Nothing is sent to the lead.';
  return { title, confirm, startedToast, tail };
}

/** What the toast says once the server has answered, from what it actually did (never from what we hoped). */
export function auditStartedDescription(res: { pitch_queued?: boolean; pitch_note?: string }, channel: 'whatsapp' | 'sms'): string {
  if (res.pitch_queued) return 'The report pitch will auto-send when it completes (~10–15 min; declines cancel it).';
  if (channel === 'sms') return 'Audit is running (~10–15 min). Nothing is sent to the lead.';
  switch (res.pitch_note) {
    case 'reply_rule_off': return 'Audit is running. Nothing is sent — "When a prospect replies" is on Do nothing.';
    case 'reply_rule_audit_only': return 'Audit is running. Nothing is sent — "When a prospect replies" is on Audit only.';
    case 'reply_rule_unreadable': return 'Audit is running. Nothing is sent — the "When a prospect replies" setting could not be read.';
    case 'lead_archived': return 'Audit is running. No pitch was queued because this lead is archived — un-archive them if you want the pitch to send.';
    case 'slot_already_owned': return 'Audit re-running — a pitch was already sent or parked, so no new pitch will be queued.';
    case undefined: return 'Audit is running (~10–15 min). Nothing is sent to the lead.';
    default: return `Audit is running, but no pitch was queued (${res.pitch_note}).`;
  }
}
