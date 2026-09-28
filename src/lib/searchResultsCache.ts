/* ══ FIND LEADS: THE RESULTS ON SCREEN AND THE SEARCH BEHIND THEM (2026-09-28) ══════════════════
   ⛔ THE FAULT PAUL HIT: search, leave Find Leads, come back — the results were on screen, and Add
   said "Run a search first … These results have no search behind them". The provider restored the
   results from a SECOND store (a localStorage copy written after every search) that held the leads
   and NOT the search, and it read that store first. The 168-row fix (results and search are one
   object in one write) only covered the sessionStorage copy; the other copy broke it again.

   ⛔ THE RULE, IN ONE PLACE: results are only ever stored WITH the search that produced them, and a
   stored set without a usable search (a trade to save on the lead) is never restored — so nothing on
   screen can be a result that Add refuses. Option A (keep the context) with B as the floor (an entry
   with no context shows nothing, never a dead list). The provider and the tests both call these. */

export interface StoredSearch {
  keyword: string | null;
  location: string | null;
  country: string;
}

export interface StoredResults<L> {
  leads: L[];
  lastSearch: StoredSearch;
}

/** The storage key: one per signed-in person, in localStorage (it survives a closed tab, as the
 *  results always did). */
export const searchResultsKey = (userId: string) => `leadfinder_search_results:${userId}`;

/** Keys written by older builds. Read once for the one that carried its search, then removed. */
export const legacySearchResultKeys = (userId: string) => ({
  /** sessionStorage — { leads, lastSearch } (the 168-row fix). Restorable when it has a search. */
  session: `leadfinder_cached_leads:${userId}`,
  /** localStorage — { leads } only. The copy that caused the fault. Never restored. */
  noSearch: `leadfinder_demo_leads:${userId}`,
});

/** A search Add can use: a trade is required (addLead refuses without one). */
export function isUsableSearch(s: unknown): s is StoredSearch {
  const v = s as Partial<StoredSearch> | null | undefined;
  return !!v && typeof v === 'object' && typeof v.keyword === 'string' && v.keyword.trim().length > 0
    && typeof v.country === 'string' && v.country.length > 0;
}

/** Serialise the results and their search as ONE value. Nothing is written without a usable search. */
export function packSearchResults<L>(leads: readonly L[], lastSearch: StoredSearch | null): string | null {
  if (!isUsableSearch(lastSearch)) return null;
  return JSON.stringify({ leads, lastSearch });
}

/** Read a stored value back. Returns null — show nothing — unless it carries a usable search. */
export function unpackSearchResults<L>(raw: string | null | undefined): StoredResults<L> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { leads?: unknown; lastSearch?: unknown };
    if (!Array.isArray(v?.leads) || !isUsableSearch(v.lastSearch)) return null;
    return { leads: v.leads as L[], lastSearch: v.lastSearch };
  } catch {
    return null;
  }
}

/** Which result set the table is looking at: the ids in order. A website-status correction changes a
 *  lead's label, not its id, so it keeps the table's filters; a new search changes the ids. */
export function resultSetSignature(leads: ReadonlyArray<{ id: string }>): string {
  let h = 0;
  const s = leads.map((l) => l.id).join('|');
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `${leads.length}:${(h >>> 0).toString(36)}`;
}
