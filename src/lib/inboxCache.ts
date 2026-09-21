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

/** Replace one audit by id, or add it if new — the targeted patch a single realtime event (or a
 *  duplicate of one already applied) makes, instead of a full Inbox re-fetch. Idempotent: applying
 *  the same fresh row twice leaves the array in the same state either way. */
export function upsertAuditById<T extends { id: string }>(rows: T[], fresh: T): T[] {
  const idx = rows.findIndex((r) => r.id === fresh.id);
  if (idx === -1) return [fresh, ...rows];
  const next = rows.slice();
  next[idx] = fresh;
  return next;
}

/** `reconcile()`'s leads read is a SAFETY NET (focus/reconnect), not a source of truth — it must
 *  never overwrite a status/flag a local mutation or a realtime event already confirmed more
 *  recently than that read. `pending` holds exactly those not-yet-confirmed local fields (cleared
 *  the moment an authoritative `outreach_leads` row is observed for that lead, by realtime or by a
 *  targeted single-lead fetch); anything still pending wins over the fresh snapshot. A lead the
 *  fresh read no longer contains (e.g. archived meanwhile) is simply dropped, same as before. */
export function mergeReconciledLeads<T extends { id: string }>(freshLeads: T[], pending: Map<string, Partial<T>>): T[] {
  if (!pending.size) return freshLeads;
  return freshLeads.map((lead) => {
    const override = pending.get(lead.id);
    return override ? { ...lead, ...override } : lead;
  });
}

/** Optional enhancements must never reject the essential Inbox read. */
export async function optionalInboxRows<T>(read: Promise<{ rows: T[] }>): Promise<{ rows: T[] } | null> {
  try { return await read; }
  catch { return null; }
}
