import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { reportClientError } from '@/lib/errorReporting';
import type { Lead, SearchFilters, SearchResponse } from '@/types/lead';

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
  retryLastSearch: () => void;
  exportToCsv: () => void;
  trialLimitError: TrialLimitError | null;
  clearTrialLimitError: () => void;
  postAbandonExhausted: boolean;
  freeSearchExhausted: boolean;
  searchError: { message: string; errorId: string } | null;
  expanded: boolean;
  gated: boolean;
}

const LeadSearchContext = createContext<LeadSearchContextType | null>(null);

export function LeadSearchProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [excludedBusinesses, setExcludedBusinesses] = useState<ExcludedBusiness[]>([]);
  const [trialLimitError, setTrialLimitError] = useState<TrialLimitError | null>(null);
  const [postAbandonExhausted, setPostAbandonExhausted] = useState(false);
  const [freeSearchExhausted, setFreeSearchExhausted] = useState(false);
  const [searchError, setSearchError] = useState<{ message: string; errorId: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [gated, setGated] = useState(false);
  const [freeSearchExhaustedPersisted, setFreeSearchExhaustedPersisted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastSearchRef = useRef<{ filters: SearchFilters; skipTrialCount: boolean; isDemo: boolean } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isPaidSubscriber, isStripeTrialing, isAdmin, isLoading: isSubLoading } = useSubscription();
  const hasProAccess = isPaidSubscriber || isStripeTrialing || isAdmin;
  const FREE_SEARCH_CAP = 3;

  // Get/set localStorage search count for non-pro users (works for both auth and unauth)
  const getSearchCount = useCallback((): number => {
    try {
      const key = user?.id ? `leadfinder_search_count:${user.id}` : 'leadfinder_search_count_guest';
      return parseInt(localStorage.getItem(key) || '0', 10);
    } catch { return 0; }
  }, [user?.id]);

  const incrementSearchCount = useCallback(() => {
    try {
      const key = user?.id ? `leadfinder_search_count:${user.id}` : 'leadfinder_search_count_guest';
      const current = parseInt(localStorage.getItem(key) || '0', 10);
      localStorage.setItem(key, String(current + 1));
    } catch {}
  }, [user?.id]);

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

    const excluded: ExcludedBusiness[] = [];

    if (checkedResult.data) {
      excluded.push(...checkedResult.data);
    }
    if (historyResult.data) {
      excluded.push(...historyResult.data);
    }
    if (leadsResult.data) {
      excluded.push(...leadsResult.data);
    }

    setExcludedBusinesses(excluded);
  }, [user]);

  useEffect(() => {
    fetchExcludedBusinesses();
  }, [fetchExcludedBusinesses]);

  const isExcluded = useCallback((lead: Lead): boolean => {
    return excludedBusinesses.some(
      (b) => b.business_name === lead.name || 
             (lead.googleMapsUrl && b.google_maps_url === lead.googleMapsUrl)
    );
  }, [excludedBusinesses]);

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

    // 3-search cap for non-pro users
    if (!hasProAccess) {
      const count = getSearchCount();
      if (count >= FREE_SEARCH_CAP) {
        setTrialLimitError({ searchesToday: count, limit: FREE_SEARCH_CAP });
        return;
      }
    }

    setIsLoading(true);
    setTrialLimitError(null);
    setPostAbandonExhausted(false);
    setFreeSearchExhausted(false);
    setSearchError(null);
    setExpanded(false);
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
    const TIMEOUT_MS = 30_000; // 30s timeout

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
              } else if (error.message.includes('Trial limit reached') || error.message.includes('TRIAL_LIMIT_REACHED')) {
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
          if (body?.code === 'TRIAL_LIMIT_REACHED') {
            setTrialLimitError({
              searchesToday: body.searches_today || 3,
              limit: body.limit || 3,
            });
            setIsLoading(false);
            return;
          }
          
          // Non-retryable error — report diagnostics and show to user
          const errMsg = error.message || 'Search failed. Tap retry to try again.';
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
          setGated(!!data.gated);

          // Increment search count for non-pro users after successful search
          if (!hasProAccess) {
            incrementSearchCount();
          }

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

  const contextValue = useMemo(() => ({ 
    leads, 
    isLoading, 
    search, 
    retryLastSearch,
    exportToCsv,
    trialLimitError,
    clearTrialLimitError,
    postAbandonExhausted,
    freeSearchExhausted,
    searchError,
    expanded,
    gated,
  }), [leads, isLoading, search, retryLastSearch, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted, freeSearchExhausted, searchError, expanded, gated]);

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
