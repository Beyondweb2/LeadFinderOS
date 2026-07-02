// Search-results (Find Leads) view preferences — page + website filter.
//
// Same safe, per-user persistence as the rest of the app (see usePersistLastRoute
// / outreachPrefs): write to BOTH localStorage and sessionStorage behind try/catch,
// keyed by user id. Survives navigation + reload + re-login; silently no-ops where
// web storage is blocked. No DB call.

const PREFIX = 'leadfinder_search_results_view';

export interface SearchResultsView {
  /** Active website-status filters (validated by the caller against known values). */
  filters: string[];
  /** Current results page (1-based; clamped to the live result set by the caller). */
  page: number;
  /** Active listing-social filters ('instagram' | 'facebook'; validated by the caller). */
  socials?: string[];
}

function key(userId?: string | null): string {
  return userId ? `${PREFIX}:${userId}` : PREFIX;
}

export function readSearchResultsView(userId?: string | null): SearchResultsView | null {
  try {
    const k = key(userId);
    const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SearchResultsView>;
    const filters = Array.isArray(parsed.filters) ? parsed.filters.filter((f): f is string => typeof f === 'string') : [];
    const page = typeof parsed.page === 'number' && parsed.page > 0 ? Math.floor(parsed.page) : 1;
    const socials = Array.isArray(parsed.socials) ? parsed.socials.filter((s): s is string => typeof s === 'string') : [];
    return { filters, page, socials };
  } catch {
    return null;
  }
}

export function writeSearchResultsView(userId: string | null | undefined, view: SearchResultsView): void {
  try {
    const k = key(userId);
    const raw = JSON.stringify(view);
    localStorage.setItem(k, raw);
    sessionStorage.setItem(k, raw);
  } catch {
    // ignore quota / privacy-mode / blocked-storage issues
  }
}
