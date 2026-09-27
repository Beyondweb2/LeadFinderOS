/**
 * Did one write of a bulk action land? (2026-09-27, site-wide speed pass)
 *
 * updateLead never REJECTS: a refused write shows its own error toast and resolves to `null`, and a
 * written one resolves to the row the database returned. The bulk "set product" / "set trade" toasts
 * counted every fulfilled promise, so a refused write read as done — hidden only because a full
 * reload of every lead followed and showed the truth. The reload is gone; this makes the count
 * honest instead. A demo lead has no database row, so its `null` is not a failure.
 */
export function bulkWriteLanded(result: PromiseSettledResult<unknown>, isDemo: boolean): boolean {
  if (result.status !== 'fulfilled') return false;
  return result.value != null || isDemo;
}
