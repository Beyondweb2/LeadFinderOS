import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead, OutreachActivity, LeadStatus, NextActionType, Country, ListType } from '@/types/outreach';
import type { Lead } from '@/types/lead';
import { recordClaimOnAdd, markClaimContacted } from '@/lib/claims';

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
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [phoneFetchStatus, setPhoneFetchStatus] = useState<Record<string, PhoneFetchStatus>>({});
  const { toast } = useToast();
  const { user } = useAuth();
  // Stable user ID ref to prevent refetches on auth token refreshes
  const userIdRef = useRef<string | null>(null);

  // Parallel phone fetch queue — processes up to 3 leads concurrently for speed
  const phoneQueueRef = useRef<Array<{ outreachLeadId: string; placeId: string; businessName: string }>>([]);
  const isProcessingQueueRef = useRef(false);
  const queuedPlaceIdsRef = useRef<Set<string>>(new Set()); // Dedup: prevent same place_id being queued twice per session
  const CONCURRENCY = 3;

  const removeLeadNoPhone = useCallback(async (outreachLeadId: string, businessName: string) => {
    // Delete the lead from the database
    await supabase.from('outreach_leads').delete().eq('id', outreachLeadId);
    // Remove from local state
    setLeads(prev => prev.filter(l => l.id !== outreachLeadId));
    setArchivedLeads(prev => prev.filter(l => l.id !== outreachLeadId));
    // Clean up outreach_history so business can be re-added later
    await supabase.from('outreach_history').delete().eq('business_name', businessName);
    setOutreachHistory(prev => prev.filter(h => h.business_name !== businessName));
    // Notify user
    toast({
      title: `${businessName}`,
      description: 'No phone number found — not added.',
      variant: 'destructive',
    });
    // Notify walkthrough to decrement CRM add count
    window.dispatchEvent(new CustomEvent('crm-lead-purged'));
  }, []);

  const fetchOnePhone = useCallback(async (item: { outreachLeadId: string; placeId: string; businessName: string }) => {
    setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: 'pending' }));
    try {
      const { data: details, error: detailsError } = await supabase.functions.invoke('google-place-details', {
        body: { placeId: item.placeId, triggerSource: 'add_to_crm' },
      });

      if (detailsError || !details) {
        console.log('Phone enrichment returned no data for', item.businessName);
        // Keep the lead in the CRM. User can manually retry.
        setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: 'failed' }));
        return;
      }

      if (!details.phone) {
        // Enrichment succeeded but Google has no phone for this business.
        // Do NOT delete the lead — deleting forces re-enrichment next time the
        // same business appears in a search. Leave it; user can act on it.
        const updates: Record<string, string | null> = {};
        if (details.website) updates.website = details.website;
        if (Object.keys(updates).length > 0) {
          const { data: updated } = await supabase
            .from('outreach_leads')
            .update(updates)
            .eq('id', item.outreachLeadId)
            .select()
            .single();
          if (updated) {
            setLeads(prev => prev.map(l => l.id === item.outreachLeadId ? (updated as OutreachLead) : l));
          }
        }
        setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: 'no_phone' }));
        return;
      }

      const updates: Record<string, string | null> = { phone: details.phone };
      if (details.website) updates.website = details.website;

      const { data: updated } = await supabase
        .from('outreach_leads')
        .update(updates)
        .eq('id', item.outreachLeadId)
        .select()
        .single();

      if (updated) {
        setLeads(prev => prev.map(l => l.id === item.outreachLeadId ? (updated as OutreachLead) : l));
      }
      setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: 'success' }));
    } catch (e) {
      console.error('Phone enrichment failed (non-blocking):', e);
      setPhoneFetchStatus(prev => ({ ...prev, [item.outreachLeadId]: 'failed' }));
    }
  }, []);

  const processPhoneQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    while (phoneQueueRef.current.length > 0) {
      const batch = phoneQueueRef.current.splice(0, CONCURRENCY);
      await Promise.all(batch.map(fetchOnePhone));
    }

    isProcessingQueueRef.current = false;
  }, [fetchOnePhone]);

  const enqueuePhoneFetch = useCallback((outreachLeadId: string, placeId: string, businessName: string) => {
    // Dedup: skip if this place_id has already been queued this session
    if (queuedPlaceIdsRef.current.has(placeId)) {
      console.log(`Skipping duplicate phone fetch for place_id ${placeId} (${businessName})`);
      return;
    }
    queuedPlaceIdsRef.current.add(placeId);
    setPhoneFetchStatus(prev => ({ ...prev, [outreachLeadId]: 'pending' }));
    phoneQueueRef.current.push({ outreachLeadId, placeId, businessName });
    processPhoneQueue();
  }, [processPhoneQueue]);

  const fetchLeads = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    
    // Only show loading spinner on initial load
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }
    
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

    hasLoadedOnceRef.current = true;
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
  }, []);

  const fetchOutreachHistory = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;

    const { data, error } = await supabase
      .from('outreach_history')
      .select('business_name, google_maps_url');

    if (error) {
      console.error('Error fetching outreach history:', error);
      return;
    }

    setOutreachHistory(data as OutreachHistoryEntry[]);
  }, []);

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

  // Only refetch when user ID changes (login/logout), not on token refresh
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (currentUserId === userIdRef.current) return;
    userIdRef.current = currentUserId;
    if (currentUserId) {
      fetchLeads();
      fetchOutreachHistory();
    }
  }, [user?.id, fetchLeads, fetchOutreachHistory]);

  // Resolve loading immediately for unauthenticated (ad-entry) users
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
    }
  }, [user]);

  // REMOVED: Auto-enrichment on page load was removed to prevent unnecessary Google Place Details API calls.
  // Phone enrichment now only happens when: (1) lead first added to CRM, (2) manual retry, (3) bulk recover phones.

  // Retry phone fetch for a lead that failed — uses forceRefresh to bypass cache
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
    
    // Direct call with forceRefresh instead of queue (user-initiated retry)
    setPhoneFetchStatus(prev => ({ ...prev, [outreachLeadId]: 'pending' }));
    try {
      const { data: details, error: detailsError } = await supabase.functions.invoke('google-place-details', {
        body: { placeId, forceRefresh: true, triggerSource: 'manual_retry' },
      });

      if (detailsError || !details) {
        setPhoneFetchStatus(prev => ({ ...prev, [outreachLeadId]: 'failed' }));
        toast({ title: 'Retry failed', description: 'Could not fetch phone number.', variant: 'destructive' });
        return;
      }

      if (!details.phone) {
        // No phone available even after force-refresh. Keep the lead.
        setPhoneFetchStatus(prev => ({ ...prev, [outreachLeadId]: 'no_phone' }));
        toast({ title: 'No phone available', description: 'Google has no phone number for this business.' });
        return;
      }

      const updates: Record<string, string | null> = { phone: details.phone };
      if (details.website) updates.website = details.website;

      const { data: updated } = await supabase
        .from('outreach_leads')
        .update(updates)
        .eq('id', outreachLeadId)
        .select()
        .single();

      if (updated) {
        setLeads(prev => prev.map(l => l.id === outreachLeadId ? (updated as OutreachLead) : l));
        setArchivedLeads(prev => prev.map(l => l.id === outreachLeadId ? (updated as OutreachLead) : l));
      }

      setPhoneFetchStatus(prev => ({ ...prev, [outreachLeadId]: 'success' }));
    } catch (e) {
      console.error('Retry phone fetch failed:', e);
      setPhoneFetchStatus(prev => ({ ...prev, [outreachLeadId]: 'failed' }));
    }
  }, [leads, archivedLeads, removeLeadNoPhone]);

  const addLead = useCallback(async (lead: Lead, country: Country = 'UK', listType: ListType = 'no_website', campaignId: string | null = null, enrichment?: Partial<OutreachLead> | null, silent = false) => {
    if (!user) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in to add leads.',
        variant: 'destructive',
      });
      return null;
    }

    // Fast local-only duplicate check (no DB round-trips)
    const inHistory = outreachHistory.some(
      (h) => h.business_name === lead.name || (lead.googleMapsUrl && h.google_maps_url === lead.googleMapsUrl)
    );
    if (inHistory) {
      if (!silent) toast({
        title: 'Previously added',
        description: `${lead.name} was already added to your outreach list before.`,
        variant: 'destructive',
      });
      return null;
    }

    const inActive = leads.some(
      (l) => l.business_name === lead.name || (lead.googleMapsUrl && l.google_maps_url === lead.googleMapsUrl)
    );
    const inArchived = archivedLeads.some(
      (l) => l.business_name === lead.name || (lead.googleMapsUrl && l.google_maps_url === lead.googleMapsUrl)
    );
    if (inActive || inArchived) {
      const message = inArchived
        ? `${lead.name} is in your archive.`
        : `${lead.name} is already in your outreach list.`;
      if (!silent) toast({
        title: 'Previously added',
        description: message,
        variant: 'destructive',
      });
      return null;
    }

    // Carry over any contact enrichment already found at search time. The
    // enrich-lead cache is keyed by place_id, so these values are free here — no
    // new paid call is made on add. Only copy fields the engine actually set.
    const carriedEnrichment: Partial<OutreachLead> = {};
    if (enrichment) {
      const carryKeys: (keyof OutreachLead)[] = [
        'email', 'email_status', 'email_method', 'email_last_checked_at',
        'facebook_url', 'facebook_status', 'facebook_method', 'facebook_last_checked_at',
        'instagram_url', 'instagram_status', 'instagram_method', 'instagram_last_checked_at',
        'enrichment_source',
      ];
      for (const k of carryKeys) {
        if (enrichment[k] != null) (carriedEnrichment as any)[k] = enrichment[k];
      }
    }

    const { data, error } = await supabase
      .from('outreach_leads')
      .insert({
        user_id: user.id,
        business_name: lead.name,
        // Save the phone we already have from the search result. This avoids
        // a Place Details call entirely when the search already returned one.
        phone: lead.phone || null,
        email: null,
        google_maps_url: lead.googleMapsUrl,
        address: lead.address || null,
        category: lead.category || null,
        website: lead.websiteUrl || null,
        status: 'not_contacted' as LeadStatus,
        next_action: 'none' as NextActionType,
        next_action_date: null,
        country,
        list_type: listType,
        campaign_id: campaignId,
        place_id: lead.id || null,
        ...carriedEnrichment,
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

    // Update local history cache immediately
    setOutreachHistory((prev) => [...prev, { 
      business_name: lead.name, 
       google_maps_url: lead.googleMapsUrl || null,
       phone: lead.phone || null,
    }]);

    // Fire-and-forget: history insert, activity log, usage tracking (non-blocking)
    Promise.resolve(supabase.from('outreach_history').insert({
      user_id: user.id,
      business_name: lead.name,
      google_maps_url: lead.googleMapsUrl || null,
      country,
       phone: lead.phone || null,
    })).catch(() => {});

    logActivity(newLead.id, 'added', `Added ${lead.name} to outreach list`).then(() => {}).catch(() => {});

    // Team claim registry (non-blocking): record that this user claimed this
    // business in the active campaign. Holds no sensitive data.
    recordClaimOnAdd({
      userId: user.id,
      campaignId,
      placeId: lead.id || null,
      googleMapsUrl: lead.googleMapsUrl || null,
      businessName: lead.name,
    });

    Promise.resolve(supabase.rpc('log_usage_event', {
      p_event_type: 'business_added',
      p_meta: {
        place_id: lead.id || null,
        business_name: lead.name,
        country,
        source: 'add-business',
      },
    })).catch(() => {});

    // Lead added — no toast

    // Skip enrichment entirely when the search result already gave us a phone.
    // Otherwise enqueue a single Place Details lookup (server-side cache + single-flight).
    if (lead.id && !lead.phone) {
      enqueuePhoneFetch(newLead.id, lead.id, lead.name);
    } else if (lead.id && lead.phone) {
      console.log(`Skipping enrichment for ${lead.name}: phone already present from search result`);
    }

    return newLead;
  }, [user]);

  const updateLead = useCallback(async (
    leadId: string,
    updates: Partial<Pick<OutreachLead, 'status' | 'next_action' | 'next_action_date' | 'notes' | 'email' | 'business_name' | 'amount_paid' | 'paid_for' | 'payment_date' | 'project_duration' | 'next_checkin_date' | 'checkin_notes' | 'image_url' | 'facebook_url' | 'facebook_confidence' | 'facebook_method' | 'facebook_last_checked_at' | 'email_status' | 'email_method' | 'email_last_checked_at' | 'facebook_status' | 'instagram_url' | 'instagram_status' | 'instagram_method' | 'instagram_last_checked_at' | 'enrichment_source' | 'contact_method' | 'whatsapp_status' | 'whatsapp_checked_at' | 'line_type' | 'line_type_checked_at' | 'outreach_attempts' | 'last_outreach_attempt_at' | 'is_potential_work' | 'potential_revenue' | 'contact_name' | 'website' | 'services_included' | 'project_overview' | 'project_value' | 'project_status' | 'delivery_notes'>>
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
  }, []);

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
  }, [leads, archivedLeads]);

  const updateStatus = useCallback(async (leadId: string, status: LeadStatus) => {
    const lead = leads.find((l) => l.id === leadId);
    const archivedLead = archivedLeads.find((l) => l.id === leadId);
    const targetLead = lead || archivedLead;
    
    // Capture previous status BEFORE the update for outreach tracking
    const previousStatus = targetLead?.status;
    
    // If new status is an outreach/contact method, persist it as contact_method
    const CONTACT_METHOD_STATUSES: LeadStatus[] = ['whatsapp', 'sms', 'facebook_msg', 'sent_initial_text', 'sent_voice_note'];
    const updates: Partial<OutreachLead> = { status };
    if (CONTACT_METHOD_STATUSES.includes(status)) {
      updates.contact_method = status;
    }
    // Marking a lead "Replied" ALWAYS queues a same-day "Send Draft" next action,
    // overwriting any existing one — so a reply never sits without a follow-up step.
    if (status === 'replied') {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      updates.next_action = 'send_draft';
      updates.next_action_date = today;
    }
    // Marking a lead "Site Sent" queues a Follow-up 3 days out so it surfaces as due
    // in the pipeline. Mirrors Replied→Send Draft, but NON-destructive: only set it
    // when there's no next action already (never clobber a manual one).
    if (status === 'site_sent') {
      const existingAction = targetLead?.next_action;
      if (!existingAction || existingAction === 'none') {
        const due = new Date();
        due.setDate(due.getDate() + 3);
        const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
        updates.next_action = 'follow_up';
        updates.next_action_date = dueStr;
      }
    }
    // Not Interested = a dead prospect → untrack it so the Tracked filter stays
    // clean (only live prospects). Status stays 'not_interested', so the dashboard
    // Sent/Replied reconciliation is unchanged. Covers already-archived leads too,
    // since updateLead routes local state by is_archived.
    if (status === 'not_interested') {
      updates.is_potential_work = false;
    }

    const result = await updateLead(leadId, updates);
    
    // Log activity inline (avoid dependency issue with logActivity)
    if (result && targetLead && user) {
      try {
        await supabase.from('outreach_activities').insert({
          lead_id: leadId,
          user_id: user.id,
          activity_type: 'status_change',
          description: `Status changed to ${status.replace('_', ' ')}`,
        });
      } catch (e) {
        console.error('Failed to log activity (non-blocking):', e);
      }
      // Notify demo checklist that status was changed
      window.dispatchEvent(new CustomEvent('demo-checklist-status-change'));
      
      // Auto-increment messages_sent if transitioning FROM non-outreach TO outreach status
      const wasOutreach = previousStatus ? OUTREACH_STATUSES.includes(previousStatus) : false;
      const isNowOutreach = OUTREACH_STATUSES.includes(status);

      // Team claim registry (non-blocking): mark the claim contacted once this
      // lead reaches an outreach status, scoped to the lead's campaign.
      if (isNowOutreach) {
        markClaimContacted({
          userId: user.id,
          campaignId: targetLead.campaign_id ?? null,
          placeId: (targetLead as any).place_id ?? null,
          googleMapsUrl: targetLead.google_maps_url ?? null,
          businessName: targetLead.business_name,
        });
      }

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
      try {
        const { error } = await supabase
          .from('outreach_leads')
          .update({ is_archived: true })
          .eq('id', leadId);

        if (!error) {
          setLeads((prev) => prev.filter((l) => l.id !== leadId));
          setArchivedLeads((prev) => [{ ...lead, is_archived: true, is_potential_work: false, status: 'not_interested' }, ...prev]);
        }
      } catch (e) {
        console.error('Failed to auto-archive (non-blocking):', e);
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
    if (nextAction === 'none') {
      updates.next_action_date = null;
    } else if (nextActionDate) {
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
 }, [user, leads]);

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
  }, []);

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
  }, [archivedLeads]);

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
  }, [leads]);

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
  }, []);

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
  }, [archivedLeads]);

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

    // Log activity (non-blocking)
    if (user) {
      try {
        await supabase.from('outreach_activities').insert({
          lead_id: leadId,
          user_id: user.id,
          activity_type: 'interested',
          description: 'Marked as interested and added to Track Leads',
        });
      } catch (e) {
        console.error('Failed to log interested activity (non-blocking):', e);
      }
    }

    return true;
  }, [leads, archivedLeads, user]);

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
  }, []);

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

   // Bulk lookup phone numbers — uses google-place-details with concurrency-3
   const bulkLookupPhones = useCallback(async (
     leadIds?: string[],
     onProgress?: (current: number, total: number) => void
   ): Promise<{ updated: number; skipped: number; failed: number; total: number }> => {
     if (!user) return { updated: 0, skipped: 0, failed: 0, total: 0 };

     // Collect target leads
     const allTargetLeads = leadIds
       ? [...leads, ...archivedLeads].filter(l => leadIds.includes(l.id))
       : [...leads, ...archivedLeads];

     const eligible: typeof allTargetLeads = [];
     let skippedCount = 0;

     for (const lead of allTargetLeads) {
       if (lead.phone) {
         skippedCount++;
         continue;
       }
       const placeId = (lead as any).place_id;
       if (!placeId) {
         skippedCount++;
         console.log(`Skipped lead ${lead.id} (${lead.business_name}): no place_id`);
         continue;
       }
       eligible.push(lead);
     }

     const total = allTargetLeads.length;
     if (eligible.length === 0) {
       onProgress?.(total, total);
       return { updated: 0, skipped: skippedCount, failed: 0, total };
     }

     let updatedCount = 0;
     let failedCount = 0;
     let processed = skippedCount; // already-skipped leads count as processed for progress

     // Concurrency-3 pool
     const queue = [...eligible];
     const processOne = async () => {
       while (queue.length > 0) {
         const lead = queue.shift();
         if (!lead) break;
         const placeId = (lead as any).place_id;
         try {
           const { data: details, error: detailsError } = await supabase.functions.invoke('google-place-details', {
              body: { placeId, triggerSource: 'bulk_recover' },
           });

           if (detailsError) {
             failedCount++;
             console.error(`Bulk enrich failed for ${lead.business_name}:`, detailsError);
           } else if (details?.phone) {
             // Phone found — update DB
             const updates: Record<string, string | null> = { phone: details.phone };
             if (details.address) updates.address = details.address;
             if (details.category) updates.category = details.category;

             const { error: updateError } = await supabase
               .from('outreach_leads')
               .update(updates)
               .eq('id', lead.id);

             if (updateError) {
               failedCount++;
               console.error(`DB update failed for ${lead.business_name}:`, updateError);
             } else {
               updatedCount++;
             }
           } else {
             // No phone found — count as skipped, do NOT remove lead
             skippedCount++;
           }
         } catch (e) {
           failedCount++;
           console.error(`Bulk enrich error for ${lead.business_name}:`, e);
         }
         processed++;
         onProgress?.(processed, total);
       }
     };

     // Start CONCURRENCY workers
     await Promise.all(Array.from({ length: CONCURRENCY }, () => processOne()));

     // Refresh state once at the end
     await fetchLeads();

     return { updated: updatedCount, skipped: skippedCount, failed: failedCount, total };
   }, [user, leads, archivedLeads, fetchLeads]);

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
  }, [user, fetchLeads]);
 
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
