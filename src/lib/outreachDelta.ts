/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE "CHANGED SINCE" REFRESH OF A REMEMBERED OUTREACH LIST (2026-10-22, perf audit fix 4)

   Coming back to Outreach shows the list from the last visit at once. It used to re-download the whole
   book behind it (~11.7 MB). Now it reads only the leads touched since that list was last proven
   current, lays them over it, and ACCEPTS the result only if the database's own counts agree.

   ⛔ A delta cannot see a deletion or a lead taken away from a salesperson. The count check is what makes
   that safe: if the merged active / archived counts differ from the database's, the caller falls back to
   the full load, exactly as before. Never accept a delta without it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Overlap added to "since": a transaction that began before the last load but committed after it stamps
 *  its start time, so a margin keeps it. Re-reading a row twice is harmless (merged by id). */
export const DELTA_OVERLAP_MS = 10 * 60 * 1000;

/** Past this many changed leads the delta is no lighter than the full load — do the full load. */
export const DELTA_MAX_ROWS = 2000;

/** Past this age a delta is not worth trusting either (a long-idle tab). */
export const DELTA_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type Row = { id: string; is_archived?: boolean | null; created_at?: string | null };

export function deltaSinceIso(syncedAt: number | null, now = Date.now()): string | null {
  if (syncedAt == null || !Number.isFinite(syncedAt)) return null;
  if (now - syncedAt > DELTA_MAX_AGE_MS) return null;
  return new Date(syncedAt - DELTA_OVERLAP_MS).toISOString();
}

const newestFirst = (a: Row, b: Row): number => {
  const ta = Date.parse(a.created_at ?? ''), tb = Date.parse(b.created_at ?? '');
  if (ta !== tb && Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** The remembered lists with the changed rows laid over them. A changed row replaces the old one and
 *  goes to whichever list its own `is_archived` says. Active keeps the server order (newest created
 *  first); rows that changed in the archive come first, as the archive is read most-recently-updated first. */
export function applyLeadDelta<T extends Row>(
  active: readonly T[], archived: readonly T[], changed: readonly T[],
): { active: T[]; archived: T[] } {
  const changedIds = new Set(changed.map((r) => r.id));
  const nextActive = active.filter((r) => !changedIds.has(r.id));
  const keptArchived = archived.filter((r) => !changedIds.has(r.id));
  const changedActive = changed.filter((r) => r.is_archived !== true);
  const changedArchived = changed.filter((r) => r.is_archived === true);
  return {
    active: [...nextActive, ...changedActive].sort(newestFirst),
    archived: [...changedArchived, ...keptArchived],
  };
}

/** The one acceptance test: the merged lists hold exactly as many leads as the database says. */
export function deltaMatchesCounts(
  merged: { active: readonly unknown[]; archived: readonly unknown[] },
  counts: { active: number | null; archived: number | null },
): boolean {
  return counts.active != null && counts.archived != null
    && merged.active.length === counts.active && merged.archived.length === counts.archived;
}
