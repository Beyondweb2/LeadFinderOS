import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Lead } from '@/types/lead';

export function useCallList() {
  const [callList, setCallList] = useState<Lead[]>([]);
  const [addedHistory, setAddedHistory] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const addToCallList = useCallback((lead: Lead) => {
    if (addedHistory.has(lead.id)) {
      toast({
        title: 'Previously added',
        description: `${lead.name} has already been added to the call list before.`,
        variant: 'destructive',
      });
      return;
    }

    setAddedHistory((prev) => new Set(prev).add(lead.id));
    setCallList((prev) => [...prev, lead]);
    toast({
      title: 'Added to call list',
      description: `${lead.name} added to your call list.`,
    });
  }, [addedHistory, toast]);

  const removeFromCallList = useCallback((leadId: string) => {
    setCallList((prev) => {
      const lead = prev.find((l) => l.id === leadId);
      if (lead) {
        toast({
          title: 'Removed from call list',
          description: `${lead.name} removed from your call list.`,
        });
      }
      return prev.filter((l) => l.id !== leadId);
    });
  }, [toast]);

  const clearCallList = useCallback(() => {
    setCallList([]);
    toast({
      title: 'Call list cleared',
      description: 'All businesses removed from your call list.',
    });
  }, [toast]);

  const isInCallList = useCallback((leadId: string) => {
    return callList.some((l) => l.id === leadId);
  }, [callList]);

  const exportCallListToCsv = useCallback(() => {
    if (callList.length === 0) {
      toast({
        title: 'No data to export',
        description: 'Add businesses to your call list first.',
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
    ];

    const rows = callList.map((lead) => [
      lead.name,
      lead.category || '',
      lead.address,
      lead.phone || '',
      lead.rating?.toString() || '',
      lead.reviewCount?.toString() || '',
      lead.googleMapsUrl,
      lead.websiteUrl || '',
      lead.websiteStatus,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `call-list-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Export complete',
      description: `Exported ${callList.length} businesses to CSV.`,
    });
  }, [callList, toast]);

  return {
    callList,
    addToCallList,
    removeFromCallList,
    clearCallList,
    isInCallList,
    exportCallListToCsv,
  };
}
