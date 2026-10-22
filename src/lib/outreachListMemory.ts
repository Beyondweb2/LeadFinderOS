/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE OUTREACH LIST FROM YOUR LAST VISIT (Paul, 2026-10-15)

   "Show the last list instantly when I come back to it, refresh behind it, and keep bulk actions locked
   until the fresh copy lands." useOutreach (progressive mode = the Outreach page only) remembers its
   COMPLETE list here and, on the next visit in the same tab, shows it at once as LEAD_LOAD_FROM_LAST_VISIT
   (partial — every whole-list action stays locked) while the full fresh load runs and replaces it.

   ⛔ Keyed by person AND role: another login, or the same login after a role change, never sees it.
   ⛔ Memory only (this tab, this page load) — never localStorage; a reload or sign-out forgets it.
   ⛔ Only a COMPLETE list is remembered, so a returning visit never starts from a partial one.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

interface Remembered<T> { key: string; active: T[]; archived: T[] }

let remembered: Remembered<unknown> | null = null;
/* When the remembered list was last known to match the database (the START of the load that proved it), per person+role.
   The "changed since" refresh reads from here; null = never proven, so the next visit does the full load. */
let syncedAt: { key: string; at: number } | null = null;

const keyFor = (userId: string, role: string | null | undefined) => `${userId}:${role ?? ''}`;

export function rememberOutreachList<T>(userId: string, role: string | null | undefined, active: T[], archived: T[]): void {
  if (!userId || !role) return; // an unresolved role is never a key (it could be read back under the wrong one)
  remembered = { key: keyFor(userId, role), active, archived };
}

export function markOutreachListSynced(userId: string, role: string | null | undefined, at: number): void {
  if (!userId || !role) return;
  syncedAt = { key: keyFor(userId, role), at };
}

export function recallOutreachList<T>(userId: string, role: string | null | undefined): { active: T[]; archived: T[]; syncedAt: number | null } | null {
  if (!userId || !role || !remembered || remembered.key !== keyFor(userId, role)) return null;
  const k = keyFor(userId, role);
  return { active: remembered.active as T[], archived: remembered.archived as T[], syncedAt: syncedAt && syncedAt.key === k ? syncedAt.at : null };
}

export function forgetOutreachList(): void {
  remembered = null;
  syncedAt = null;
}
