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

/* ⚡ COMING BACK TO THE TAB READS ONLY WHAT CHANGED (perf, 2026-10-22). Alt-tabbing used to re-read every message,
   lead and audit (~17 MB live). Now: at most once a minute, a "changed since" read — messages created, leads
   updated, audits touched — from just before the last sync started. A FULL reconcile still runs on a realtime
   reconnect (missed events), and on focus when the last full one is older than INBOX_FULL_RECONCILE_MAX_AGE_MS,
   because a delta cannot see a deletion or a lead taken away. */
export const INBOX_FOCUS_REFRESH_MIN_MS = 60_000;
export const INBOX_FULL_RECONCILE_MAX_AGE_MS = 30 * 60_000;
/** Read from this long before the last sync STARTED — rows written while it ran, and clock skew. */
export const INBOX_DELTA_OVERLAP_MS = 60_000;

export type InboxFocusRefresh = { kind: 'skip' } | { kind: 'full' } | { kind: 'delta'; sinceMs: number };

/** What a tab focus does. `lastSyncStartedAt` = when the newest load / reconcile / delta began (0 = none has yet:
 *  the first load's own catch-up covers that gap); `lastFullAt` = when the newest FULL read began. */
export function inboxFocusRefreshPlan(nowMs: number, lastSyncStartedAt: number, lastFullAt: number): InboxFocusRefresh {
  if (!(lastSyncStartedAt > 0)) return { kind: 'skip' };
  if (nowMs - lastSyncStartedAt < INBOX_FOCUS_REFRESH_MIN_MS) return { kind: 'skip' };
  if (!(lastFullAt > 0) || nowMs - lastFullAt >= INBOX_FULL_RECONCILE_MAX_AGE_MS) return { kind: 'full' };
  return { kind: 'delta', sinceMs: lastSyncStartedAt - INBOX_DELTA_OVERLAP_MS };
}

/** The audits a delta must re-read: every one the server says changed (created / updated / given a new run since),
 *  plus every cached one with a run that has NOT settled — a run settling bumps nothing on its audit, so the
 *  cache's own in-flight runs are the only way to know to look. `settled` is the one run-status rule
 *  (queueAuditStatus.ts); an unknown or missing status counts as not settled (re-read, the safe way). */
export function auditIdsToRefresh(
  cached: ReadonlyArray<{ id: string; ai_audit_runs?: ReadonlyArray<{ status: string | null }> | null }>,
  changedIds: Iterable<string>,
  settled: (status: string | null) => boolean,
): string[] {
  const ids = new Set(changedIds);
  for (const a of cached) {
    if ((a.ai_audit_runs ?? []).some((r) => !settled(r.status))) ids.add(a.id);
  }
  return [...ids];
}
