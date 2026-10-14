/* ══ WHAT IS TICKED, IN WORDS (2026-10-14, Paul) ════════════════════════════════════════════════════════════════
   A leads table has two ways to tick in bulk: "Select this page" (only the rows showing now) and "Select all"
   (every row matching the filters, across every page). The mode is DERIVED from the ticked ids — never stored —
   so a hand-ticked row, a filter change or a page change can never leave a stale "this page" label on screen.
   Bulk actions read the ticked ids themselves; this file only names them. */

export type SelectionMode = 'none' | 'page' | 'all' | 'custom';

const sameSet = (selected: ReadonlySet<string>, ids: readonly string[]): boolean =>
  ids.length > 0 && selected.size === ids.length && ids.every((id) => selected.has(id));

/** 'all' wins when this page IS everything (one page): both buttons would tick the same rows. */
export function selectionModeOf(selected: ReadonlySet<string>, pageIds: readonly string[], allIds: readonly string[]): SelectionMode {
  if (selected.size === 0) return 'none';
  if (sameSet(selected, allIds)) return 'all';
  if (sameSet(selected, pageIds)) return 'page';
  return 'custom';
}

/** One line for the bar: how many, and which mode. */
export function selectionModeText(mode: SelectionMode, count: number, total: number, noun = 'lead'): string {
  const n = `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'} selected`;
  switch (mode) {
    case 'none': return `None selected`;
    case 'page': return `${n} · this page only`;
    case 'all': return `${n} · all ${total.toLocaleString()} matching, every page`;
    case 'custom': return `${n} · ticked by hand`;
  }
}
