import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
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
  searchError: string | null;
}

const LeadSearchContext = createContext<LeadSearchContextType | null>(null);

export function LeadSearchProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [excludedBusinesses, setExcludedBusinesses] = useState<ExcludedBusiness[]>([]);
  const [trialLimitError, setTrialLimitError] = useState<TrialLimitError | null>(null);
  const [postAbandonExhausted, setPostAbandonExhausted] = useState(false);
  const [freeSearchExhausted, setFreeSearchExhausted] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSearchRef = useRef<{ filters: SearchFilters; skipTrialCount: boolean; isDemo: boolean } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const clearTrialLimitError = useCallback(() => setTrialLimitError(null), []);

  const storageKeys = useMemo(() => {
    if (!user?.id) return null;
    return {
      leads: `leadfinder_cached_leads:${user.id}`,
      filters: `leadfinder_cached_filters:${user.id}`,
      demoLeads: `leadfinder_demo_leads:${user.id}`,
    };
  }, [user?.id]);

  // Restore cached state after reloads so users don't lose progress
  // Use localStorage for demo leads (survives navigation), sessionStorage for regular
  useEffect(() => {
    if (!storageKeys) {
      setLeads([]);
      return;
    }

    try {
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
  }, [storageKeys]);

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

    setIsLoading(true);
    setTrialLimitError(null);
    setPostAbandonExhausted(false);
    setFreeSearchExhausted(false);
    setSearchError(null);
    
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
          
          // Non-retryable error — show to user, keep last results visible
          const errMsg = error.message || 'Search failed. Tap retry to try again.';
          setSearchError(errMsg);
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

          // Sort: NO_WEBSITE first, then DIRECTORY_ONLY, then others
          const statusOrder: Record<string, number> = {
            'NO_WEBSITE': 0,
            'UNCERTAIN': 1,
            'DIRECTORY_ONLY': 2,
            'HAS_OWN_WEBSITE': 3,
          };
          filteredLeads.sort((a, b) => (statusOrder[a.websiteStatus] ?? 9) - (statusOrder[b.websiteStatus] ?? 9));

          setLeads(filteredLeads);
          setSearchError(null);

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
        // All retries exhausted — keep last results visible, show error
        const errMsg = err?.message?.includes('timed out')
          ? 'Search timed out — please try again.'
          : 'Connection error — please check your internet and try again.';
        setSearchError(errMsg);
        toast({
          title: 'Search failed',
          description: errMsg,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
    }
  }, [toast, fetchExcludedBusinesses, isExcluded, storageKeys]);

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
  }), [leads, isLoading, search, retryLastSearch, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted, freeSearchExhausted, searchError]);

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
