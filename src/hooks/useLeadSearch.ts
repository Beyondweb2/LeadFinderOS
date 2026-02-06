import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Lead, SearchFilters, SearchResponse } from '@/types/lead';

interface TrialLimitError {
  searchesToday: number;
  limit: number;
}

export function useLeadSearch() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [trialLimitError, setTrialLimitError] = useState<TrialLimitError | null>(null);
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

  const search = async (filters: SearchFilters) => {
    setIsLoading(true);
    setTrialLimitError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke<SearchResponse>('search-leads', {
        body: filters,
      });

      if (error) {
        console.error('Search error:', error);
        
        // Try to parse the error context for trial limit
        try {
          const errorContext = error.context;
          if (errorContext && typeof errorContext === 'object') {
            const body = await errorContext.json?.() || errorContext;
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
        
        // Check for network/connection errors
        const errorMessage = error.message?.toLowerCase() || '';
        const isNetworkError = errorMessage.includes('failed to send') || 
                               errorMessage.includes('network') ||
                               errorMessage.includes('fetch');
        
        toast({
          title: 'Search failed',
          description: isNetworkError 
            ? 'Network error - please check your connection and try again.'
            : (error.message || 'Failed to search for businesses. Please try again.'),
          variant: 'destructive',
        });
        return;
      }

      if (data) {
        setLeads(data.leads);
        await saveSearch(filters, data.leads.length);
        toast({
          title: 'Search complete',
          description: `Found ${data.leads.length} businesses. ${data.leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length} without websites.`,
        });
      }
    } catch (err) {
      console.error('Search error:', err);
      toast({
        title: 'Search failed',
        description: 'Connection error - please check your internet and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
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

      toast({
        title: 'Export complete',
        description: `Exported ${leads.length} leads to CSV.`,
      });
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
  };
}
