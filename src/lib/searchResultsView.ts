/* ══ WHAT THE SEARCH RESULTS TABLE SAYS ABOUT ITS OWN FILTERS (2026-09-28) ══════════════════════
   ⛔ A count must describe what you can see. "Found 10" over an empty table was the fault: the count
   was the whole search, the rows were the filtered set, and nothing said the filters were the gap.
   Whenever a filter hides anything, the table says how many it shows, how many are hidden, and
   offers Show all — including the case where it hides every row. */

export interface VisibleResults {
  /** A filter is hiding at least one result. */
  filtered: boolean;
  shown: number;
  hidden: number;
  /** "Showing 3 of 10 — filters hide 7", or '' when nothing is hidden. */
  line: string;
  /** The empty-table sentence: which of the two empties this is. */
  emptyText: string;
}

export function visibleResults(total: number, shown: number): VisibleResults {
  const t = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const s = Number.isFinite(shown) && shown > 0 ? Math.min(Math.floor(shown), t) : 0;
  const hidden = t - s;
  const filtered = hidden > 0;
  return {
    filtered,
    shown: s,
    hidden,
    line: filtered ? `Showing ${s} of ${t} — filters hide ${hidden}` : '',
    emptyText: t === 0
      ? 'No results for this search.'
      : `Your filters hide all ${t} result${t === 1 ? '' : 's'}.`,
  };
}
