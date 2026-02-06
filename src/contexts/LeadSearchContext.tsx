import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { Lead, SearchFilters, SearchResponse } from '@/types/lead';

interface ExcludedBusiness {
  business_name: string;
  google_maps_url: string | null;
}

interface LeadSearchContextType {
  leads: Lead[];
  isLoading: boolean;
  search: (filters: SearchFilters) => Promise<void>;
  exportToCsv: () => void;
}

const LeadSearchContext = createContext<LeadSearchContextType | null>(null);

export function LeadSearchProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [excludedBusinesses, setExcludedBusinesses] = useState<ExcludedBusiness[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

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

  const search = useCallback(async (filters: SearchFilters) => {
    setIsLoading(true);
    
    // Refresh excluded businesses before searching
    await fetchExcludedBusinesses();
    
    try {
      const { data, error } = await supabase.functions.invoke<SearchResponse>('search-leads', {
        body: filters,
      });

      if (error) {
        console.error('Search error:', error);
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
        await saveSearch(filters, filteredLeads.length);
        
        const noWebsiteCount = filteredLeads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;
        const excludedMsg = excludedCount > 0 ? ` (${excludedCount} previously seen filtered out)` : '';
        
        toast({
          title: 'Search complete',
          description: `Found ${filteredLeads.length} new businesses. ${noWebsiteCount} without websites.${excludedMsg}`,
        });
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
  }, [toast, fetchExcludedBusinesses, isExcluded]);

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
  }, [leads, toast]);

  return (
    <LeadSearchContext.Provider value={{ leads, isLoading, search, exportToCsv }}>
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
