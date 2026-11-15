/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PER-CAMPAIGN "RUN AUDIT WHEN THEY REPLY" (Paul, 2026-11-15).
   campaigns.audit_on_reply, default ON. When OFF, a reply from a lead in that campaign starts no website check
   and no AI audit, on WhatsApp or SMS. Manual audits still work. Inbox settings › "Audit after first reply"
   keeps its main switch and lists the campaigns skipped.
   ⛔ Read where the audit is CREATED (_shared/first-reply-audit.ts reconcileFirstReplyAuditIntents, the
   process-ai-audit-queue cron), never in whatsapp-status (held): every reply path — the WhatsApp webhook, the
   SMS webhook and the missed-reply sweep — only records an intent, and this cron is the one place it becomes
   an audit. A missing value (an older row, a lead with no campaign) means ON.
   Pure. IMPORTED BY AN EDGE FUNCTION: relative imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const RUN_AUDIT_ON_REPLY_LABEL = 'Run audit when they reply';
export const RUN_AUDIT_ON_REPLY_HINT = 'When a prospect in this campaign replies, check their website and run the AI audit. Off: nothing runs on a reply; you can still run an audit by hand.';

/** Does a reply in this campaign skip the reply-triggered audit? Only an explicit false skips. */
export function campaignSkipsReplyAudit(c: { audit_on_reply?: boolean | null } | null | undefined): boolean {
  return !!c && c.audit_on_reply === false;
}

/** The intent's recorded reason when the campaign skips it. */
export function replyAuditSkippedReason(campaignName: string | null | undefined): string {
  return `Skipped: the campaign "${String(campaignName ?? 'this campaign').trim()}" has "${RUN_AUDIT_ON_REPLY_LABEL}" off.`;
}

/** "Skipped for: A, B" — the Inbox setting's line, or null when no live campaign skips. */
export function skippedForLine(campaigns: { name: string; audit_on_reply?: boolean | null; archived_at?: string | null }[]): string | null {
  const names = campaigns.filter((c) => !c.archived_at && campaignSkipsReplyAudit(c)).map((c) => c.name.trim()).filter(Boolean);
  return names.length ? `Skipped for: ${names.join(', ')}` : null;
}
