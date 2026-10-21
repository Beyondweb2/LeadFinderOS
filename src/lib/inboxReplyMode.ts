/* THE INBOX REPLY MODE (2026-10-21, Paul). Record: docs/ai-handles-replies.md "One mode".
   ONE answer replaces "When a prospect replies" (Do nothing / Audit only / Audit and reply) and the "AI handles replies"
   switch. Stored as whatsapp_outreach_state.ai_reply_mode; the old columns are kept in step by the database
   (trg_inbox_reply_mode_sync, migration 20261117090000), so every reader of them stays true.
     · manual — nothing automatic on a reply: no audit, no draft. Needs you flags still run (rules only, no model).
     · draft  — the reply audit runs and every reply gets a draft that waits for Approve & send.
     · auto   — as draft, and a draft whose reply type an admin switched on may send itself (src/lib/aiAutoSend.ts).
   ⛔ "Audit and reply" is RETIRED: nothing sends the old template reply automatically (the database refuses the value).
   ⛔ ABSENT / UNKNOWN = 'manual' for what HAPPENS (nothing drafted, nothing sent) — but the bot answer reads an unreadable
      mode as Auto (botMaySaySendsEveryOne false): it never claims a person sent every message when it cannot know.
   Pure; edge-reachable (no imports, no Deno, no DOM). */

export const INBOX_REPLY_MODES = ['manual', 'draft', 'auto'] as const;
export type InboxReplyMode = typeof INBOX_REPLY_MODES[number];

export const INBOX_REPLY_MODE_LABELS: Record<InboxReplyMode, string> = {
  manual: 'Manual',
  draft: 'Draft for approval',
  auto: 'Auto',
};

export const INBOX_REPLY_MODE_QUESTION = 'When a prospect replies';

export const INBOX_REPLY_MODE_HINTS: Record<InboxReplyMode, string> = {
  manual: 'Nothing is drafted and no audit runs. You read and answer every reply yourself. Stops and complaints are still flagged.',
  draft: 'A reply runs the audit if they have none, then gets an AI draft marked Needs approving. Nothing is sent until you press Approve & send.',
  auto: 'As Draft for approval, and a confident reply of a type you switch on below sends itself 3 to 8 minutes later. Anything unsure waits for your approval.',
};

/** Read a stored mode. Anything absent, blank or unrecognised is 'manual' (nothing happens). */
export function parseInboxReplyMode(raw: unknown): InboxReplyMode {
  const t = typeof raw === 'string' ? raw.trim() : '';
  return (INBOX_REPLY_MODES as readonly string[]).includes(t) ? (t as InboxReplyMode) : 'manual';
}

/** Does a reply get an AI draft? Draft for approval and Auto. */
export const modeDrafts = (m: InboxReplyMode): boolean => m === 'draft' || m === 'auto';

/** May a draft ever send itself? ONLY Auto (positive). */
export const modeMayAutoSend = (m: InboxReplyMode): boolean => m === 'auto';

/** May the "is this a bot?" answer say "I read and send every one myself"? Only when a person sends every message:
 *  Manual or Draft for approval, read from a stored value. Unreadable (null / undefined) = no. */
export function botMaySaySendsEveryOne(raw: string | null | undefined): boolean {
  return raw === 'manual' || raw === 'draft';
}
