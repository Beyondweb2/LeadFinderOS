import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Lead } from '@/types/lead';

export function useCallList() {
  const [callList, setCallList] = useState<Lead[]>([]);
  const addedHistoryRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();

  const addToCallList = useCallback((lead: Lead) => {
    if (addedHistoryRef.current.has(lead.id)) {
      toast({
        title: 'Previously added',
        description: `${lead.name} has already been added to the call list before.`,
        variant: 'destructive',
      });
      return;
    }

    addedHistoryRef.current.add(lead.id);
    setCallList((prev) => [...prev, lead]);
    // Added — no toast
  }, [toast]);

  const removeFromCallList = useCallback((leadId: string) => {
    setCallList((prev) => {
      return prev.filter((l) => l.id !== leadId);
      return prev.filter((l) => l.id !== leadId);
    });
  }, [toast]);

  const clearCallList = useCallback(() => {
    setCallList([]);
    // Cleared — no toast
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

    // Format compatible with external CRM apps
    const headers = [
      'businessName',
      'contactPerson',
      'phone',
      'email',
      'googleMapsUrl',
      'notes',
    ];

    const rows = callList.map((lead) => [
      lead.name,
      '', // contactPerson - not available
      lead.phone || '',
      '', // email - not available
      lead.googleMapsUrl,
      `${lead.category || ''} | ${lead.address}`, // notes - include category and address as context
    ]);

    const escapeCell = (cell: string) => {
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    };

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCell).join(','))
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

    // Export complete — no toast
  }, [callList, toast]);

  const importCallListFromCsv = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        toast({
          title: 'Import failed',
          description: 'Could not read the file.',
          variant: 'destructive',
        });
        return;
      }

      const lines = text.split('\n').filter((line) => line.trim());
      if (lines.length < 2) {
        toast({
          title: 'Import failed',
          description: 'CSV file is empty or has no data rows.',
          variant: 'destructive',
        });
        return;
      }

      // Parse header to find column indices
      const headerLine = lines[0];
      const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().trim());
      
      const businessNameIdx = headers.findIndex((h) => h === 'businessname' || h === 'business name');
      const phoneIdx = headers.findIndex((h) => h === 'phone');
      const googleMapsUrlIdx = headers.findIndex((h) => h === 'googlemapsurl' || h === 'google maps url');
      const notesIdx = headers.findIndex((h) => h === 'notes');

      if (businessNameIdx === -1) {
        toast({
          title: 'Import failed',
          description: 'CSV must have a "businessName" column.',
          variant: 'destructive',
        });
        return;
      }

      const importedLeads: Lead[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const name = values[businessNameIdx]?.trim();
        
        if (!name) continue;

        // Parse notes to extract category and address if available
        const notes = notesIdx !== -1 ? values[notesIdx]?.trim() || '' : '';
        const [category, address] = notes.includes('|') 
          ? notes.split('|').map((s) => s.trim()) 
          : ['', notes];

        const lead: Lead = {
          id: `imported-${Date.now()}-${i}`,
          name,
          phone: phoneIdx !== -1 ? values[phoneIdx]?.trim() || '' : '',
          address: address || 'Imported lead',
          googleMapsUrl: googleMapsUrlIdx !== -1 ? values[googleMapsUrlIdx]?.trim() || '' : '',
          category: category || undefined,
          websiteStatus: 'UNCERTAIN',
          confidence: 0,
          reason: 'Imported from CSV',
        };

        // Skip if already in list by name
        if (!callList.some((l) => l.name === lead.name) && !importedLeads.some((l) => l.name === lead.name)) {
          importedLeads.push(lead);
        }
      }

      if (importedLeads.length === 0) {
        toast({
          title: 'No new leads',
          description: 'All leads in the CSV are already in your call list.',
        });
        return;
      }

      setCallList((prev) => [...prev, ...importedLeads]);
      importedLeads.forEach((lead) => addedHistoryRef.current.add(lead.id));

      // Import complete — no toast
    };

    reader.onerror = () => {
      toast({
        title: 'Import failed',
        description: 'Error reading the file.',
        variant: 'destructive',
      });
    };

    reader.readAsText(file);
  }, [callList, toast]);

  return {
    callList,
    addToCallList,
    removeFromCallList,
    clearCallList,
    isInCallList,
    exportCallListToCsv,
    importCallListFromCsv,
  };
}

// Helper function to parse CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}
