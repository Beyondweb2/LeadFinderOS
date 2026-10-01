/* ════════════════════════════════════════════════════════════════════════════════════════════════
   GROUPED NOTIFICATIONS (2026-10-01, docs/outreach-workspace.md). Paul: "I do NOT want one visible card per
   reply … '6 new replies from 4 businesses' … The bell badge should represent actionable unread
   conversations/items rather than the number of rendered cards."
   - WhatsApp replies are ONE card, counted from the Inbox's own unread truth (my_whatsapp_unread_counts:
     per person, per number, since that person last opened it). Opening the conversation lowers it; a
     reassigned lead leaves it. The stored whatsapp_reply rows are kept (they fire desktop alerts and are
     history) but are never drawn one by one and never counted.
   - The badge = unread conversations + every other unread notification. One rule, one number, also the
     browser tab's "(N)".
   - Everything else stays its own card: payments, commission, failed sends, assignments, Team Board tasks,
     transfer requests, quick close, audits, sign-up opens.
   Pure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Kinds drawn as ONE grouped card from live unread state, never row by row. */
export const GROUPED_NOTIFICATION_KINDS: ReadonlySet<string> = new Set(['whatsapp_reply']);

export interface UnreadConversation { phone: string; lead_id: string | null; unread_messages?: number | null }
export interface ReplySummary { messages: number; businesses: number }

/** How many unread replies, across how many businesses (a conversation without a lead counts by number). */
export function replySummary(rows: readonly UnreadConversation[]): ReplySummary {
  const businesses = new Set(rows.map((r) => r.lead_id ?? `phone:${r.phone}`)).size;
  const messages = rows.reduce((s, r) => s + Math.max(1, Number(r.unread_messages ?? 1) || 1), 0);
  return { messages, businesses };
}

/** "1 new WhatsApp reply" · "3 new WhatsApp replies" · "6 new replies from 4 businesses". */
export function replyCardTitle(s: ReplySummary): string {
  if (s.messages <= 0) return '';
  if (s.businesses > 1 && s.businesses !== s.messages) return `${s.messages} new replies from ${s.businesses} businesses`;
  return `${s.messages} new WhatsApp repl${s.messages === 1 ? 'y' : 'ies'}`;
}
export function replyCardBody(s: ReplySummary): string {
  return s.businesses === 1 ? 'From 1 business — open the Inbox to answer.' : `From ${s.businesses} businesses — open the Inbox to answer.`;
}

/** The bell badge: unread conversations + every other unread item. */
export function bellCount(unreadConversations: number, notifications: readonly { kind: string; read_at: string | null }[]): number {
  return unreadConversations + notifications.filter((n) => !n.read_at && !GROUPED_NOTIFICATION_KINDS.has(n.kind)).length;
}

/** Where the grouped card goes: the Inbox showing exactly the unread conversations. */
export const REPLY_CARD_LINK = '/inbox?filter=unread';
