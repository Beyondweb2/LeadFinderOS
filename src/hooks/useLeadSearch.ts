import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Lead, SearchFilters, SearchResponse } from '@/types/lead';

export function useLeadSearch() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const search = async (filters: SearchFilters) => {
    setIsLoading(true);
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
        setLeads(data.leads);
        toast({
          title: 'Search complete',
          description: `Found ${data.leads.length} businesses. ${data.leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length} without websites.`,
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

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

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
  };

  return {
    leads,
    isLoading,
    search,
    exportToCsv,
  };
}
