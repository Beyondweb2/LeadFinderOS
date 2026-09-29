/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WITH OR WITHOUT A WEBSITE — the search's own verdict, in ONE function (2026-09-29).
   A search result's `websiteStatus` is decided by search-leads. The rule every screen already applies is
   "DIRECTORY_ONLY is treated as NO_WEBSITE everywhere" (src/types/lead.ts): a business listed only on a
   directory has no website of its own. HAS_OWN_WEBSITE and UNCERTAIN count as WITH a website — the same
   split the search history's no_website_count has always used. Positive match on the two no-site values.
   Pure, no imports: read by the search context, the add path and the Coverage fold.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export function isWithoutWebsite(status: string | null | undefined): boolean {
  return status === 'NO_WEBSITE' || status === 'DIRECTORY_ONLY';
}

/** The key one business is counted under across runs: the Google place id, else its Maps URL, else its name. */
export function businessKey(b: { id?: string | null; googleMapsUrl?: string | null; name?: string | null }): string {
  return String(b.id || b.googleMapsUrl || b.name || '').trim().slice(0, 300);
}

/** What a search returned, for the run's record: { key: withoutWebsite } plus the two counts. */
export function foundRecord(results: ReadonlyArray<{ id?: string | null; googleMapsUrl?: string | null; name?: string | null; websiteStatus?: string | null }>): {
  found_keys: Record<string, boolean>; found_with_website: number; found_without_website: number;
} {
  const found_keys: Record<string, boolean> = {};
  for (const r of results) {
    const k = businessKey(r);
    if (k) found_keys[k] = isWithoutWebsite(r.websiteStatus);
  }
  const vals = Object.values(found_keys);
  const without = vals.filter(Boolean).length;
  return { found_keys, found_with_website: vals.length - without, found_without_website: without };
}
