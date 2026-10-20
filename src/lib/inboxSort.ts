/** Inbox list order (Paul, 2026-10-20). The default is the newest message FROM THE PROSPECT, so sending a reply
 *  never moves a conversation. "Newest message" (either direction) stays as an option. Pure, no React. */
export type InboxSort = 'recent_reply' | 'recent' | 'next_action';
export const DEFAULT_INBOX_SORT: InboxSort = 'recent_reply';

type Sortable = { lastMessageAt: string; lastInboundAt: string | null };

/** Newest prospect message first; a conversation they never answered goes below, ordered by our newest message. */
export function compareLastProspectMessage(a: Sortable, b: Sortable): number {
  const byInbound = (b.lastInboundAt ?? '').localeCompare(a.lastInboundAt ?? '');
  return byInbound !== 0 ? byInbound : b.lastMessageAt.localeCompare(a.lastMessageAt);
}

export function compareNewestMessage(a: Sortable, b: Sortable): number {
  return b.lastMessageAt.localeCompare(a.lastMessageAt);
}
