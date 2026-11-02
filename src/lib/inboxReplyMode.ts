/* THE INBOX REPLY MODE (2026-10-21, Paul). Record: docs/ai-handles-replies.md "One mode".
   ONE answer replaces "When a prospect replies" (Do nothing / Audit only / Audit and reply) and the "AI handles replies"
   switch. Stored as whatsapp_outreach_state.ai_reply_mode; the old columns are kept in step by the database
   (trg_inbox_reply_mode_sync, migration 20261117090000), so every reader of them stays true.
     · manual — no draft. Needs you flags still run (rules only, no model).
     · draft  — every reply gets a draft that waits for Approve & send.
     (Whether the reply AUDIT runs is the separate "Audit after first reply" switch since 2026-10-22.)
     ⛔ AUTO IS RETIRED (Paul, 2026-11-02): an AI-written reply never sends itself; every one needs a person's approval. It cannot be
        chosen any more, the server refuses it, and a stored 'auto' reads as Draft for approval. src/lib/aiAutoSend.ts is left as it is,
        with nothing able to switch it on (modeMayAutoSend below).
   ⛔ "Audit and reply" is RETIRED: nothing sends the old template reply automatically (the database refuses the value).
   ⛔ ABSENT / UNKNOWN = 'manual' for what HAPPENS (nothing drafted, nothing sent) — but the bot answer reads an unreadable
      mode as Auto (botMaySaySendsEveryOne false): it never claims a person sent every message when it cannot know.
   Pure; edge-reachable (no imports, no Deno, no DOM). */

export const INBOX_REPLY_MODES = ['manual', 'draft'] as const;
export type InboxReplyMode = typeof INBOX_REPLY_MODES[number];

export const INBOX_REPLY_MODE_LABELS: Record<InboxReplyMode, string> = {
  manual: 'Manual',
  draft: 'Draft for approval',
};

export const INBOX_REPLY_MODE_QUESTION = 'AI replies';

/* 2026-10-22 (Paul): the mode decides DRAFTING only. The audit on a first reply is its own switch (REPLY_AUDIT_*, below;
   whatsapp_outreach_state.reply_audit_enabled, migration 20261124120000). Manual no longer turns the audit off. */
export const INBOX_REPLY_MODE_HINTS: Record<InboxReplyMode, string> = {
  manual: 'Nothing is drafted. You read and answer every reply yourself. Stops and complaints are still flagged.',
  draft: 'Every reply gets an AI draft in the thread, marked Needs approval. Nothing is sent until you press Approve & send.',
};

export const REPLY_AUDIT_QUESTION = 'Audit after first reply';
export const REPLY_AUDIT_HINT = 'When a prospect first replies, run the website check and the AI audit if they have none. Works whatever the AI replies setting is.';
/** Shown when AI replies drafts but the audit is off: the first-reply pitch waits for audit evidence and is never written without it. */
export const REPLY_AUDIT_OFF_PITCH_HINT = 'The audit is off, so a first-reply pitch is only drafted for leads that already have an audit. The others show Needs you.';
/** True when the hint above applies. */
export const pitchNeedsAuditHint = (mode: InboxReplyMode, auditOn: boolean | null): boolean => modeDrafts(mode) && auditOn === false;

/** Read a stored mode. Anything absent, blank or unrecognised is 'manual' (nothing happens). A leftover 'auto' only drafts. */
export function parseInboxReplyMode(raw: unknown): InboxReplyMode {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (t === 'auto') return 'draft';
  return (INBOX_REPLY_MODES as readonly string[]).includes(t) ? (t as InboxReplyMode) : 'manual';
}

/** Does a reply get an AI draft? Draft for approval. */
export const modeDrafts = (m: InboxReplyMode): boolean => m === 'draft';

/** May a draft ever send itself? NEVER (Paul, 2026-11-02). */
export const modeMayAutoSend = (_m: InboxReplyMode): boolean => false;

/** May the "is this a bot?" answer say "I read and send every one myself"? Only when a person sends every message:
 *  Manual or Draft for approval, read from a stored value. Unreadable (null / undefined) = no. */
export function botMaySaySendsEveryOne(raw: string | null | undefined): boolean {
  return raw === 'manual' || raw === 'draft';
}
