import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
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
  exportToCsv: () => void;
  trialLimitError: TrialLimitError | null;
  clearTrialLimitError: () => void;
  postAbandonExhausted: boolean;
  freeSearchExhausted: boolean;
}

const LeadSearchContext = createContext<LeadSearchContextType | null>(null);

export function LeadSearchProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [excludedBusinesses, setExcludedBusinesses] = useState<ExcludedBusiness[]>([]);
  const [trialLimitError, setTrialLimitError] = useState<TrialLimitError | null>(null);
  const [postAbandonExhausted, setPostAbandonExhausted] = useState(false);
  const [freeSearchExhausted, setFreeSearchExhausted] = useState(false);
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
    setIsLoading(true);
    setTrialLimitError(null);
    setPostAbandonExhausted(false);
    setFreeSearchExhausted(false);
    
    // Refresh excluded businesses before searching (skip for demo)
    if (!isDemo) await fetchExcludedBusinesses();
    
    try {
      const { data, error } = await supabase.functions.invoke<SearchResponse>('search-leads', {
        body: { ...filters, skipTrialCount, ...(isDemo ? { demo: true } : {}) },
      });

      if (error) {
        console.error('Search error:', error);
        
        // Try to parse the error for trial limit
        try {
          const errorContext = error.context;
          if (errorContext && typeof errorContext === 'object') {
            // Handle FunctionsHttpError which has a json() method
            const body = typeof errorContext.json === 'function' 
              ? await errorContext.json() 
              : errorContext;
            if (body?.code === 'POST_ABANDON_EXHAUSTED') {
              setPostAbandonExhausted(true);
              return;
            }
            if (body?.code === 'FREE_SEARCH_EXHAUSTED') {
              setFreeSearchExhausted(true);
              // Log analytics
              try { supabase.rpc('log_usage_event', { p_event_type: 'search_2_blocked' }); } catch {}
              return;
            }
            if (body?.code === 'TRIAL_LIMIT_REACHED') {
              setTrialLimitError({
                searchesToday: body.searches_today || 3,
                limit: body.limit || 3,
              });
              return;
            }
          }
        } catch {
          // Check if error message indicates trial limit
          if (error.message?.includes('Trial limit reached')) {
            setTrialLimitError({ searchesToday: 3, limit: 3 });
            return;
          }
        }
        
        toast({
          title: 'Search failed',
          description: error.message || 'Failed to search for businesses. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      if (data) {
        // Filter out excluded businesses
        const filteredLeads = data.leads.filter(lead => !isExcluded(lead));
        const excludedCount = data.leads.length - filteredLeads.length;

        setLeads(filteredLeads);

        // Persist demo leads to localStorage so they survive navigation
        if (storageKeys) {
          try {
            localStorage.setItem(storageKeys.demoLeads, JSON.stringify({ leads: filteredLeads }));
            sessionStorage.setItem(storageKeys.filters, JSON.stringify({ filters }));
          } catch {
            // ignore
          }
        }

        const noWebsiteCount = filteredLeads.filter(l => l.websiteStatus === 'NO_WEBSITE' || l.websiteStatus === 'DIRECTORY_ONLY').length;
        
        await saveSearch(filters, filteredLeads.length, noWebsiteCount);
        const excludedMsg = excludedCount > 0 ? ` (${excludedCount} previously seen filtered out)` : '';

        // Notify demo checklist that a search completed
        window.dispatchEvent(new CustomEvent('demo-checklist-search'));

        // Search complete — no toast (reduces UI noise)
      }
    } catch (err) {
      console.error('Search error:', err);
      toast({
        title: 'Search failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, fetchExcludedBusinesses, isExcluded, storageKeys]);

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

  return (
    <LeadSearchContext.Provider value={{ 
      leads, 
      isLoading, 
      search, 
      exportToCsv,
      trialLimitError,
      clearTrialLimitError,
      postAbandonExhausted,
      freeSearchExhausted,
    }}>
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
