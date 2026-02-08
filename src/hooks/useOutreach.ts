import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead, OutreachActivity, LeadStatus, NextActionType, Country, ListType } from '@/types/outreach';
import type { Lead } from '@/types/lead';

interface OutreachHistoryEntry {
  business_name: string;
  google_maps_url: string | null;
   phone: string | null;
}

export function useOutreach() {
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [archivedLeads, setArchivedLeads] = useState<OutreachLead[]>([]);
  const [activities, setActivities] = useState<OutreachActivity[]>([]);
  const [outreachHistory, setOutreachHistory] = useState<OutreachHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    
    // Fetch active leads
    const { data: activeData, error: activeError } = await supabase
      .from('outreach_leads')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: false });

    // Fetch archived leads
    const { data: archivedData, error: archivedError } = await supabase
      .from('outreach_leads')
      .select('*')
      .eq('is_archived', true)
      .order('updated_at', { ascending: false });

    setIsLoading(false);

    if (activeError) {
      console.error('Error fetching active leads:', activeError);
      toast({
        title: 'Error loading leads',
        description: activeError.message,
        variant: 'destructive',
      });
      return;
    }

    if (archivedError) {
      console.error('Error fetching archived leads:', archivedError);
    }

    setLeads((activeData || []) as OutreachLead[]);
    setArchivedLeads((archivedData || []) as OutreachLead[]);
  }, [user, toast]);

  const fetchOutreachHistory = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('outreach_history')
      .select('business_name, google_maps_url');

    if (error) {
      console.error('Error fetching outreach history:', error);
      return;
    }

    setOutreachHistory(data as OutreachHistoryEntry[]);
  }, [user]);

  const fetchActivities = useCallback(async (leadId: string) => {
    const { data, error } = await supabase
      .from('outreach_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching activities:', error);
      return [];
    }

    return data as OutreachActivity[];
  }, []);

  useEffect(() => {
    fetchLeads();
    fetchOutreachHistory();
  }, [fetchLeads, fetchOutreachHistory]);

  const addLead = useCallback(async (lead: Lead, country: Country = 'UK', listType: ListType = 'no_website') => {
    if (!user) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in to add leads.',
        variant: 'destructive',
      });
      return null;
    }

    // Check if lead was EVER added before (even if deleted) using outreach_history
    // Use separate parameterized queries to prevent PostgREST injection
    const { data: nameMatch } = await supabase
      .from('outreach_history')
      .select('id')
      .eq('business_name', lead.name)
      .limit(1)
      .maybeSingle();
    
    let historyMatch = nameMatch;
    
    // If no match by name and we have a URL, check by URL
    if (!historyMatch && lead.googleMapsUrl) {
      const { data: urlMatch } = await supabase
        .from('outreach_history')
        .select('id')
        .eq('google_maps_url', lead.googleMapsUrl)
        .limit(1)
        .maybeSingle();
      
      historyMatch = urlMatch;
    }

    if (historyMatch) {
      toast({
        title: 'Previously added',
        description: `${lead.name} was already added to your outreach list before.`,
        variant: 'destructive',
      });
      return null;
    }

    // Also check outreach_leads table directly (including archived) to catch edge cases
    const { data: existingLead } = await supabase
      .from('outreach_leads')
      .select('id, is_archived')
      .eq('business_name', lead.name)
      .limit(1)
      .maybeSingle();

    let leadMatch = existingLead;

    // If no match by name and we have a URL, check by URL
    if (!leadMatch && lead.googleMapsUrl) {
      const { data: urlLead } = await supabase
        .from('outreach_leads')
        .select('id, is_archived')
        .eq('google_maps_url', lead.googleMapsUrl)
        .limit(1)
        .maybeSingle();
      
      leadMatch = urlLead;
    }

    if (leadMatch) {
      const message = leadMatch.is_archived 
        ? `${lead.name} is in your archive.`
        : `${lead.name} is already in your outreach list.`;
      toast({
        title: 'Previously added',
        description: message,
        variant: 'destructive',
      });
      return null;
    }

    const { data, error } = await supabase
      .from('outreach_leads')
      .insert({
        user_id: user.id,
        business_name: lead.name,
        phone: lead.phone || null,
        email: null,
        google_maps_url: lead.googleMapsUrl,
        address: lead.address,
        category: lead.category || null,
        status: 'not_contacted' as LeadStatus,
        next_action: 'none' as NextActionType,
        next_action_date: null,
        country,
        list_type: listType,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Error adding lead',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }

    const newLead = data as OutreachLead;
    setLeads((prev) => [newLead, ...prev]);

    // Track in history (so we remember even if deleted later)
    await supabase.from('outreach_history').insert({
      user_id: user.id,
      business_name: lead.name,
      google_maps_url: lead.googleMapsUrl || null,
      country,
       phone: lead.phone || null,
    });

    // Update local history cache
    setOutreachHistory((prev) => [...prev, { 
      business_name: lead.name, 
       google_maps_url: lead.googleMapsUrl || null,
       phone: lead.phone || null,
    }]);

    // Log activity
    await logActivity(newLead.id, 'added', `Added ${lead.name} to outreach list`);

    toast({
      title: 'Lead added',
      description: `${lead.name} added to your outreach list.`,
    });

    return newLead;
  }, [user, toast]);

  const updateLead = useCallback(async (
    leadId: string,
    updates: Partial<Pick<OutreachLead, 'status' | 'next_action' | 'next_action_date' | 'notes' | 'email'>>
  ) => {
    const { data, error } = await supabase
      .from('outreach_leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      toast({
        title: 'Error updating lead',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }

    const updatedLead = data as OutreachLead;
    
    // Update in correct list based on archived status
    if (updatedLead.is_archived) {
      setArchivedLeads((prev) => prev.map((l) => (l.id === leadId ? updatedLead : l)));
    } else {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updatedLead : l)));
    }

    return updatedLead;
  }, [toast]);

  const deleteLead = useCallback(async (leadId: string, silent = false) => {
    const lead = leads.find((l) => l.id === leadId);
    const archivedLead = archivedLeads.find((l) => l.id === leadId);
    const targetLead = lead || archivedLead;
    
    const { error } = await supabase
      .from('outreach_leads')
      .delete()
      .eq('id', leadId);

    if (error) {
      toast({
        title: 'Error deleting lead',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setArchivedLeads((prev) => prev.filter((l) => l.id !== leadId));
    
    if (!silent) {
      toast({
        title: 'Lead removed',
        description: targetLead ? `${targetLead.business_name} removed from outreach.` : 'Lead removed.',
      });
    }

    return true;
  }, [leads, archivedLeads, toast]);

  const updateStatus = useCallback(async (leadId: string, status: LeadStatus) => {
    const lead = leads.find((l) => l.id === leadId);
    const archivedLead = archivedLeads.find((l) => l.id === leadId);
    const targetLead = lead || archivedLead;
    
    const result = await updateLead(leadId, { status });
    
    // Log activity inline (avoid dependency issue with logActivity)
    if (result && targetLead && user) {
      await supabase.from('outreach_activities').insert({
        lead_id: leadId,
        user_id: user.id,
        activity_type: 'status_change',
        description: `Status changed to ${status.replace('_', ' ')}`,
      });
    }

    // Auto-archive (not delete) if status set to not_interested - preserves data for future lookup
    if (result && status === 'not_interested' && lead) {
      const { error } = await supabase
        .from('outreach_leads')
        .update({ is_archived: true })
        .eq('id', leadId);

      if (!error) {
        setLeads((prev) => prev.filter((l) => l.id !== leadId));
        setArchivedLeads((prev) => [{ ...lead, is_archived: true, status: 'not_interested' }, ...prev]);
      }
    }
    
    return result;
  }, [leads, archivedLeads, updateLead, user]);

  const updateNextAction = useCallback(async (
    leadId: string,
    nextAction: NextActionType,
    nextActionDate?: string
  ) => {
    const updates: Partial<OutreachLead> = { next_action: nextAction };
    if (nextActionDate) {
      updates.next_action_date = nextActionDate;
    }
    
    const lead = leads.find((l) => l.id === leadId);
    const result = await updateLead(leadId, updates);
    
    if (result && lead) {
      const dateStr = nextActionDate ? ` for ${nextActionDate}` : '';
      await logActivity(leadId, 'action_scheduled', `Next action: ${nextAction.replace('_', ' ')}${dateStr}`);
    }
    
    return result;
  }, [leads, updateLead]);

  const updateNotes = useCallback(async (leadId: string, notes: string) => {
    return updateLead(leadId, { notes });
  }, [updateLead]);


  const deleteAllLeads = useCallback(async () => {
   if (!user) return false;

    const { error } = await supabase
      .from('outreach_leads')
     .update({ is_archived: true })
     .eq('user_id', user.id)
     .eq('is_archived', false);

    if (error) {
      toast({
       title: 'Error archiving leads',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

   // Move all leads to archived list
   setArchivedLeads((prev) => [...leads.map(l => ({ ...l, is_archived: true })), ...prev]);
    setLeads([]);
    
    toast({
     title: 'All leads archived',
     description: `${leads.length} leads moved to archive.`,
    });

    return true;
 }, [user, leads, toast]);

  const logActivity = useCallback(async (
    leadId: string,
    activityType: string,
    description: string
  ) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('outreach_activities')
      .insert({
        lead_id: leadId,
        user_id: user.id,
        activity_type: activityType,
        description,
      })
      .select()
      .single();

    if (error) {
      console.error('Error logging activity:', error);
      return null;
    }

    return data as OutreachActivity;
  }, [user]);

  const isInOutreach = useCallback((leadName: string, googleMapsUrl?: string): boolean => {
    // Check against outreach history (includes all businesses ever added, even if deleted)
    const inHistory = outreachHistory.some(
      (h) => h.business_name === leadName || (googleMapsUrl && h.google_maps_url === googleMapsUrl)
    );
    
    // Also check active leads
    const inActive = leads.some(
      (l) => l.business_name === leadName || (googleMapsUrl && l.google_maps_url === googleMapsUrl)
    );
    
    // Also check archived leads
    const inArchived = archivedLeads.some(
      (l) => l.business_name === leadName || (googleMapsUrl && l.google_maps_url === googleMapsUrl)
    );
    
    return inHistory || inActive || inArchived;
  }, [outreachHistory, leads, archivedLeads]);

  // Internal archive function (can be silent)
  const archiveLeadInternal = useCallback(async (leadId: string, lead: OutreachLead, silent = false) => {
    const { error } = await supabase
      .from('outreach_leads')
      .update({ is_archived: true })
      .eq('id', leadId);

    if (error) {
      if (!silent) {
        toast({
          title: 'Error archiving lead',
          description: error.message,
          variant: 'destructive',
        });
      }
      return false;
    }

    // Move from active to archived
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setArchivedLeads((prev) => [{ ...lead, is_archived: true }, ...prev]);
    
    if (!silent) {
      toast({
        title: 'Lead archived',
        description: `${lead.business_name} moved to archive.`,
      });
    }

    return true;
  }, [toast]);

  // Archive a single lead (public API)
  const archiveLead = useCallback(async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return false;
    return archiveLeadInternal(leadId, lead, false);
  }, [leads, archiveLeadInternal]);

  // Unarchive a single lead
  const unarchiveLead = useCallback(async (leadId: string) => {
    const lead = archivedLeads.find((l) => l.id === leadId);
    if (!lead) return false;

    const { error } = await supabase
      .from('outreach_leads')
      .update({ is_archived: false })
      .eq('id', leadId);

    if (error) {
      toast({
        title: 'Error unarchiving lead',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

    // Move from archived to active
    setArchivedLeads((prev) => prev.filter((l) => l.id !== leadId));
    setLeads((prev) => [{ ...lead, is_archived: false }, ...prev]);
    
    toast({
      title: 'Lead restored',
      description: `${lead.business_name} moved to active list.`,
    });

    return true;
  }, [archivedLeads, toast]);

  // Archive multiple leads
  const archiveMultiple = useCallback(async (leadIds: string[]) => {
    if (leadIds.length === 0) return false;

    const { error } = await supabase
      .from('outreach_leads')
      .update({ is_archived: true })
      .in('id', leadIds);

    if (error) {
      toast({
        title: 'Error archiving leads',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

    // Move leads from active to archived
    const archivedItems = leads.filter((l) => leadIds.includes(l.id));
    setLeads((prev) => prev.filter((l) => !leadIds.includes(l.id)));
    setArchivedLeads((prev) => [...archivedItems.map(l => ({ ...l, is_archived: true })), ...prev]);
    
    toast({
      title: 'Leads archived',
      description: `${leadIds.length} leads moved to archive.`,
    });

    return true;
  }, [leads, toast]);

  // Delete multiple leads
  const deleteMultiple = useCallback(async (leadIds: string[]) => {
    if (leadIds.length === 0) return false;

    const { error } = await supabase
      .from('outreach_leads')
      .delete()
      .in('id', leadIds);

    if (error) {
      toast({
        title: 'Error removing leads',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

    setLeads((prev) => prev.filter((l) => !leadIds.includes(l.id)));
    setArchivedLeads((prev) => prev.filter((l) => !leadIds.includes(l.id)));
    
    toast({
      title: 'Leads removed',
      description: `${leadIds.length} leads removed from CRM.`,
    });

    return true;
  }, [toast]);

  // Unarchive multiple leads
  const unarchiveMultiple = useCallback(async (leadIds: string[]) => {
    if (leadIds.length === 0) return false;

    const { error } = await supabase
      .from('outreach_leads')
      .update({ is_archived: false })
      .in('id', leadIds);

    if (error) {
      toast({
        title: 'Error unarchiving leads',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

    // Move leads from archived to active
    const unarchivedItems = archivedLeads.filter((l) => leadIds.includes(l.id));
    setArchivedLeads((prev) => prev.filter((l) => !leadIds.includes(l.id)));
    setLeads((prev) => [...unarchivedItems.map(l => ({ ...l, is_archived: false })), ...prev]);
    
    toast({
      title: 'Leads restored',
      description: `${leadIds.length} leads moved to active list.`,
    });

    return true;
  }, [archivedLeads, toast]);

  // Mark a lead as interested (adds to Interested page while keeping in CRM)
  const markAsInterested = useCallback(async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId) || archivedLeads.find((l) => l.id === leadId);
    if (!lead) return false;

    const { error } = await supabase
      .from('outreach_leads')
      .update({ 
        is_potential_work: true,
        status: 'interested' as LeadStatus,
      })
      .eq('id', leadId);

    if (error) {
      toast({
        title: 'Error updating lead',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

    // Update local state
    const updateLeadFn = (l: OutreachLead): OutreachLead => 
      l.id === leadId ? { ...l, is_potential_work: true, status: 'interested' as LeadStatus } : l;
    
    setLeads((prev) => prev.map(updateLeadFn));
    setArchivedLeads((prev) => prev.map(updateLeadFn));
    
    toast({
      title: 'Added to Interested',
      description: `${lead.business_name} added to your Interested pipeline.`,
    });

    // Log activity
    if (user) {
      await supabase.from('outreach_activities').insert({
        lead_id: leadId,
        user_id: user.id,
        activity_type: 'interested',
        description: 'Marked as interested and added to pipeline',
      });
    }

    return true;
  }, [leads, archivedLeads, user, toast]);

  // Mark multiple leads as interested
  const markMultipleAsInterested = useCallback(async (leadIds: string[]) => {
    if (leadIds.length === 0) return false;

    const { error } = await supabase
      .from('outreach_leads')
      .update({ 
        is_potential_work: true,
        status: 'interested' as LeadStatus,
      })
      .in('id', leadIds);

    if (error) {
      toast({
        title: 'Error updating leads',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

    // Update local state
    const updateLeadFn = (l: OutreachLead): OutreachLead => 
      leadIds.includes(l.id) ? { ...l, is_potential_work: true, status: 'interested' as LeadStatus } : l;
    
    setLeads((prev) => prev.map(updateLeadFn));
    setArchivedLeads((prev) => prev.map(updateLeadFn));
    
    toast({
      title: 'Added to Interested',
      description: `${leadIds.length} leads added to your Interested pipeline.`,
    });

    return true;
  }, [toast]);

  // Search archived leads by phone number
  const searchArchivedByPhone = useCallback(async (phoneQuery: string): Promise<OutreachLead[]> => {
    if (!user || !phoneQuery.trim()) return [];

    // Strip non-digits for search
    const digitsOnly = phoneQuery.replace(/\D/g, '');
    if (digitsOnly.length < 3) return [];

    const { data, error } = await supabase
      .from('outreach_leads')
      .select('*')
      .eq('is_archived', true)
      .ilike('phone', `%${digitsOnly}%`);

    if (error) {
      console.error('Error searching archived leads:', error);
      return [];
    }

    return (data || []) as OutreachLead[];
  }, [user]);

   // Bulk lookup phone numbers for leads missing them
   const bulkLookupPhones = useCallback(async (leadIds?: string[]): Promise<{ updated: number; total: number }> => {
     if (!user) return { updated: 0, total: 0 };
 
     // If no specific IDs provided, get all leads missing phone numbers
     const idsToLookup = leadIds || [...leads, ...archivedLeads]
       .filter(l => !l.phone)
       .map(l => l.id);
 
     if (idsToLookup.length === 0) {
       toast({
         title: 'No leads to update',
         description: 'All leads already have phone numbers.',
       });
       return { updated: 0, total: 0 };
     }
 
     toast({
       title: 'Looking up phone numbers',
       description: `Searching for ${idsToLookup.length} businesses...`,
     });
 
     try {
       const { data, error } = await supabase.functions.invoke('lookup-phones', {
         body: { leadIds: idsToLookup },
       });
 
       if (error) throw error;
 
       // Refresh leads to get updated phone numbers
       await fetchLeads();
 
       toast({
         title: 'Phone lookup complete',
         description: `Found ${data.updated} of ${data.total} phone numbers.`,
       });
 
       return { updated: data.updated, total: data.total };
     } catch (error) {
       console.error('Bulk phone lookup error:', error);
       toast({
         title: 'Lookup failed',
         description: 'Could not complete phone number lookup.',
         variant: 'destructive',
       });
       return { updated: 0, total: 0 };
     }
   }, [user, leads, archivedLeads, fetchLeads, toast]);

  // Bulk import leads from CSV
  const bulkImportLeads = useCallback(async (
    leadsToImport: Array<Partial<OutreachLead>>,
    country: Country = 'UK'
  ) => {
    if (!user) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in to import leads.',
        variant: 'destructive',
      });
      return { imported: 0, skipped: 0 };
    }

    let imported = 0;
    let skipped = 0;

    for (const lead of leadsToImport) {
      if (!lead.business_name) {
        skipped++;
        continue;
      }

      // Check for existing lead
      const { data: existing } = await supabase
        .from('outreach_leads')
        .select('id')
        .eq('business_name', lead.business_name)
        .limit(1)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const { error } = await supabase
        .from('outreach_leads')
        .insert({
          user_id: user.id,
          business_name: lead.business_name,
          phone: lead.phone || null,
          email: lead.email || null,
          google_maps_url: lead.google_maps_url || null,
          address: lead.address || null,
          category: lead.category || null,
          notes: lead.notes || null,
          status: 'not_contacted' as LeadStatus,
          next_action: 'none' as NextActionType,
          next_action_date: null,
          country: lead.country || country,
          list_type: 'imported',
        });

      if (!error) {
        imported++;
        
        // Also add to history
        await supabase.from('outreach_history').insert({
          user_id: user.id,
          business_name: lead.business_name,
          google_maps_url: lead.google_maps_url || null,
          phone: lead.phone || null,
          country: lead.country || country,
        });
      } else {
        skipped++;
      }
    }

    await fetchLeads();
    
    toast({
      title: 'Import complete',
      description: `Imported ${imported} leads. ${skipped > 0 ? `${skipped} skipped.` : ''}`,
    });

    return { imported, skipped };
  }, [user, fetchLeads, toast]);
 
  return {
    leads,
    archivedLeads,
    activities,
    isLoading,
    addLead,
    updateLead,
    updateStatus,
    updateNextAction,
    updateNotes,
    deleteLead,
    deleteMultiple,
    deleteAllLeads,
    archiveLead,
    unarchiveLead,
    archiveMultiple,
    unarchiveMultiple,
    markAsInterested,
    markMultipleAsInterested,
    searchArchivedByPhone,
    fetchActivities,
    logActivity,
    isInOutreach,
    bulkLookupPhones,
    bulkImportLeads,
    fetchLeads,
    refetch: fetchLeads,
  };
}
