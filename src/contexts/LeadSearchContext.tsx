import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { reportClientError } from '@/lib/errorReporting';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead, SearchFilters, SearchResponse, WebsiteStatus, RegionMeta } from '@/types/lead';

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
  // Manual website-status overrides, keyed by normalized googleMapsUrl. Applied
  // over auto-detected results so a hand-correction always wins, even after a
  // re-search of the same query.
  const [websiteOverrides, setWebsiteOverrides] = useState<Record<string, WebsiteStatus>>({});
  const [freeSearchExhaustedPersisted, setFreeSearchExhaustedPersisted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastSearchRef = useRef<{ filters: SearchFilters; skipTrialCount: boolean; isDemo: boolean } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
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

  const storageKeys = useMemo(() => {
    if (!user?.id) return null;
    return {
      leads: `leadfinder_cached_leads:${user.id}`,
      filters: `leadfinder_cached_filters:${user.id}`,
      demoLeads: `leadfinder_demo_leads:${user.id}`,
    };
  }, [user?.id]);

  // Restore cached state after reloads — but only full results for subscribers
  // Non-subscribers get gated flag restored so the block persists
  useEffect(() => {
    if (!storageKeys) {
      setLeads([]);
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
          localStorage.removeItem(storageKeys.demoLeads);
          sessionStorage.removeItem(storageKeys.leads);
        } catch {}
        setLeads([]);
        return;
      }

      // Subscribers: restore cached leads normally
      // Try demo leads from localStorage first
      const demoRaw = localStorage.getItem(storageKeys.demoLeads);
      if (demoRaw) {
        const cached = JSON.parse(demoRaw) as { leads?: Lead[] };
        if (Array.isArray(cached?.leads) && cached.leads.length > 0) {
          setLeads(cached.leads);
          return;
        }
      }
      // Fall back to sessionStorage
      const cachedLeadsRaw = sessionStorage.getItem(storageKeys.leads);
      if (cachedLeadsRaw) {
        const cached = JSON.parse(cachedLeadsRaw) as { leads?: Lead[] };
        if (Array.isArray(cached?.leads)) setLeads(cached.leads);
      }
    } catch {
      // ignore cache parse errors
    }
  }, [storageKeys, isSubLoading, hasProAccess]);

  // Persist leads whenever they change
  useEffect(() => {
    if (!storageKeys) return;
    try {
      sessionStorage.setItem(storageKeys.leads, JSON.stringify({ leads }));
    } catch {
      // ignore quota/unavailable errors
    }
  }, [leads, storageKeys]);

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

  // Fetch all businesses to exclude (checked + outreach history + current leads)
  const fetchExcludedBusinesses = useCallback(async () => {
    if (!user) {
      setExcludedBusinesses([]);
      return;
    }

    // Fetch checked businesses, outreach history, and current leads in parallel
    const [checkedResult, historyResult, leadsResult] = await Promise.all([
      supabase.from('checked_businesses').select('business_name, google_maps_url'),
      supabase.from('outreach_history').select('business_name, google_maps_url'),
      supabase.from('outreach_leads').select('business_name, google_maps_url'),
    ]);

    // Viewed-only (checked) businesses are decluttered from results.
    setExcludedBusinesses(checkedResult.data || []);

    // In-list businesses (ever added) stay visible but get marked.
    const inList: ExcludedBusiness[] = [];
    if (historyResult.data) inList.push(...historyResult.data);
    if (leadsResult.data) inList.push(...leadsResult.data);
    setInListBusinesses(inList);
  }, [user]);

  useEffect(() => {
    fetchExcludedBusinesses();
  }, [fetchExcludedBusinesses]);

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

  const saveSearch = async (filters: SearchFilters, resultsCount: number, noWebsiteCount: number = 0) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('search_history').insert({
      user_id: user.id,
      keyword: filters.keyword.toLowerCase().trim(),
      location: filters.location.toLowerCase().trim(),
      radius: filters.radius,
      results_count: resultsCount,
      no_website_count: noWebsiteCount,
    });
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

    // Refresh excluded businesses before searching (skip for demo)
    if (!isDemo) await fetchExcludedBusinesses();

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
          body: { ...filters, skipTrialCount, ...(isDemo ? { demo: true } : {}) },
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
            setSearchError(null);
            setSearchNotice(body.notice ?? body.error ?? "Couldn't find that location — try adding a country or county.");
            setIsLoading(false);
            return;
          }

          // Non-retryable error — prefer the function's own friendly message
          // (body.notice / body.error) over the generic "non-2xx status code".
          const errMsg = body?.notice || body?.error
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
            setSearchError(null);
            setSearchNotice(data.notice ?? "Couldn't find that location — try adding a country or county.");
            setExpanded(false);
            setRegionMeta(null);
            setRegionDowngraded(null);
            setTownFilterFallback(null);
            setIsLoading(false);
            return;
          }

          // Filter out excluded businesses
          const filteredLeads = data.leads.filter(lead => !isExcluded(lead));

          // Sort: NO_WEBSITE/DIRECTORY_ONLY first, then others
          const statusOrder: Record<string, number> = {
            'NO_WEBSITE': 0,
            'DIRECTORY_ONLY': 0,
            'UNCERTAIN': 1,
            'HAS_OWN_WEBSITE': 2,
          };
          filteredLeads.sort((a, b) => (statusOrder[a.websiteStatus] ?? 9) - (statusOrder[b.websiteStatus] ?? 9));

          setLeads(filteredLeads);
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
          setGated(!!data.gated);

          // Persist gated flag so it survives refresh
          if (user?.id) {
            try {
              localStorage.setItem(`leadfinder_gated:${user.id}`, data.gated ? 'true' : 'false');
            } catch {}
          }

          // Persist demo leads to localStorage so they survive navigation
          if (storageKeys) {
            try {
              localStorage.setItem(storageKeys.demoLeads, JSON.stringify({ leads: filteredLeads }));
              sessionStorage.setItem(storageKeys.filters, JSON.stringify({ filters }));
            } catch {}
          }

          const noWebsiteCount = filteredLeads.filter(l => l.websiteStatus === 'NO_WEBSITE' || l.websiteStatus === 'DIRECTORY_ONLY').length;

          await saveSearch(filters, filteredLeads.length, noWebsiteCount);

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
  }), [displayedLeads, isLoading, search, setWebsiteOverride, retryLastSearch, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted, freeSearchExhausted, searchError, searchNotice, expanded, gated, regionMeta, regionDowngraded, townFilterFallback]);

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
