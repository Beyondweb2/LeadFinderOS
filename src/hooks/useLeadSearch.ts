import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { reportClientError } from '@/lib/errorReporting';
import type { Lead, SearchFilters, SearchResponse } from '@/types/lead';

interface TrialLimitError {
  searchesToday: number;
  limit: number;
}

interface SearchErrorState {
  errorId: string;
  message: string;
}

export function useLeadSearch() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [trialLimitError, setTrialLimitError] = useState<TrialLimitError | null>(null);
  const [postAbandonExhausted, setPostAbandonExhausted] = useState(false);
  const [searchError, setSearchError] = useState<SearchErrorState | null>(null);
  const [lastFilters, setLastFilters] = useState<SearchFilters | null>(null);
  const { toast } = useToast();

  const checkPreviousSearch = async (filters: SearchFilters): Promise<{ searched: boolean; date?: string; count?: number }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { searched: false };

    const normalizedLocation = filters.location.toLowerCase().trim();
    const normalizedKeyword = filters.keyword.toLowerCase().trim();

    const { data } = await supabase
      .from('search_history')
      .select('searched_at, results_count')
      .eq('user_id', user.id)
      .ilike('location', normalizedLocation)
      .ilike('keyword', normalizedKeyword)
      .order('searched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      return { 
        searched: true, 
        date: new Date(data.searched_at).toLocaleDateString(),
        count: data.results_count
      };
    }
    return { searched: false };
  };

  const saveSearch = async (filters: SearchFilters, resultsCount: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('search_history').insert({
      user_id: user.id,
      keyword: filters.keyword.toLowerCase().trim(),
      location: filters.location.toLowerCase().trim(),
      radius: filters.radius,
      results_count: resultsCount,
    });
  };

  const clearTrialLimitError = () => setTrialLimitError(null);
  const clearSearchError = () => setSearchError(null);

  const search = async (filters: SearchFilters) => {
    setIsLoading(true);
    setTrialLimitError(null);
    setPostAbandonExhausted(false);
    setSearchError(null);
    setLastFilters(filters);
    
    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch { /* ignore */ }

    try {
      const { data, error } = await supabase.functions.invoke<SearchResponse>('search-leads', {
        body: filters,
      });

      if (error) {
        console.error('Search error:', error);
        
        // Try to parse the error context for trial limit / post-abandon / location
        let parsedBody: any = null;
        try {
          const errorContext = error.context;
          if (errorContext && typeof errorContext === 'object') {
            parsedBody = await errorContext.json?.() || errorContext;
            if (parsedBody?.code === 'POST_ABANDON_EXHAUSTED') {
              setPostAbandonExhausted(true);
              return;
            }
            if (parsedBody?.code === 'TRIAL_LIMIT_REACHED') {
              setTrialLimitError({
                searchesToday: parsedBody.searches_today || 3,
                limit: parsedBody.limit || 3,
              });
              return;
            }
            // Handle location not found / handled notice — show the friendly
            // message (no error ID), never the generic "non-2xx status code".
            if (parsedBody?.notFound || parsedBody?.error?.toLowerCase().includes('location not found')) {
              setSearchError({
                errorId: '',
                message: parsedBody?.notice ?? parsedBody?.error ?? 'Location not found. Please check the address or try a different location.',
              });
              return;
            }
          }
        } catch {
          if (error.message?.includes('Trial limit reached')) {
            setTrialLimitError({ searchesToday: 3, limit: 3 });
            return;
          }
        }
        
        // Check for network/connection errors
        const errorMessage = error.message?.toLowerCase() || '';
        const isNetworkError = errorMessage.includes('failed to send') || 
                               errorMessage.includes('network') ||
                               errorMessage.includes('fetch');
        
        // Report diagnostic error
        const errorId = await reportClientError({
          functionName: 'search-leads',
          payload: { keyword: filters.keyword, location: filters.location, radius: filters.radius },
          userId,
          httpStatus: (error.context as any)?.status ?? null,
          responseBody: parsedBody ? JSON.stringify(parsedBody).slice(0, 4000) : error.message,
          errorMessage: error.message,
          extra: { isNetworkError },
        });

        setSearchError({
          errorId,
          message: isNetworkError 
            ? 'Network error — please check your connection and try again.'
            : 'Something went wrong running this search. Please try again.',
        });
        return;
      }

      if (data) {
        // Handled non-result outcomes (clean 2xx): show the friendly notice instead
        // of results, never a generic error.
        if (data.notFound || data.serviceIssue) {
          setLeads([]);
          setSearchError({
            errorId: '',
            message: data.notice ?? "Couldn't find that location — try adding a country or county.",
          });
          return;
        }
        setLeads(data.leads);
        await saveSearch(filters, data.leads.length);
      }
    } catch (err: any) {
      console.error('Search error:', err);
      
      const errorId = await reportClientError({
        functionName: 'search-leads',
        payload: { keyword: filters.keyword, location: filters.location, radius: filters.radius },
        userId,
        errorMessage: err?.message || String(err),
        errorStack: err?.stack,
      });

      setSearchError({
        errorId,
        message: 'Connection error — please check your internet and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const retrySearch = () => {
    if (lastFilters) {
      search(lastFilters);
    }
  };

  const exportToCsv = () => {
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
      'Category',
      'Address',
      'Phone',
      'Rating',
      'Review Count',
      'Google Maps URL',
      'Website URL',
      'Website Status',
      'Confidence',
      'Reason',
    ];

    const rows = leads.map((lead) => [
      lead.name,
      lead.category || '',
      lead.address,
      lead.phone || '',
      lead.rating?.toString() || '',
      lead.reviewCount?.toString() || '',
      lead.googleMapsUrl,
      lead.websiteUrl || '',
      lead.websiteStatus,
      `${Math.round(lead.confidence * 100)}%`,
      lead.reason,
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
    } catch (err) {
      console.error('CSV export failed:', err);
      toast({
        title: 'Export failed',
        description: 'Failed to export leads to CSV. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return {
    leads,
    isLoading,
    search,
    exportToCsv,
    trialLimitError,
    clearTrialLimitError,
    postAbandonExhausted,
    checkPreviousSearch,
    searchError,
    clearSearchError,
    retrySearch,
  };
}
