/** Shared by initial reads, realtime and send responses. Stable ID is the only identity. */
export function mergeInboxMessages<T extends { id: string; created_at: string }>(rows: T[], incoming: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, { ...byId.get(row.id), ...row });
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export const conversationKey = (userId: string | null, phone: string) => `${userId ?? 'unassigned'}::${phone}`;

export function groupInboxMessages<T extends { user_id: string | null; phone: string }>(messages: T[]) {
  const groups = new Map<string, T[]>();
  for (const message of messages) {
    const key = conversationKey(message.user_id, message.phone);
    const group = groups.get(key) ?? [];
    group.push(message);
    groups.set(key, group);
  }
  return groups;
}

/** A conversation's lead is the MOST RECENT message that carries one, not the first. A phone can
 *  be re-contacted under a newer (duplicate) lead row — the same number gets a fresh
 *  `outreach_leads` id from a later import or re-add — and any audit/report since then was
 *  generated against THAT lead, never the one first messaged. `msgs` must already be in
 *  chronological (ascending) order, the same order `groupInboxMessages` preserves. */
export function conversationLeadId<T extends { lead_id: string | null }>(msgs: T[]): string | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const id = msgs[i].lead_id;
    if (id) return id;
  }
  return null;
}

export function patchInboxLead<T extends { id: string; phone: string | null }>(leads: T[], row: T & { is_archived?: boolean }): T[] {
  const remaining = leads.filter((lead) => lead.id !== row.id);
  return row.is_archived || !row.phone?.trim() ? remaining : [...remaining, row];
}

/** Optional enhancements must never reject the essential Inbox read. */
export async function optionalInboxRows<T>(read: Promise<{ rows: T[] }>): Promise<{ rows: T[] } | null> {
  try { return await read; }
  catch { return null; }
}
