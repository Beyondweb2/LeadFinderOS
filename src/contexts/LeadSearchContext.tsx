import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { reportClientError } from '@/lib/errorReporting';
import { fetchAllRowsParallel } from '@/lib/fetchAllRows';
import { legacySearchResultKeys, packSearchResults, searchResultsKey, unpackSearchResults } from '@/lib/searchResultsCache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { foundRecord, isWithoutWebsite } from '@/lib/websiteStatusClass';

type SearchLeadLike = Parameters<typeof foundRecord>[0][number];
import type { Country, Lead, SearchFilters, SearchResponse, WebsiteStatus, RegionMeta } from '@/types/lead';

/* ══ THE SEARCH THAT PRODUCED THE RESULTS ══════════════════════════════════════════════
   ⛔ THE BUG THIS EXISTS TO FIX, AND IT COST 168 LEADS. The keyword and town used to live in
   useState in Index.tsx, set only by pressing Search — while the RESULTS were restored here from
   sessionStorage. So: search, leave the page, come back. The results are on screen, the keyword and
   town are null, and Add writes a lead with no trade and no town. 168 rows in the CRM have exactly
   that shape (166 of them missing BOTH fields together, all with a place_id), and they cannot be
   audited at all: create-ai-audit needs a business type and a location and there are none.

   ⛔ THE FIX IS STRUCTURAL, NOT A SECOND setState. Two facts that describe one thing must not have
   two lifetimes. The results and the search that produced them are now ONE object, written in one
   sessionStorage put and read back in one get, so there is no sequence of events that restores
   results without the search behind them. Adding another "remember to set this too" would have left
   the same class of bug for the next person who forgot.

   ⚠️ It is set inside search() rather than by the caller, so a new call site cannot omit it. */
export interface LastSearch {
  keyword: string | null;
  location: string | null;
  country: Country;
}

// Manual website-status overrides table isn't in the generated types yet, so its
// reads/writes go through an untyped client (same pattern as other new tables).
const odb = supabase as unknown as SupabaseClient;
const normUrl = (u?: string) => (u || '').trim();

interface ExcludedBusiness {
  business_name: string;
  google_maps_url: string | null;
}

interface TrialLimitError {
  searchesToday: number;
  limit: number;
}

interface LeadSearchContextType {
  leads: Lead[];
  isLoading: boolean;
  search: (filters: SearchFilters, skipTrialCount?: boolean, isDemo?: boolean) => Promise<void>;
  /** What produced `leads`. Survives a reload because it is persisted WITH them. */
  lastSearch: LastSearch | null;
  /** ⛔ THE EXCLUSION RULE, SHARED RATHER THAN COPIED. The niche panel runs its own parallel
   *  per-town searches (useTownLeadSearch), and it must drop the same businesses this page drops
   *  or a lead added from a row would be one the page had hidden. Exported so there is one rule. */
  isLeadExcluded: (lead: Lead) => boolean;
  /** Load the viewed / in-list businesses isLeadExcluded matches against. They are no longer read
   *  on every page load — a screen that filters with isLeadExcluded outside a search calls this. */
  loadExclusions: () => Promise<void>;
  /** ⛔ HAND THIS PAGE A RESULT SET THAT WAS ALREADY FETCHED ELSEWHERE, so "View" on a town row
   *  opens Find Leads showing results instead of paying for the same search again. Sets `leads` +
   *  `lastSearch` together and persists them exactly as a real search does — they are stored in
   *  ONE write precisely so results can never outlive the search that produced them (the 168-row
   *  no-keyword fault). Deliberately does NOT touch loading/error state: nothing is in flight. */
  adoptResults: (leads: Lead[], search: LastSearch) => void;
  /** Manually correct a result's website status. Persists + wins over auto-detection. */
  setWebsiteOverride: (lead: Lead, status: WebsiteStatus) => void;
  retryLastSearch: () => void;
  exportToCsv: () => void;
  trialLimitError: TrialLimitError | null;
  clearTrialLimitError: () => void;
  postAbandonExhausted: boolean;
  freeSearchExhausted: boolean;
  searchError: { message: string; errorId: string } | null;
  /** Friendly handled message (location not found / map lookup unavailable) — a
   *  soft empty-state, distinct from the hard searchError card. */
  searchNotice: string | null;
  expanded: boolean;
  gated: boolean;
  regionMeta: RegionMeta | null;
  regionDowngraded: { reason: string; spentUsd: number } | null;
  /** Set ONLY when "this town only" was asked for and the server could not apply it (no geocoded
   *  boundary). Carries the server's reason. Null the rest of the time — including when the
   *  filter worked, because there is nothing to warn about then. */
  townFilterFallback: { reason: string } | null;
  /* ⛔ WHICH PLACE THE GEOCODER CHOSE, in Google's own words ("St Ives, Cornwall, UK").
     ALWAYS set after a search, ambiguous or not — a wrong town costs 11p and a polluted lead list,
     and the only reason St Ives was measured in Cornwall is that nothing ever said so. */
  resolvedLocation: string | null;
  /** Every candidate Google offered, ONLY when it offered more than one. Empty = unambiguous. */
  locationCandidates: string[];
}

const LeadSearchContext = createContext<LeadSearchContextType | null>(null);

export function LeadSearchProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Businesses the user only *viewed* (opened the map link) — still decluttered
  // out of future results.
  const [excludedBusinesses, setExcludedBusinesses] = useState<ExcludedBusiness[]>([]);
  // Businesses already in the user's outreach list (history + active/archived).
  // These are NOT filtered out — they stay visible and get marked "in your list"
  // with a disabled add button (the table handles that via isInOutreach).
  const [inListBusinesses, setInListBusinesses] = useState<ExcludedBusiness[]>([]);
  const [trialLimitError, setTrialLimitError] = useState<TrialLimitError | null>(null);
  const [postAbandonExhausted, setPostAbandonExhausted] = useState(false);
  const [freeSearchExhausted, setFreeSearchExhausted] = useState(false);
  const [searchError, setSearchError] = useState<{ message: string; errorId: string } | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [gated, setGated] = useState(false);
  // Region tiling: the grid the last region search used + a downgrade notice.
  const [regionMeta, setRegionMeta] = useState<RegionMeta | null>(null);
  const [regionDowngraded, setRegionDowngraded] = useState<{ reason: string; spentUsd: number } | null>(null);
  const [townFilterFallback, setTownFilterFallback] = useState<{ reason: string } | null>(null);
  const [resolvedLocation, setResolvedLocation] = useState<string | null>(null);
  const [locationCandidates, setLocationCandidates] = useState<string[]>([]);
  // Manual website-status overrides, keyed by normalized googleMapsUrl. Applied
  // over auto-detected results so a hand-correction always wins, even after a
  // re-search of the same query.
  const [websiteOverrides, setWebsiteOverrides] = useState<Record<string, WebsiteStatus>>({});
  const [freeSearchExhaustedPersisted, setFreeSearchExhaustedPersisted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastSearchRef = useRef<{ filters: SearchFilters; skipTrialCount: boolean; isDemo: boolean } | null>(null);
  /* State, not a ref: it is persisted and it is read during render by whoever adds a lead. The ref
     above is the retry payload and is deliberately separate — it holds the whole filter object
     including flags that must NOT be restored across a reload. */
  const [lastSearch, setLastSearch] = useState<LastSearch | null>(null);
  /** The stored set is restored once per signed-in person (see the restore effect). */
  const restoredRef = useRef(false);
  const { toast } = useToast();
  const { user } = useAuth();
  useEffect(() => { restoredRef.current = false; }, [user?.id]);
  const { isPaidSubscriber, isStripeTrialing, isAdmin, isLoading: isSubLoading } = useSubscription();
  const hasProAccess = isPaidSubscriber || isStripeTrialing || isAdmin;

  const clearTrialLimitError = useCallback(() => setTrialLimitError(null), []);

  // Clear persisted gating flags when user becomes a subscriber
  useEffect(() => {
    if (hasProAccess && user?.id) {
      setGated(false);
      setFreeSearchExhausted(false);
      setFreeSearchExhaustedPersisted(false);
      try {
        localStorage.removeItem(`leadfinder_gated:${user.id}`);
        localStorage.removeItem(`leadfinder_free_exhausted:${user.id}`);
      } catch {}
    }
  }, [hasProAccess, user?.id]);

  /* ⛔ ONE STORE FOR THE RESULTS AND THEIR SEARCH (src/lib/searchResultsCache.ts, 2026-09-28). There
     used to be two: sessionStorage {leads, lastSearch} and a localStorage {leads} copy that was read
     FIRST — so a new tab or a reload brought the results back with no search behind them, and Add
     refused every one ("Run a search first"). The legacy keys are read once, then removed. */
  const storageKeys = useMemo(() => {
    if (!user?.id) return null;
    return {
      results: searchResultsKey(user.id),
      ...legacySearchResultKeys(user.id),
      filters: `leadfinder_cached_filters:${user.id}`,
    };
  }, [user?.id]);

  // Restore cached state after reloads — but only full results for subscribers
  // Non-subscribers get gated flag restored so the block persists
  useEffect(() => {
    if (!storageKeys) {
      setLeads([]);
      setLastSearch(null);
      return;
    }

    // Wait for subscription status to resolve before restoring leads
    if (isSubLoading) return;

    try {
      // Restore persisted gated flag
      const gatedFlag = localStorage.getItem(`leadfinder_gated:${user?.id}`);
      if (gatedFlag === 'true') {
        setGated(true);
      }
      // Restore persisted free search exhausted flag
      const exhaustedFlag = localStorage.getItem(`leadfinder_free_exhausted:${user?.id}`);
      if (exhaustedFlag === 'true') {
        setFreeSearchExhausted(true);
        setFreeSearchExhaustedPersisted(true);
      }

      // For non-subscribers: clear cached leads entirely so they can't access old results
      if (!hasProAccess) {
        try {
          localStorage.removeItem(storageKeys.results);
          localStorage.removeItem(storageKeys.noSearch);
          sessionStorage.removeItem(storageKeys.session);
        } catch {}
        setLeads([]);
        return;
      }

      /* ⛔ RESTORED WITH THEIR SEARCH, OR NOT AT ALL. unpackSearchResults returns null for an entry with
         no usable search, so a restored list can always be added from. The legacy leads-only copy is
         dropped unread — it is the copy that caused the fault. */
      let stored = unpackSearchResults<Lead>(localStorage.getItem(storageKeys.results));
      if (!stored) stored = unpackSearchResults<Lead>(sessionStorage.getItem(storageKeys.session));
      try { localStorage.removeItem(storageKeys.noSearch); sessionStorage.removeItem(storageKeys.session); } catch {}
      /* Once per person, and only onto an EMPTY page: this effect re-runs when the role or the
         subscription settles, and must never swap a live result set for an older stored one. */
      if (stored && !restoredRef.current) {
        restoredRef.current = true;
        const s = stored;
        setLeads((cur) => (cur.length ? cur : s.leads));
        setLastSearch((cur) => cur ?? { keyword: s.lastSearch.keyword, location: s.lastSearch.location, country: s.lastSearch.country as Country });
      }
    } catch {
      // ignore cache parse errors
    }
  }, [storageKeys, isSubLoading, hasProAccess]);

  /* Persist the results AND the search that produced them, in ONE write (the 168-row rule). A set
     with no usable search is never written, and clears what was stored, so it cannot come back. */
  useEffect(() => {
    if (!storageKeys) return;
    try {
      /* Nothing on screen and no search yet = the page has not loaded anything; leave the store alone
         (the restore reads it). A search that found nothing clears it. */
      if (!leads.length && !lastSearch) return;
      const packed = leads.length ? packSearchResults(leads, lastSearch) : null;
      if (packed) localStorage.setItem(storageKeys.results, packed);
      else localStorage.removeItem(storageKeys.results);
    } catch {
      // ignore quota/unavailable errors
    }
  }, [leads, lastSearch, storageKeys]);

  // Load this user's manual website-status overrides (once per user).
  useEffect(() => {
    if (!user?.id) { setWebsiteOverrides({}); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await odb
        .from('website_status_overrides')
        .select('google_maps_url, website_status');
      if (cancelled || error || !data) return;
      const map: Record<string, WebsiteStatus> = {};
      for (const r of data as Array<{ google_maps_url: string; website_status: string }>) {
        map[normUrl(r.google_maps_url)] = r.website_status as WebsiteStatus;
      }
      setWebsiteOverrides(map);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Hand-correct a result's website status. Optimistic (wins instantly) + upsert
  // so it survives re-search and other sessions. Keyed by the business's map URL.
  const setWebsiteOverride = useCallback((lead: Lead, status: WebsiteStatus) => {
    const key = normUrl(lead.googleMapsUrl);
    if (!key) {
      toast({ title: "Can't save", description: 'This result has no map link to key the override on.', variant: 'destructive' });
      return;
    }
    setWebsiteOverrides(prev => ({ ...prev, [key]: status }));
    if (!user?.id) return;
    (async () => {
      const { error } = await odb
        .from('website_status_overrides')
        .upsert(
          { user_id: user.id, google_maps_url: key, business_name: lead.name, website_status: status, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,google_maps_url' },
        );
      if (error) {
        console.error('website override upsert failed', error);
        toast({ title: 'Override not saved', description: error.message, variant: 'destructive' });
      }
    })();
  }, [user?.id, toast]);

  /* ══ THE VIEWED / IN-LIST BUSINESSES (2026-09-27, site-wide speed pass) ══════════════════════
     ⛔ THEY WERE CUT AT 1,000 ROWS. Three unpaginated reads, and outreach_leads (5,355) and
     outreach_history (5,377) are far past PostgREST's cap — so a business you had viewed AND already
     hold, outside the first 1,000, was HIDDEN from a search instead of shown and marked "in list".
     Now paged in full.
     ⛔ AND THEY WERE READ ON EVERY PAGE LOAD, TWICE: this provider wraps the whole app, and the
     effect keyed on the `user` OBJECT, which changes identity twice on a load (and on every tab
     refocus). Only two readers exist: search(), which re-reads them itself before filtering, and the
     Coverage niche panel (isLeadExcluded), which now asks for them when it opens (loadExclusions).
     ⚠️ search() USES WHAT IT FETCHED. It used to await this and then filter with `isExcluded` — the
     closure from BEFORE the await, i.e. whatever the page-load read had left in state. It now filters
     with the lists this call returns, so a search always matches against the current book. */
  const exclusionsRef = useRef<{ checked: ExcludedBusiness[]; inList: ExcludedBusiness[] }>({ checked: [], inList: [] });
  const fetchExcludedBusinesses = useCallback(async (): Promise<{ checked: ExcludedBusiness[]; inList: ExcludedBusiness[] }> => {
    if (!user?.id) {
      setExcludedBusinesses([]);
      exclusionsRef.current = { checked: [], inList: [] };
      return exclusionsRef.current;
    }
    /* A failed read degrades to "nothing to match" for that list — exactly what the old
       `.data || []` did — rather than failing the search. */
    const all = (label: string, table: string) =>
      fetchAllRowsParallel<ExcludedBusiness & { id: string }>(label, (from, to) =>
        supabase.from(table as 'checked_businesses').select('id, business_name, google_maps_url')
          .order('id', { ascending: true }).range(from, to), (r) => r.id)
        .then((r) => r.rows as ExcludedBusiness[])
        .catch((e) => { console.warn(`${label} unavailable:`, e); return [] as ExcludedBusiness[]; });
    const [checked, history, current] = await Promise.all([
      all('Exclusions (checked)', 'checked_businesses'),
      all('Exclusions (history)', 'outreach_history'),
      all('Exclusions (leads)', 'outreach_leads'),
    ]);
    // Viewed-only (checked) businesses are decluttered from results.
    // In-list businesses (ever added) stay visible but get marked.
    const inList: ExcludedBusiness[] = [...history, ...current];
    exclusionsRef.current = { checked, inList };
    setExcludedBusinesses(checked);
    setInListBusinesses(inList);
    return exclusionsRef.current;
  }, [user?.id]);

  const loadExclusions = useCallback(async () => { await fetchExcludedBusinesses(); }, [fetchExcludedBusinesses]);

  const matchesBusiness = (list: ExcludedBusiness[], lead: Lead): boolean =>
    list.some(
      (b) => b.business_name === lead.name ||
             (lead.googleMapsUrl && b.google_maps_url === lead.googleMapsUrl)
    );

  // Drop a result only if the user merely *viewed* it AND it is NOT already in
  // their list. In-list businesses are kept (shown + marked, not double-addable).
  const isExcluded = useCallback((lead: Lead): boolean => {
    return matchesBusiness(excludedBusinesses, lead) && !matchesBusiness(inListBusinesses, lead);
  }, [excludedBusinesses, inListBusinesses]);

  /* 🔴 THE RUN ALSO RECORDS WHAT THE SEARCH FOUND (Coverage: Found vs Added, 2026-09-29). `found` is the
     discovery result as search-leads returned it — BEFORE this page's own exclusions — with the search's
     own website verdict (foundRecord). results_count / no_website_count keep their old meaning (after
     exclusions). Returns the row id so each result can carry it and an add can be credited to its run.
     Never fatal: a failed write loses the record, never the search. */
  const saveSearch = async (filters: SearchFilters, resultsCount: number, noWebsiteCount: number, found: SearchLeadLike[]): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: row, error } = await supabase.from('search_history').insert({
      user_id: user.id,
      keyword: filters.keyword.toLowerCase().trim(),
      location: filters.location.toLowerCase().trim(),
      radius: filters.radius,
      results_count: resultsCount,
      no_website_count: noWebsiteCount,
      ...foundRecord(found),
    } as never).select('id').single();
    if (error) { console.warn('[search] history write failed', error.message); return null; }
    return (row as { id?: string } | null)?.id ?? null;
  };

  const search = useCallback(async (filters: SearchFilters, skipTrialCount: boolean = false, isDemo: boolean = false) => {
    // Cancel any in-flight search
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    // Store for retry
    lastSearchRef.current = { filters, skipTrialCount, isDemo };
    /* ⛔ SET INSIDE search(), the single point every search passes through, so no call site can forget
       it — and set IN THE SAME UPDATE AS THE RESULTS it describes (2026-09-28). It used to be set here,
       before the request: a search that then failed or timed out left the PREVIOUS results on screen
       under the NEW search, and Add would have saved them with the wrong trade and town. */
    const thisSearch: LastSearch = {
      keyword: filters.keyword?.trim() || null,
      location: filters.location?.trim() || null,
      country: (filters.country || 'UK') as Country,
    };

    setIsLoading(true);
    setTrialLimitError(null);
    setPostAbandonExhausted(false);
    setFreeSearchExhausted(false);
    setSearchError(null);
    setSearchNotice(null);
    setTownFilterFallback(null);
    setExpanded(false);
    setRegionMeta(null);
    setRegionDowngraded(null);
    // Only clear gated flag if user has pro access; free users stay gated until checkout
    if (hasProAccess) setGated(false);

    /* Refresh the excluded businesses (skip for demo) — ALONGSIDE the search, not before it: the
       search takes seconds, the lists well under that, and nothing needs them until the results
       are filtered below. It used to be a full wait in front of every search. */
    const exclusionsP = isDemo ? Promise.resolve(exclusionsRef.current) : fetchExcludedBusinesses();

    // Helper to determine if an error is retryable (network / 5xx / 429)
    const isRetryable = (err: any): boolean => {
      const msg = (err?.message || '').toLowerCase();
      return msg.includes('failed to send') || msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('aborted');
    };

    const MAX_RETRIES = 2;
    // Region tiling fans out many tile searches server-side (~15–30s), so give it
    // a longer client timeout than a normal single-centre search.
    const TIMEOUT_MS = filters.region ? 60_000 : 30_000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Check if aborted between retries
      if (controller.signal.aborted) {
        setIsLoading(false);
        return;
      }

      try {
        // Race the invoke against a timeout
        const invokePromise = supabase.functions.invoke<SearchResponse>('search-leads', {
          /* ⛔ skipHistory: THIS path writes its own search_history row (saveSearch below), with the
             POST-EXCLUSION counts the dashboard reads. search-leads now writes one by default so
             that direct callers cannot leave a pool unindexed — but both writing would double-count
             results_count/no_website_count in useDashboardMetrics. One row, from whichever side has
             the better numbers. */
          body: { ...filters, skipTrialCount, skipHistory: true, ...(isDemo ? { demo: true } : {}) },
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          const id = setTimeout(() => {
            reject(new Error('Search timed out — please try again.'));
          }, TIMEOUT_MS);
          controller.signal.addEventListener('abort', () => clearTimeout(id));
        });

        const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

        if (controller.signal.aborted) {
          setIsLoading(false);
          return;
        }

        if (error) {
          console.error(`Search error (attempt ${attempt + 1}):`, error);

          // Check for retryable errors before parsing business logic codes
          if (isRetryable(error) && attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // exponential backoff
            continue;
          }
          
          // Try to parse the error for trial limit / paywall codes
          let body: any = null;
          try {
            const errorContext = error.context;
            if (errorContext && typeof errorContext === 'object') {
              if (typeof errorContext.json === 'function') {
                body = await errorContext.json().catch(() => null);
              }
              if (!body && typeof errorContext.text === 'function') {
                const txt = await errorContext.text().catch(() => '');
                try { body = JSON.parse(txt); } catch {}
              }
              if (!body) body = errorContext;
            }
          } catch {}
          
          // Also try parsing the error message itself as JSON
          if (!body?.code && error.message) {
            try {
              const parsed = JSON.parse(error.message);
              if (parsed?.code) body = parsed;
            } catch {}
            if (!body?.code) {
              if (error.message.includes('FREE_SEARCH_EXHAUSTED') || error.message.includes('free trial to unlock')) {
                body = { code: 'FREE_SEARCH_EXHAUSTED' };
              } else if (error.message.includes('POST_ABANDON_EXHAUSTED')) {
                body = { code: 'POST_ABANDON_EXHAUSTED' };
              } else if (error.message.includes('Trial limit reached') || error.message.includes('TRIAL_LIMIT_REACHED') || error.message.includes('GUEST_LIMIT_REACHED')) {
                body = { code: 'TRIAL_LIMIT_REACHED' };
              }
            }
          }
          
          if (body?.code === 'POST_ABANDON_EXHAUSTED') {
            setPostAbandonExhausted(true);
            setIsLoading(false);
            return;
          }
          if (body?.code === 'FREE_SEARCH_EXHAUSTED') {
            setFreeSearchExhausted(true);
            setFreeSearchExhaustedPersisted(true);
            if (user?.id) {
              try { localStorage.setItem(`leadfinder_free_exhausted:${user.id}`, 'true'); } catch {}
            }
            try { supabase.rpc('log_usage_event', { p_event_type: 'search_2_blocked' }); } catch {}
            setIsLoading(false);
            return;
          }
          if (body?.code === 'TRIAL_LIMIT_REACHED' || body?.code === 'GUEST_LIMIT_REACHED') {
            setTrialLimitError({
              searchesToday: body.searches_today || 3,
              limit: body.limit || 3,
            });
            setIsLoading(false);
            return;
          }
          
          // If the body carries a handled "not found" (older fn / non-2xx path),
          // treat it as a soft notice, not a scary error card.
          if (body?.notFound) {
            setLeads([]);
            setLastSearch(thisSearch);
            setSearchError(null);
            setSearchNotice(body.notice ?? body.error ?? "Couldn't find that location — try adding a country or county.");
            setIsLoading(false);
            return;
          }

          // Non-retryable error — prefer the function's own friendly message
          // (body.notice / body.error) over the generic "non-2xx status code".
          // body.detail first: the usage guard answers { error: 'usage_paused', detail: <sentence> } (2026-09-29).
          const errMsg = body?.notice || body?.detail || body?.error
            || (error.message && !/non-2xx/i.test(error.message) ? error.message : null)
            || 'Search failed. Tap retry to try again.';
          const errorId = await reportClientError({
            functionName: 'search-leads',
            payload: { keyword: filters.keyword, location: filters.location, radius: filters.radius },
            userId: user?.id ?? null,
            httpStatus: (error.context as any)?.status ?? null,
            responseBody: body ? JSON.stringify(body).slice(0, 4000) : error.message,
            errorMessage: error.message,
          }).catch(() => 'UNKNOWN');
          setSearchError({ message: errMsg, errorId });
          toast({
            title: 'Search failed',
            description: errMsg,
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        if (data) {
          // Handled non-result outcomes (clean 2xx): the location couldn't be
          // resolved, or the map lookup hiccuped. Show the friendly notice as a soft
          // empty-state — NOT the generic "non-2xx" error card.
          if (data.notFound || data.serviceIssue) {
            setLeads([]);
            setLastSearch(thisSearch);
            setSearchError(null);
            setSearchNotice(data.notice ?? "Couldn't find that location — try adding a country or county.");
            setExpanded(false);
            setRegionMeta(null);
            setRegionDowngraded(null);
            setTownFilterFallback(null);
            setIsLoading(false);
            return;
          }

          // Filter out excluded businesses — against the lists THIS search fetched.
          const ex = await exclusionsP;
          if (controller.signal.aborted) {
            setIsLoading(false);
            return;
          }
          const filteredLeads = data.leads.filter(lead => !(matchesBusiness(ex.checked, lead) && !matchesBusiness(ex.inList, lead)));

          // Sort: NO_WEBSITE/DIRECTORY_ONLY first, then others
          const statusOrder: Record<string, number> = {
            'NO_WEBSITE': 0,
            'DIRECTORY_ONLY': 0,
            'UNCERTAIN': 1,
            'HAS_OWN_WEBSITE': 2,
          };
          filteredLeads.sort((a, b) => (statusOrder[a.websiteStatus] ?? 9) - (statusOrder[b.websiteStatus] ?? 9));

          /* ⛔ THE COUNTRY GOOGLE RESOLVED, NOT THE FORM'S REMEMBERED ONE (2026-09-28). The form's choice
             persisted silently from the last Quick Locations click, so a typed "Grimsby" after a US click
             stored 349 UK businesses as USA. search-leads names the country the place actually is in
             (resolvedCountry, from Google's formatted address); null — a cached search, an old deploy —
             keeps the form's value. Each lead is corrected again from its own address on add. Set on
             thisSearch BEFORE the one update below, so results and search still land together. */
          if (typeof data.resolvedCountry === 'string' && data.resolvedCountry) thisSearch.country = data.resolvedCountry as Country;
          setLeads(filteredLeads);
          setLastSearch(thisSearch);
          setSearchError(null);
          setExpanded(!!data.expanded);
          setRegionMeta(data.region ?? null);
          setRegionDowngraded(data.downgraded ?? null);
          /* applied === false is the ONLY case that warns. Absent (normal search) and applied
             true (it worked) both clear it, so a stale warning cannot survive the next search. */
          setTownFilterFallback(
            data.townFilter && data.townFilter.applied === false
              ? { reason: data.townFilter.reason ?? 'The town boundary could not be resolved, so the radius was used instead.' }
              : null,
          );
          /* SET ON EVERY SEARCH, including the unambiguous ones. Clearing to null/[] when absent
             matters as much as setting them: a stale "St Ives, Cornwall" left over from the previous
             search would be worse than showing nothing. */
          setResolvedLocation(typeof data.resolvedLocation === 'string' ? data.resolvedLocation : null);
          setLocationCandidates(Array.isArray(data.locationCandidates) ? data.locationCandidates : []);
          setGated(!!data.gated);

          // Persist gated flag so it survives refresh
          if (user?.id) {
            try {
              localStorage.setItem(`leadfinder_gated:${user.id}`, data.gated ? 'true' : 'false');
            } catch {}
          }

          /* The results themselves are persisted WITH this search by the effect above — never here on
             their own (a separate leads-only copy is what lost the search, 2026-09-28). */
          if (storageKeys) {
            try { sessionStorage.setItem(storageKeys.filters, JSON.stringify({ filters })); } catch {}
          }

          const noWebsiteCount = filteredLeads.filter((l) => isWithoutWebsite(l.websiteStatus)).length;

          const runId = await saveSearch(filters, filteredLeads.length, noWebsiteCount, data.leads as SearchLeadLike[]);
          /* Each result carries its run, so an add from it is recorded against what this run found. */
          if (runId && !controller.signal.aborted) setLeads((prev) => prev.map((l) => ({ ...l, searchRunId: runId })));

          // Notify demo checklist that a search completed
          window.dispatchEvent(new CustomEvent('demo-checklist-search'));
          setTimeout(() => window.dispatchEvent(new CustomEvent('post-first-search-complete')), 500);
        }

        setIsLoading(false);
        return; // success — exit retry loop
      } catch (err: any) {
        if (controller.signal.aborted) {
          setIsLoading(false);
          return;
        }
        console.error(`Search error (attempt ${attempt + 1}):`, err);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        // All retries exhausted — report diagnostics, keep last results visible
        const errMsg = err?.message?.includes('timed out')
          ? 'Search timed out — please try again.'
          : 'Connection error — please check your internet and try again.';
        const errorId = await reportClientError({
          functionName: 'search-leads',
          payload: { keyword: filters.keyword, location: filters.location, radius: filters.radius },
          userId: user?.id ?? null,
          errorMessage: err?.message || String(err),
          errorStack: err?.stack,
        }).catch(() => 'UNKNOWN');
        setSearchError({ message: errMsg, errorId });
        toast({
          title: 'Search failed',
          description: errMsg,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
    }
  }, [toast, fetchExcludedBusinesses, isExcluded, storageKeys, hasProAccess]);

  const retryLastSearch = useCallback(() => {
    if (lastSearchRef.current) {
      const { filters, skipTrialCount, isDemo } = lastSearchRef.current;
      search(filters, skipTrialCount, isDemo);
    }
  }, [search]);

  const exportToCsv = useCallback(() => {
    if (leads.length === 0) {
      toast({
        title: 'No data to export',
        description: 'Run a search first to get leads.',
        variant: 'destructive',
      });
      return;
    }

    const headers = [
      'Business Name',
      'Google Maps URL',
      'Website Status',
      'Website URL',
    ];

    const rows = leads.map((lead) => [
      lead.name,
      lead.googleMapsUrl,
      lead.websiteStatus,
      lead.websiteUrl || '',
    ]);

    const BOM = '\uFEFF';
    const csvContent = BOM + [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Export complete — no toast
    } catch (err) {
      console.error('CSV export failed:', err);
      toast({
        title: 'Export failed',
        description: 'Failed to export leads to CSV. Please try again.',
        variant: 'destructive',
      });
    }
  }, [leads, toast]);

  // Apply manual overrides over the raw (auto-detected) results. Runs after every
  // fetch AND cache-restore (both set `leads`), so a correction always wins. The
  // row keeps its position — only the label changes.
  const displayedLeads = useMemo(() => {
    if (!leads.length || !Object.keys(websiteOverrides).length) return leads;
    return leads.map(l => {
      const ov = websiteOverrides[normUrl(l.googleMapsUrl)];
      return ov && ov !== l.websiteStatus ? { ...l, websiteStatus: ov } : l;
    });
  }, [leads, websiteOverrides]);

  /* ⛔ ONE WRITE, BOTH VALUES. `leads` and `lastSearch` are persisted together by the effect above,
     and the reason is recorded there: results that outlive the search that produced them wrote 168
     un-auditable CRM rows. Adopting a result set must therefore set BOTH, never just the leads. */
  const adoptResults = useCallback((incoming: Lead[], search: LastSearch) => {
    setLeads(incoming);
    setLastSearch(search);
    /* Clear the states that describe a JUST-FINISHED search on this page, so an adopted set does
       not arrive under a stale error card or an old "town filter fell back" warning. */
    setSearchError(null);
    setSearchNotice(null);
    setTownFilterFallback(null);
    setExpanded(false);
  }, []);

  const contextValue = useMemo(() => ({
    leads: displayedLeads,
    isLoading,
    search,
    setWebsiteOverride,
    retryLastSearch,
    exportToCsv,
    trialLimitError,
    clearTrialLimitError,
    postAbandonExhausted,
    freeSearchExhausted,
    searchError,
    searchNotice,
    expanded,
    gated,
    regionMeta,
    regionDowngraded,
    townFilterFallback,
    resolvedLocation,
    lastSearch,
    isLeadExcluded: isExcluded,
    loadExclusions,
    adoptResults,
    locationCandidates,
  }), [displayedLeads, isLoading, search, setWebsiteOverride, retryLastSearch, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted, freeSearchExhausted, searchError, searchNotice, expanded, gated, regionMeta, regionDowngraded, townFilterFallback, resolvedLocation, locationCandidates, lastSearch, isExcluded, loadExclusions, adoptResults]);

  return (
    <LeadSearchContext.Provider value={contextValue}>
      {children}
    </LeadSearchContext.Provider>
  );
}

export function useLeadSearchContext() {
  const context = useContext(LeadSearchContext);
  if (!context) {
    throw new Error('useLeadSearchContext must be used within a LeadSearchProvider');
  }
  return context;
}
