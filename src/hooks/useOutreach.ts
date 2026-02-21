import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead, OutreachActivity, LeadStatus, NextActionType, Country, ListType } from '@/types/outreach';
import type { Lead } from '@/types/lead';

// Statuses that represent an outreach attempt (message/call sent)
const OUTREACH_STATUSES: LeadStatus[] = [
  'sms',
  'whatsapp',
  'facebook_msg',
  'contacted',        // Called
  'sent_initial_text',
  'sent_voice_note',
];

interface OutreachHistoryEntry {
  business_name: string;
  google_maps_url: string | null;
   phone: string | null;
}

export type PhoneFetchStatus = 'pending' | 'success' | 'no_phone' | 'failed';

export function useOutreach() {
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [archivedLeads, setArchivedLeads] = useState<OutreachLead[]>([]);
  const [activities, setActivities] = useState<OutreachActivity[]>([]);
  const [outreachHistory, setOutreachHistory] = useState<OutreachHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [phoneFetchStatus, setPhoneFetchStatus] = useState<Record<string, PhoneFetchStatus>>({});
  const { toast } = useToast();
  const { user } = useAuth();

  // Sequential phone fetch queue to prevent race conditions when adding multiple leads quickly
  const phoneQueueRef = useRef<Array<{ outreachLeadId: string; placeId: string; businessName: string }>>([]);
  const isProcessingQueueRef = useRef(false);

  const processPhoneQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    while (phoneQueueRef.current.length > 0) {
      const item = phoneQueueRef.current.shift()!;
      setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: 'pending' }));
      try {
        const { data: details, error: detailsError } = await supabase.functions.invoke('google-place-details', {
          body: { placeId: item.placeId },
        });

        if (detailsError || !details) {
          console.log('Phone enrichment returned no data for', item.businessName);
          setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: 'failed' }));
        } else {
          const updates: Record<string, string | null> = {};
          if (details.phone) updates.phone = details.phone;
          if (details.address) updates.address = details.address;
          if (details.category) updates.category = details.category;

          if (Object.keys(updates).length > 0) {
            const { data: updated } = await supabase
              .from('outreach_leads')
              .update(updates)
              .eq('id', item.outreachLeadId)
              .select()
              .single();

            if (updated) {
              setLeads(prev => prev.map(l => l.id === item.outreachLeadId ? (updated as OutreachLead) : l));
              setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: details.phone ? 'success' : 'no_phone' }));
            } else {
              setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: details.phone ? 'success' : 'no_phone' }));
            }
          } else {
            setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: details.phone ? 'success' : 'no_phone' }));
          }
        }
      } catch (e) {
        console.error('Phone enrichment failed (non-blocking):', e);
        setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: 'failed' }));
      }

      // Small delay between requests to avoid overwhelming the API
      if (phoneQueueRef.current.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    isProcessingQueueRef.current = false;
  }, []);

  const enqueuePhoneFetch = useCallback((outreachLeadId: string, placeId: string, businessName: string) => {
    setPhoneFetchStatus(prev => ({ ...prev, [outreachLeadId]: 'pending' }));
    phoneQueueRef.current.push({ outreachLeadId, placeId, businessName });
    processPhoneQueue();
  }, [processPhoneQueue]);

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

  // Retry phone fetch for a lead that failed
  const retryPhoneFetch = useCallback(async (outreachLeadId: string) => {
    const lead = leads.find(l => l.id === outreachLeadId) || archivedLeads.find(l => l.id === outreachLeadId);
    if (!lead) return;
    
    const placeId = (lead as any).place_id;
    if (!placeId) {
      toast({
        title: 'Retry not available',
        description: 'No Place ID stored for this lead.',
        variant: 'destructive',
      });
      return;
    }
    
    enqueuePhoneFetch(outreachLeadId, placeId, lead.business_name);
  }, [leads, archivedLeads, toast, enqueuePhoneFetch]);

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
        phone: null,
        email: null,
        google_maps_url: lead.googleMapsUrl,
        address: lead.address || null,
        category: lead.category || null,
        status: 'not_contacted' as LeadStatus,
        next_action: 'none' as NextActionType,
        next_action_date: null,
        country,
        list_type: listType,
        place_id: lead.id || null,
      } as any)
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

    // Notify bottom nav immediately
    window.dispatchEvent(new CustomEvent('crm-lead-added'));

    // If the user navigates straight to Outreach after adding, ensure they land on page 1.
    try {
      const key = user?.id ? `leadfinder_outreach_force_page1:${user.id}` : 'leadfinder_outreach_force_page1';
      sessionStorage.setItem(key, '1');
      localStorage.setItem(key, '1');
    } catch {
      // ignore
    }

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

    // Usage tracking (non-blocking)
    try {
      await supabase.rpc('log_usage_event', {
        p_event_type: 'business_added',
        p_meta: {
          place_id: lead.id || null,
          business_name: lead.name,
          country,
          source: 'add-business',
        },
      });
    } catch (e) {
      console.error('Usage tracking failed (non-blocking):', e);
    }

    // Lead added — no toast

    // Enrich lead with phone/address from Google Place Details (queued, sequential)
    if (lead.id) {
      enqueuePhoneFetch(newLead.id, lead.id, lead.name);
    }

    return newLead;
  }, [user, toast]);

  const updateLead = useCallback(async (
    leadId: string,
    updates: Partial<Pick<OutreachLead, 'status' | 'next_action' | 'next_action_date' | 'notes' | 'email' | 'business_name' | 'amount_paid' | 'paid_for' | 'payment_date' | 'project_duration' | 'next_checkin_date' | 'checkin_notes' | 'image_url' | 'facebook_url' | 'facebook_confidence' | 'facebook_method' | 'facebook_last_checked_at' | 'contact_method'>>
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
    
    // Lead removed — no toast

    return true;
  }, [leads, archivedLeads, toast]);

  const updateStatus = useCallback(async (leadId: string, status: LeadStatus) => {
    const lead = leads.find((l) => l.id === leadId);
    const archivedLead = archivedLeads.find((l) => l.id === leadId);
    const targetLead = lead || archivedLead;
    
    // Capture previous status BEFORE the update for outreach tracking
    const previousStatus = targetLead?.status;
    
    // If new status is an outreach/contact method, persist it as contact_method
    const CONTACT_METHOD_STATUSES: LeadStatus[] = ['whatsapp', 'sms', 'contacted', 'facebook_msg', 'sent_initial_text', 'sent_voice_note'];
    const updates: Partial<OutreachLead> = { status };
    if (CONTACT_METHOD_STATUSES.includes(status)) {
      updates.contact_method = status;
    }
    
    const result = await updateLead(leadId, updates);
    
    // Log activity inline (avoid dependency issue with logActivity)
    if (result && targetLead && user) {
      await supabase.from('outreach_activities').insert({
        lead_id: leadId,
        user_id: user.id,
        activity_type: 'status_change',
        description: `Status changed to ${status.replace('_', ' ')}`,
      });
      // Notify demo checklist that status was changed
      window.dispatchEvent(new CustomEvent('demo-checklist-status-change'));
      
      // Auto-increment messages_sent if transitioning FROM non-outreach TO outreach status
      const wasOutreach = previousStatus ? OUTREACH_STATUSES.includes(previousStatus) : false;
      const isNowOutreach = OUTREACH_STATUSES.includes(status);
      
      if (!wasOutreach && isNowOutreach) {
        try {
          await supabase.rpc('log_usage_event', {
            p_event_type: 'message_sent',
            p_meta: {
              lead_id: leadId,
              business_name: targetLead.business_name,
              status,
              source: 'status_change',
            },
          });
          // Emit event so dashboard/progress panels can update in real time
          window.dispatchEvent(new CustomEvent('outreach-message-sent'));
        } catch (e) {
          console.error('Failed to log message_sent (non-blocking):', e);
        }
      }
    }
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

  const updateBusinessName = useCallback(async (leadId: string, businessName: string) => {
    return updateLead(leadId, { business_name: businessName });
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
    
    // All archived — no toast

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
    
    // Lead archived — no toast

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
    
    // Lead restored — no toast

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
    
    // Leads archived — no toast

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
    
    // Leads removed — no toast

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
    
    // Leads restored — no toast

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

    // Update local state — preserve existing status
    const updateLeadFn = (l: OutreachLead): OutreachLead => 
      l.id === leadId ? { ...l, is_potential_work: true } : l;
    
    setLeads((prev) => prev.map(updateLeadFn));
    setArchivedLeads((prev) => prev.map(updateLeadFn));

    window.dispatchEvent(new CustomEvent('track-lead-added'));
    window.dispatchEvent(new CustomEvent('demo-checklist-track-pressed'));
    window.dispatchEvent(new CustomEvent('demo-checklist-status-change'));
    
    // Added to Track Leads — no toast

    // Log activity
    if (user) {
      await supabase.from('outreach_activities').insert({
        lead_id: leadId,
        user_id: user.id,
        activity_type: 'interested',
        description: 'Marked as interested and added to Track Leads',
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

    // Update local state — preserve existing status
    const updateLeadFn = (l: OutreachLead): OutreachLead => 
      leadIds.includes(l.id) ? { ...l, is_potential_work: true } : l;
    
    setLeads((prev) => prev.map(updateLeadFn));
    setArchivedLeads((prev) => prev.map(updateLeadFn));

    window.dispatchEvent(new CustomEvent('track-lead-added'));
    window.dispatchEvent(new CustomEvent('demo-checklist-track-pressed'));
    
    // Added to Track Leads — no toast

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
        // No leads to update — no toast
       return { updated: 0, total: 0 };
     }
 
      // Looking up phones — no toast
 
     try {
       const { data, error } = await supabase.functions.invoke('lookup-phones', {
         body: { leadIds: idsToLookup },
       });
 
       if (error) throw error;
 
       // Refresh leads to get updated phone numbers
       await fetchLeads();
 
        // Phone lookup complete — no toast
 
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
    
    // Import complete — no toast

    return { imported, skipped };
  }, [user, fetchLeads, toast]);
 
  const updateClientDetails = useCallback(async (
    leadId: string,
    details: Partial<Pick<OutreachLead, 'amount_paid' | 'paid_for' | 'payment_date' | 'project_duration' | 'next_checkin_date' | 'checkin_notes'>>
  ) => {
    return updateLead(leadId, details);
  }, [updateLead]);

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
    updateBusinessName,
    updateClientDetails,
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
    phoneFetchStatus,
    retryPhoneFetch,
  };
}
