/* ARCHIVE A PAID CLIENT FROM PAUL'S LISTS (Paul, 2026-11-10). A test sale or a finished client can be put away from
 * "New paid clients" (admin home) and the Paid Clients page, and brought back with Show archived.
 *
 * ⛔ IT IS A MARK, NEVER A DELETE AND NEVER A CHANGE TO THE CLIENT. One row in admin_home_marks (action 'archive', key
 *    below; undo stamps undone_at, the row stays). The lead, its payments, the ledger, commission, the agreement, the
 *    baseline and every automatic job are untouched and keep running: this only decides what two lists draw.
 * ⛔ NOT outreach_leads.is_archived. That flag is read by the payment confirmation, the baseline and the weekly checks,
 *    so setting it on a paying client would quietly stop work on them.
 * The same mark also hides that client's "New client" row in What needs you (src/lib/needsMe.ts hiddenByMark).
 * Pure leaf: no imports. */

const PREFIX = 'paidclient:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function paidClientArchiveKey(leadId: string): string {
  return PREFIX + leadId;
}

/** The lead a mark key archives, or null when the key is some other row's. */
export function leadOfArchiveKey(itemKey: unknown): string | null {
  if (typeof itemKey !== 'string' || !itemKey.startsWith(PREFIX)) return null;
  const id = itemKey.slice(PREFIX.length);
  return UUID.test(id) ? id : null;
}

export interface ArchiveMark { id: string; item_key: string; action?: string | null; undone_at?: string | null }

/** lead id → the live mark's id (the newest wins). A mark that was undone, or is not an archive, archives nothing. */
export function archivedPaidClients(marks: readonly ArchiveMark[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of marks) {
    if (m.undone_at) continue;
    if (m.action !== undefined && m.action !== null && m.action !== 'archive') continue;
    const lead = leadOfArchiveKey(m.item_key);
    if (lead && !out.has(lead)) out.set(lead, m.id);
  }
  return out;
}

/** Split a list into what is shown and what is archived, keeping its order. */
export function splitArchived<T>(rows: readonly T[], idOf: (row: T) => string, archived: ReadonlyMap<string, string>): { live: T[]; archived: T[] } {
  const live: T[] = [], gone: T[] = [];
  for (const r of rows) (archived.has(idOf(r)) ? gone : live).push(r);
  return { live, archived: gone };
}
