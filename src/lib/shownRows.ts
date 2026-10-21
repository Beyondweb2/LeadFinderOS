/* The rows a results table is showing, reported up to its page (Find Leads: Index ← LeadsTable.onShownChange).
   ⛔ The page must keep its OLD array when the rows are the same ones in the same order — a report that always stores a
   new array re-renders the table, which reports again: an endless loop ("Maximum update depth exceeded", 2026-10-21). */
export function sameRows<T extends { id: string }>(a: readonly T[] | null | undefined, b: readonly T[] | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((row, i) => row.id === b[i].id);
}

/** For setState(prev => keepIfSame(prev, next)). */
export function keepIfSame<T extends { id: string }>(prev: readonly T[] | null, next: T[]): T[] | null {
  return prev && sameRows(prev, next) ? (prev as T[]) : next;
}
